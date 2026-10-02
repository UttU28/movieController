import asyncio
from pathlib import Path
import json
import os
import threading
import time
import urllib.request
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from selenium.common.exceptions import WebDriverException

load_dotenv()

from chrome_session import Busy, ChromeSession, PageUnresponsive
from jellyfin_remote import JellyfinRemote
from laptop import LaptopControl
from netflix_remote import NetflixRemote
import qr_page
import wallpapers
from prime_remote import PrimeRemote
from tab_keeper import TabKeeper
from youtube_remote import YouTubeRemote

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "9282"))
RELOAD = os.getenv("RELOAD", "false").lower() in ("1", "true", "yes")
LAUNCH_ON_START = os.getenv("LAUNCH_ON_START", "true").lower() in ("1", "true", "yes")
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "*").split(",")
    if origin.strip()
]

session = ChromeSession()
# Power + QR-page theme, shared by every phone and the QR page itself.
# power: "on" = phone shows the controls; "off" = playback paused, Chrome on
#        the QR page, phone shows only the power screen.
# mode:  QR page theme when idle: "night" (dark), "live".
# lastApp: the app last used. The single source of truth for every phone:
#        turning the remote on opens this app on the phone and its tab in Chrome.
MODE_STATE: dict = {"power": "off", "mode": "night", "lastApp": "youtube"}
MODES = ("night", "live")
APPS = ("youtube", "prime", "netflix", "jellyfin")
# The theme, last app, and last title survive restarts; power always starts
# "off" (Chrome opens on the Home screen).
LAST_APP_FILE = Path(__file__).resolve().parent / "last_app.txt"
LAST_TITLE_FILE = LAST_APP_FILE.with_name("last_title.txt")
try:
    _saved_app = LAST_APP_FILE.read_text(encoding="utf-8").strip()
    if _saved_app in APPS:
        MODE_STATE["lastApp"] = _saved_app
except OSError:
    pass
try:
    _saved_title = LAST_TITLE_FILE.read_text(encoding="utf-8").strip()
    if _saved_title:
        MODE_STATE["nowPlaying"] = _saved_title
except OSError:
    pass
THEME_FILE = Path(__file__).resolve().parent / "qr_theme.txt"
try:
    _saved_theme = THEME_FILE.read_text(encoding="utf-8").strip()
    if _saved_theme in MODES:
        MODE_STATE["mode"] = _saved_theme
    # (An old "day" setting falls back to the default, night.)
except OSError:
    pass

web_apps = {
    "youtube": YouTubeRemote(session),
    "prime": PrimeRemote(session),
    "netflix": NetflixRemote(session),
    "jellyfin": JellyfinRemote(session),
}
laptop = LaptopControl()

# The remote's Chrome tabs, in the order they're kept: (name, home URL, URL marker).
keeper = TabKeeper(session, [
    ("youtube", web_apps["youtube"].HOME_URL, "youtube.com"),
    ("prime", web_apps["prime"].HOME_URL, "primevideo.com"),
    ("netflix", web_apps["netflix"].HOME_URL, "netflix.com"),
    ("jellyfin", web_apps["jellyfin"].HOME_URL, web_apps["jellyfin"].HOSTS[0]),
    ("qr", f"http://127.0.0.1:{PORT}/qr", f":{PORT}/qr"),
])


@asynccontextmanager
async def lifespan(app):
    if LAUNCH_ON_START:
        threading.Thread(target=_safe_connect, daemon=True).start()
    keeper.start()
    yield
    keeper.stop()
    with session.lock:
        session.teardown()


def _wait_for_qr(timeout=20):
    url = f"http://127.0.0.1:{PORT}/qr"
    end = time.time() + timeout
    while time.time() < end:
        try:
            urllib.request.urlopen(url, timeout=1)
            return True
        except OSError:
            time.sleep(0.25)
    return False


def _safe_connect():
    qr_url = f"http://127.0.0.1:{PORT}/qr"
    qr_marker = f":{PORT}/qr"
    try:
        _wait_for_qr()
        with session.lock:
            session.connect(launch=True)
            keeper.check()
            session.use_tab((qr_marker,), qr_url)
            session.bring_to_front()
            # A window that just opened sometimes ignores the first fullscreen.
            session.ensure_tv_mode()
            if session.window_state() != "fullscreen":
                time.sleep(0.4)
                session.set_window_state("normal")
                session.ensure_tv_mode()
    except Exception as e:
        print(f"Chrome launch failed: {e}")
    print(f"Phone remote: {qr_page.remote_url()}  (QR code at {qr_url})")


