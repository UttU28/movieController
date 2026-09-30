import asyncio
import json
import os
import threading
import time
import urllib.request
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from selenium.common.exceptions import WebDriverException

load_dotenv()

from chrome_session import ChromeSession
from jellyfin_remote import JellyfinRemote
from laptop import LaptopControl
from netflix_remote import NetflixRemote
import qr_page
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
    except Exception as e:
        print(f"Chrome launch failed: {e}")
    print(f"Phone remote: {qr_page.remote_url()}  (QR code at {qr_url})")


app = FastAPI(lifespan=lifespan)

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
def qr():
    """QR code for the phone remote's URL."""
    return qr_page.render()


@app.get("/state")
def get_state(app: str = "youtube"):
    return _web_app(app).state()


@app.get("/screenshot")
def screenshot(app: str = "youtube"):
    png = _web_app(app).screenshot()
    if png is None:
        raise HTTPException(status_code=409, detail="Browser is not running")
    return Response(content=png, media_type="image/png", headers={"Cache-Control": "no-store"})


def _pause_other_web_apps(keep):
    """Stop playback on every streaming tab except `keep`. Does not change
    which tab Chrome is showing (pause runs over each tab's DevTools socket)."""
    with session.lock:
        if not session.connect(launch=False):
            return
        for name, remote in web_apps.items():
            if name == keep:
                continue
            try:
                remote.pause_playback()
            except Exception as e:
                print(f"pause {name} failed: {e}")


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
    try:
        await asyncio.to_thread(_pause_other_web_apps, name)
        return {"status": "success", "app": name, "state": _web_app(name).show()}
    except WebDriverException as e:
        raise HTTPException(status_code=500, detail=str(e).splitlines()[0])


@app.post("/launch")
def launch(app: str = "youtube"):
    try:
        return {"status": "success", "state": _web_app(app).show()}
    except WebDriverException as e:
        raise HTTPException(status_code=500, detail=str(e).splitlines()[0])


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
        out = remote.run(action, value)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except WebDriverException as e:
        raise HTTPException(status_code=500, detail=str(e).splitlines()[0])
    return {"status": "success", "app": name, "action": action, **out}


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