app = FastAPI(lifespan=lifespan)


# Anything unexpected becomes one log line and a short message for the phone,
# never a crash or a wall of traceback.
@app.exception_handler(Busy)
async def _busy(request, exc):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.exception_handler(PageUnresponsive)
async def _unresponsive(request, exc):
    return JSONResponse(status_code=504, content={"detail": str(exc)})


@app.exception_handler(Exception)
async def _unexpected(request, exc):
    print(f"Error on {request.method} {request.url.path}: {type(exc).__name__}: {exc}")
    return JSONResponse(status_code=500, content={"detail": "Something went wrong. Try again."})

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=CORS_ORIGINS != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _web_app(name):
    remote = web_apps.get(name or "youtube")
    if remote is None:
        raise HTTPException(status_code=400, detail=f"Unknown app '{name}'")
    return remote


@app.get("/")
def health():
    return {"status": "ok", "message": "Remote API is running", "apps": ["laptop", *web_apps]}


@app.get("/qr", response_class=HTMLResponse)
def qr(mode: str = ""):
    """QR code for the phone remote's URL, in the selected theme. The page
    polls /mode and follows theme changes without reloading."""
    mode = mode if mode in MODES else MODE_STATE["mode"]
    return qr_page.render(mode, wallpapers.current(mode))


# One status check per app at a time. The phone asks every second; if a page
# is slow, extra requests get the last answer straight away instead of
# piling up behind it (which used to freeze everything, then burst).
_state_locks = {}
_last_state = {}


@app.get("/state")
def get_state(app: str = "youtube"):
    remote = _web_app(app)
    lock = _state_locks.setdefault(app, threading.Lock())
    if not lock.acquire(blocking=False):
        cached = _last_state.get(app)
        return {**cached, "stale": True} if cached else {"app": app, "browser": "busy"}
    try:
        state = remote.state()
    except Busy:
        cached = _last_state.get(app)
        return {**cached, "stale": True} if cached else {"app": app, "browser": "busy"}
    except PageUnresponsive as e:
        state = {"app": app, "browser": "error", "error": str(e)}
    finally:
        lock.release()
    _last_state[app] = state
    player = (state or {}).get("player") or {}
    title = player.get("title")
    if isinstance(title, str) and title.strip() and app == MODE_STATE.get("lastApp"):
        _remember_title(title)
    return state


@app.get("/screenshot")
def screenshot(app: str = "youtube"):
    png = _web_app(app).screenshot()
    if png is None:
        raise HTTPException(status_code=409, detail="Browser is not running")
    return Response(content=png, media_type="image/png", headers={"Cache-Control": "no-store"})


def _mode_state():
    tv = False
    try:
        with session.locked(timeout=2):
            if session.connect(launch=False):
                tv = session.tv_mode
    except Exception:
        pass  # Chrome busy or gone: power/theme are still right.
    paper = wallpapers.current(MODE_STATE["mode"]) or {}
    if not MODE_STATE.get("nowPlaying"):
        cached = _last_state.get(MODE_STATE.get("lastApp") or "") or {}
        title = ((cached.get("player") or {}).get("title") or "")
        if isinstance(title, str) and title.strip():
            _remember_title(title)
    return {**MODE_STATE, "tvMode": tv, "wallpaper": {k: paper.get(k) for k in ("id", "title", "video", "poster")}}


def _remember_title(title):
    """Keep the last playing title next to last_app.txt so a restart still shows it."""
    title = " ".join((title or "").split())
    if not title or title == MODE_STATE.get("nowPlaying"):
        return
    MODE_STATE["nowPlaying"] = title
    try:
        LAST_TITLE_FILE.write_text(title, encoding="utf-8")
    except OSError:
        pass


def _remember_app(name):
    if name not in APPS or MODE_STATE["lastApp"] == name:
        return
    MODE_STATE["lastApp"] = name
    MODE_STATE["nowPlaying"] = None
    try:
        LAST_APP_FILE.write_text(name, encoding="utf-8")
        LAST_TITLE_FILE.write_text("", encoding="utf-8")
    except OSError:
        pass


def _ensure_fullscreen():
    """Fullscreen the Chrome window unless it already is."""
    with session.locked(timeout=15):
        if not session.connect(launch=False):
            return
        try:
            session.ensure_tv_mode()
        except Exception as e:
            print(f"fullscreen failed: {e}")


def _resume_last_app():
    """Power on: Chrome leaves the Home screen for the last app's tab."""
    try:
        _web_app(MODE_STATE["lastApp"]).show()
    except Exception as e:
        print(f"open {MODE_STATE['lastApp']} failed: {e}")
    _ensure_fullscreen()
    laptop.settle()


@app.get("/mode")
def get_mode():
    """Power state, QR theme, and whether Chrome is fullscreen."""
    return _mode_state()


@app.post("/mode")
async def set_mode(request: Request):
    """Change the QR page theme only. Doesn't touch playback or tabs; the QR
    page picks the new theme up by itself."""
    data = await request.json()
    mode = (data.get("mode") or "night").lower()
    if mode not in MODES:
        raise HTTPException(status_code=400, detail=f"Unknown mode '{mode}'")
    MODE_STATE["mode"] = mode
    try:
        THEME_FILE.write_text(mode, encoding="utf-8")
    except OSError:
        pass
    return await asyncio.to_thread(_mode_state)


@app.get("/wallpapers")
def get_wallpapers():
    """The wallpaper collection and which one each mode uses."""
    return wallpapers.listing()


@app.post("/wallpapers")
async def add_wallpaper(request: Request):
    """Add a wallpaper from a wallspace.app page (or a direct .mp4 link) and
    use it for Live. Only the video link is saved; it's streamed, not
    downloaded."""
    data = await request.json()
    try:
        return await asyncio.to_thread(wallpapers.add, data.get("url"), data.get("mode") or "live")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/wallpapers/select")
async def select_wallpaper(request: Request):
    data = await request.json()
    try:
        return wallpapers.select(data.get("id"), data.get("mode") or "live")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/wallpapers/{item_id}")
def delete_wallpaper(item_id: str):
    try:
        return wallpapers.remove(item_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/power")
async def set_power(request: Request):
    """Power off: pause playback and switch Chrome to the QR page. Power on:
    Chrome opens the last app's tab (MODE_STATE["lastApp"]) and every phone
    shows that app's remote. Either way, Chrome goes fullscreen if it isn't."""
    data = await request.json()
    on = bool(data.get("on"))
    MODE_STATE["power"] = "on" if on else "off"
    if on:
        await asyncio.to_thread(_resume_last_app)
    else:
        # These drive Chrome (blocking), so keep them off the event loop.
        await asyncio.to_thread(_pause_all_playback)
        await asyncio.to_thread(_switch_to_qr)
    return await asyncio.to_thread(_mode_state)


@app.post("/tv")
def toggle_tv():
    """Toggle Chrome fullscreen without switching tabs (for the QR page)."""
    with session.locked(timeout=15):
        if not session.connect(launch=False):
            raise HTTPException(status_code=409, detail="Chrome isn't running")
        session.toggle_tv_mode()
    return _mode_state()


@app.post("/pause-all")
def pause_all():
    """Pause every streaming tab (no tab switching)."""
    _pause_all_playback()
    return {"status": "success"}


def _pause_other_web_apps(keep):
    """Stop playback on every streaming tab except `keep`. Does not change
    which tab Chrome is showing (pause runs over each tab's DevTools socket)."""
    with session.locked(timeout=15):
        if not session.connect(launch=False):
            return
        for name, remote in web_apps.items():
            if name == keep:
                continue
            try:
                remote.pause_playback()
            except Exception as e:
                print(f"pause {name} failed: {e}")


def _pause_all_playback():
    """Pause every streaming tab simultaneously."""
    with session.locked(timeout=15):
        if not session.connect(launch=False):
            return
        for name, remote in web_apps.items():
            try:
                remote.pause_playback()
            except Exception as e:
                print(f"pause {name} failed: {e}")


def _switch_to_qr():
    """Activate the QR tab (opening it if needed) and bring Chrome forward."""
    with session.locked(timeout=15):
        if not session.connect(launch=False):
            return
        qr_url = f"http://127.0.0.1:{PORT}/qr"
        try:
            session.use_tab((f":{PORT}/qr",), qr_url)
            # Reload so the screen always has the latest QR page (it may have
            # been open since before an update).
            session.driver.refresh()
            session.bring_to_front()
            session.ensure_tv_mode()
        except Exception as e:
            print(f"switch to QR failed: {e}")
    laptop.settle()


@app.post("/qr/reload")
async def reload_qr():
    """Reload the Home screen (QR) tab. Used from the power-off screen."""
    await asyncio.to_thread(_switch_to_qr)
    return {"status": "success"}


@app.post("/app")
async def switch_app(request: Request):
    """Called when you pick an app on the phone: Chrome switches to (or opens)
    that app's tab and comes to the front. Laptop needs nothing, and leaving
    a stream playing while you use the laptop remote is intentional."""
    data = await request.json()
    name = data.get("app")
    print(f"Switch app: {name}")
    if name == "laptop":
        return {"status": "success", "app": name}
    _remember_app(name)
    try:
        await asyncio.to_thread(_pause_other_web_apps, name)
        # show() drives Chrome (seconds); run it off the event loop so the
        # rest of the API keeps answering meanwhile.
        state = await asyncio.to_thread(_web_app(name).show)
        return {"status": "success", "app": name, "state": state}
    except WebDriverException as e:
        raise HTTPException(status_code=500, detail=str(e).splitlines()[0])
    finally:
        laptop.settle()


@app.post("/launch")
def launch(app: str = "youtube"):
    try:
        try:
            state = _web_app(app).show()
        except WebDriverException as e:
            raise HTTPException(status_code=500, detail=str(e).splitlines()[0])
        return {"status": "success", "state": state}
    finally:
        laptop.settle()


# Sync work runs in FastAPI's threadpool; ChromeSession serialises access to
# the single WebDriver session with a lock, LaptopControl does the same for
# pyautogui.
@app.post("/action")
async def button_action(request: Request):
    data = await request.json()
    print(f"Received action request: {data}")
    name = data.get("app") or "youtube"
    if name == "laptop":
        return await asyncio.to_thread(_run_laptop, data.get("action"), data.get("value"))
    return await asyncio.to_thread(_run_web, name, data.get("action"), data.get("value"))


@app.post("/search")
async def search_query(request: Request):
    data = await request.json()
    print(f"Received search request: {data}")
    return await asyncio.to_thread(_run_web, data.get("app") or "youtube", "search", data.get("query"))


def _run_web(name, action, value=None):
    remote = _web_app(name)
    try:
        try:
            out = remote.run(action, value)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Busy as e:
            raise HTTPException(status_code=503, detail=str(e))
        except PageUnresponsive as e:
            raise HTTPException(status_code=504, detail=str(e))
        except (WebDriverException, RuntimeError) as e:
            raise HTTPException(status_code=502, detail=(str(e).splitlines() or ["Chrome error"])[0])
        return {"status": "success", "app": name, "action": action, **out}
    finally:
        # Clicks land the real pointer on the video. Move it off once the
        # action is done, unless the laptop trackpad is in use.
        laptop.settle()


def _run_laptop(action, value=None):
    try:
        out = laptop.run(action, value)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "success", "app": "laptop", "action": action, **out}


@app.websocket("/ws/pointer")
async def pointer_socket(ws: WebSocket):
    """Trackpad stream: {"t":"m",dx,dy} move, {"t":"s",dy} scroll,
    {"t":"c",b,double} click, {"t":"d",on} drag (hold left button)."""
    await ws.accept()
    try:
        while True:
            msg = json.loads(await ws.receive_text())
            await asyncio.to_thread(laptop.handle_pointer, msg)
    except WebSocketDisconnect:
        pass
    finally:
        # Never leave the left button stuck down if the phone drops off.
        if laptop.dragging:
            await asyncio.to_thread(laptop.set_drag, False)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host=HOST, port=PORT, reload=RELOAD)
