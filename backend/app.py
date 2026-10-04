import asyncio
import json
import os
import threading
import time
import urllib.request
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from selenium.common.exceptions import WebDriverException

load_dotenv()

# The modules below read their settings from .env when imported.
import qrPage
import wallpapers
from autoSkip import AutoSkip
from chromeSession import Busy, ChromeSession, PageUnresponsive, chromeRunning, dismissRestoreBubble
from cursorWarden import CursorWarden
from dataFiles import dataFile, readText, writeText
from jellyfinRemote import JellyfinRemote
from laptop import LaptopControl
from netflixRemote import NetflixRemote
from primeRemote import PrimeRemote
from sleepWatch import SleepWatch
from tabKeeper import TabKeeper
from tabPark import TabPark
from vikiRemote import VikiRemote
from youtubeRemote import YouTubeRemote


def envFlag(name, default):
    return os.getenv(name, default).lower() in ("1", "true", "yes")


HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "9282"))
RELOAD = envFlag("RELOAD", "false")
LAUNCH_ON_START = envFlag("LAUNCH_ON_START", "true")
AUTO_SKIP = envFlag("AUTO_SKIP", "true")
IDLE_SLEEP = envFlag("IDLE_SLEEP", "true")
IDLE_SLEEP_MINUTES = float(os.getenv("IDLE_SLEEP_MINUTES", "10") or 10)
CORS_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "*").split(",") if origin.strip()]

QR_URL = f"http://127.0.0.1:{PORT}/qr"
QR_MARKER = f":{PORT}/qr"
FRONTEND_CHECK_URL = f"http://127.0.0.1:{qrPage.FRONTEND_PORT}/"

MODES = qrPage.MODES
APPS = ("youtube", "prime", "netflix", "viki", "jellyfin")

# The theme, last app, last title and power survive restarts. Power is only
# put back when Chrome kept running through the restart (an update): the
# remote carries on exactly where it was. A fresh Chrome starts "off", on the
# Home screen.
LAST_APP_FILE = dataFile("lastApp.txt", "last_app.txt")
LAST_TITLE_FILE = dataFile("lastTitle.txt", "last_title.txt")
POWER_FILE = dataFile("power.txt")
THEME_FILE = dataFile("qrTheme.txt", "qr_theme.txt")

# Power + QR-page theme, shared by every phone and the QR page itself.
# power: "on" = phone shows the controls; "off" = the app tabs are parked
#        (memory freed, places remembered), Chrome on the QR page, phone
#        shows only the power screen.
# mode:  QR page theme when idle: "night" (dark), "live".
# lastApp: the app last used. The single source of truth for every phone:
#        turning the remote on opens this app on the phone and its tab in Chrome.
# nowPlaying: the last title playing in lastApp.
savedApp = readText(LAST_APP_FILE)
savedTheme = readText(THEME_FILE)  # (an old "day" setting falls back to night)
modeState = {
    "power": "off",
    "mode": savedTheme if savedTheme in MODES else "night",
    "lastApp": savedApp if savedApp in APPS else "youtube",
}
if readText(LAST_TITLE_FILE):
    modeState["nowPlaying"] = readText(LAST_TITLE_FILE)

session = ChromeSession()
webApps = {
    "youtube": YouTubeRemote(session),
    "prime": PrimeRemote(session),
    "netflix": NetflixRemote(session),
    "viki": VikiRemote(session),
    "jellyfin": JellyfinRemote(session),
}
laptop = LaptopControl()

# The remote's Chrome tabs, in the order they're kept: (name, home URL, URL marker).
keeper = TabKeeper(session, [
    ("youtube", webApps["youtube"].HOME_URL, "youtube.com"),
    ("prime", webApps["prime"].HOME_URL, "primevideo.com"),
    ("netflix", webApps["netflix"].HOME_URL, "netflix.com"),
    ("jellyfin", webApps["jellyfin"].HOME_URL, webApps["jellyfin"].HOSTS[0]),
    ("viki", webApps["viki"].HOME_URL, "viki.com"),
    ("qr", QR_URL, QR_MARKER),
])
# Powers tabs down to about:blank when they're not in use (power off, or
# another app is showing), remembering where to put them back.
park = TabPark(session, keeper)
# Draws a pointer ring in the app tabs for when the page (or fullscreen)
# hides the real cursor.
warden = CursorWarden(session, keeper)
# Clicks Skip (ads, intros, recaps...) as soon as a site offers it.
skipper = AutoSkip(session, keeper, enabled=AUTO_SKIP)
# Powers the remote off after IDLE_SLEEP_MINUTES with nothing playing and
# no command from any phone (see sleepWatch.py).
lastActivity = {"at": time.time()}
sleeper = SleepWatch(session, lastActivity, modeState, lambda: applyPower(False),
                    minutes=IDLE_SLEEP_MINUTES, enabled=IDLE_SLEEP)
beats = (keeper, warden, skipper, sleeper)

stopBubbleWatch = threading.Event()


def noteActivity():
    """Called by every command the phone sends. The status polls are not
    activity: the phone polls all the time, that's not you using it."""
    lastActivity["at"] = time.time()


def watchRestoreBubble():
    """The restore bubble can appear any time Chrome decides the last exit
    was a crash. Look for it every so often and close it."""
    while not stopBubbleWatch.wait(20):
        dismissRestoreBubble()


@asynccontextmanager
async def lifespan(_app):
    if chromeRunning():
        modeState["power"] = "on" if readText(POWER_FILE) == "on" else "off"
    if LAUNCH_ON_START:
        threading.Thread(target=startChrome, daemon=True).start()
    threading.Thread(target=watchRestoreBubble, daemon=True).start()
    for beat in beats:
        beat.start()
    yield
    stopBubbleWatch.set()
    for beat in beats:
        beat.stop()
    with session.lock:
        session.teardown()


def waitForQr(timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        try:
            urllib.request.urlopen(QR_URL, timeout=1)
            return True
        except OSError:
            time.sleep(0.25)
    return False


def startChrome():
    if chromeRunning():
        # The backend restarted under a running Chrome (e.g. an update): just
        # re-attach. Whatever is on screen, playing or paused, stays as it is,
        # and the phones keep the power state they had.
        try:
            with session.lock:
                session.connect(launch=False)
                keeper.check()
        except Exception as e:
            print(f"Re-attaching to Chrome failed: {e}")
        print(f"Re-attached to the running Chrome (remote is {modeState['power']}).")
        print(f"Phone remote: {qrPage.remoteUrl()}  (QR code at {QR_URL})")
        return
    writeText(POWER_FILE, "off")
    try:
        waitForQr()
        with session.lock:
            session.connect(launch=True)
            keeper.check()
            session.useTab((QR_MARKER,), QR_URL)
            session.bringToFront()
            # A window that just opened sometimes ignores the first fullscreen.
            session.ensureTvMode()
            if session.windowState() != "fullscreen":
                time.sleep(0.4)
                session.setWindowState("normal")
                session.ensureTvMode()
    except Exception as e:
        print(f"Chrome launch failed: {e}")
    # Off the Chrome lock: close the "Restore pages?" bubble if a crash left it up.
    dismissRestoreBubble()
    print(f"Phone remote: {qrPage.remoteUrl()}  (QR code at {QR_URL})")


app = FastAPI(lifespan=lifespan)


# Anything unexpected becomes one log line and a short message for the phone,
# never a crash or a wall of traceback.
@app.exception_handler(Busy)
async def onBusy(request, exc):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.exception_handler(PageUnresponsive)
async def onUnresponsive(request, exc):
    return JSONResponse(status_code=504, content={"detail": str(exc)})


@app.exception_handler(Exception)
async def onUnexpected(request, exc):
    print(f"Error on {request.method} {request.url.path}: {type(exc).__name__}: {exc}")
    return JSONResponse(status_code=500, content={"detail": "Something went wrong. Try again."})


app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=CORS_ORIGINS != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def webApp(name):
    remote = webApps.get(name or "youtube")
    if remote is None:
        raise HTTPException(status_code=400, detail=f"Unknown app '{name}'")
    return remote


def firstLine(error, fallback="Chrome error"):
    return (str(error).splitlines() or [fallback])[0]


# ---------------------------------------------------------------------- status


@app.get("/")
def health():
    return {"status": "ok", "message": "Remote API is running", "apps": ["laptop", *webApps]}


frontendCheck = {"ready": False, "at": 0.0}
frontendLock = threading.Lock()


@app.get("/frontend")
def frontendStatus():
    """Whether the phone page is up and serving (not stopped, building or
    still starting). The Home screen shows its QR code only once it is."""
    with frontendLock:
        if time.time() - frontendCheck["at"] > 1.5:
            try:
                with urllib.request.urlopen(FRONTEND_CHECK_URL, timeout=2) as response:
                    frontendCheck["ready"] = response.status == 200
            except Exception:
                frontendCheck["ready"] = False
            frontendCheck["at"] = time.time()
        return {"ready": frontendCheck["ready"]}


@app.get("/qr", response_class=HTMLResponse)
def qr(mode: str = ""):
    """QR code for the phone remote's URL, in the selected theme. The page
    polls /mode and follows theme changes without reloading."""
    mode = mode if mode in MODES else modeState["mode"]
    return qrPage.render(mode, wallpapers.current(mode))


# One status check per app at a time. The phone asks every second; if a page
# is slow, extra requests get the last answer straight away instead of
# piling up behind it (which used to freeze everything, then burst).
stateLocks = {}
lastState = {}


def withSkips(state, app):
    """Add the app's recent auto-skip events, for the phone's notice."""
    return {**state, "skips": skipper.events(app)}


def staleState(app):
    cached = lastState.get(app)
    return withSkips({**cached, "stale": True} if cached else {"app": app, "browser": "busy"}, app)


@app.get("/state")
def getState(app: str = "youtube"):
    remote = webApp(app)
    lock = stateLocks.setdefault(app, threading.Lock())
    if not lock.acquire(blocking=False):
        return staleState(app)
    try:
        state = remote.state()
    except Busy:
        return staleState(app)
    except PageUnresponsive as e:
        state = {"app": app, "browser": "error", "error": str(e)}
    finally:
        lock.release()
    lastState[app] = state
    if app == modeState.get("lastApp"):
        rememberTitle(state)
    return withSkips(state, app)


@app.get("/screenshot")
def screenshot(app: str = "youtube"):
    png = webApp(app).screenshot()
    if png is None:
        raise HTTPException(status_code=409, detail="Browser is not running")
    return Response(content=png, media_type="image/png", headers={"Cache-Control": "no-store"})


# ---------------------------------------------------------------------- mode / power


def currentMode():
    tv = False
    try:
        with session.locked(timeout=2):
            if session.connect(launch=False):
                tv = session.tvMode
    except Exception:
        pass  # Chrome busy or gone: power/theme are still right.
    if not modeState.get("nowPlaying"):
        rememberTitle(lastState.get(modeState.get("lastApp") or ""))
    paper = wallpapers.current(modeState["mode"]) or {}
    return {**modeState, "tvMode": tv, "wallpaper": {k: paper.get(k) for k in ("id", "title", "video", "poster")}}


def rememberTitle(state):
    """Keep the title playing in a state snapshot in lastTitle.txt, so a
    restart still shows it."""
    title = ((state or {}).get("player") or {}).get("title")
    title = " ".join(title.split()) if isinstance(title, str) else ""
    if not title or title == modeState.get("nowPlaying"):
        return
    modeState["nowPlaying"] = title
    writeText(LAST_TITLE_FILE, title)


def rememberApp(name):
    if name not in APPS or modeState["lastApp"] == name:
        return
    modeState["lastApp"] = name
    modeState["nowPlaying"] = None
    writeText(LAST_APP_FILE, name)
    writeText(LAST_TITLE_FILE, "")


def ensureFullscreen():
    """Fullscreen the Chrome window unless it already is."""
    with session.locked(timeout=15):
        if not session.connect(launch=False):
            return
        try:
            session.ensureTvMode()
        except Exception as e:
            print(f"fullscreen failed: {e}")


def showWebApp(name):
    """Bring one web app's tab to the front. If the tab is parked, it first
    goes back to the page it was parked from, so the app reopens where it was
    left. (land() is cheap when nothing was saved for that app.)"""
    remote = webApp(name)
    try:
        park.land(name)  # un-park before switching, so the tab is found by site
    except Exception as e:
        print(f"unpark {name} failed: {e}")
    state = remote.show()
    park.land(name)  # covers a tab freshly opened by show() after a Chrome restart
    return state


def showAndParkOthers(name):
    """Show one web app, then free the other tabs' memory in the background
    (the phone doesn't wait for that part)."""
    state = showWebApp(name)
    threading.Thread(target=park.parkAll, args=(name,), daemon=True).start()
    return state


def resumeLastApp():
    """Power on: Chrome leaves the Home screen for the last app's tab, back
    on whatever that app was showing when the remote was switched off."""
    try:
        showWebApp(modeState["lastApp"])
    except Exception as e:
        print(f"open {modeState['lastApp']} failed: {e}")
    ensureFullscreen()
    laptop.settle()


def switchToQr():
    """Activate the QR tab (opening it if needed) and bring Chrome forward."""
    with session.locked(timeout=15):
        if not session.connect(launch=False):
            return
        try:
            session.useTab((QR_MARKER,), QR_URL)
            # Reload so the screen always has the latest QR page (it may have
            # been open since before an update).
            session.driver.refresh()
            session.bringToFront()
            session.ensureTvMode()
        except Exception as e:
            print(f"switch to QR failed: {e}")
    laptop.settle()


def powerOff():
    park.parkAll()
    switchToQr()


@app.get("/mode")
def getMode():
    """Power state, QR theme, and whether Chrome is fullscreen."""
    return currentMode()


@app.post("/mode")
async def setMode(request: Request):
    """Change the QR page theme only. Doesn't touch playback or tabs; the QR
    page picks the new theme up by itself."""
    noteActivity()
    data = await request.json()
    mode = (data.get("mode") or "night").lower()
    if mode not in MODES:
        raise HTTPException(status_code=400, detail=f"Unknown mode '{mode}'")
    modeState["mode"] = mode
    writeText(THEME_FILE, mode)
    return await asyncio.to_thread(currentMode)


def applyPower(on):
    """The power button's work, shared by the phone and the sleep watch."""
    modeState["power"] = "on" if on else "off"
    writeText(POWER_FILE, modeState["power"])
    if on:
        resumeLastApp()
    else:
        powerOff()


@app.post("/power")
async def setPower(request: Request):
    """Power off: park every app tab (playback ends, memory is freed, the
    place is remembered) and switch Chrome to the QR page. Power on: Chrome
    opens the last app's tab (modeState["lastApp"]) back on its saved page,
    and every phone shows that app's remote. Either way, Chrome goes
    fullscreen if it isn't. (The sleep watch runs this same switch after a
    quiet while with nothing playing.)"""
    noteActivity()
    data = await request.json()
    on = bool(data.get("on"))
    # These drive Chrome (blocking), so keep them off the event loop.
    await asyncio.to_thread(applyPower, on)
    return await asyncio.to_thread(currentMode)


@app.post("/tv")
def toggleTv():
    """Toggle Chrome fullscreen without switching tabs (for the QR page)."""
    noteActivity()
    with session.locked(timeout=15):
        if not session.connect(launch=False):
            raise HTTPException(status_code=409, detail="Chrome isn't running")
        session.toggleTvMode()
    return currentMode()


@app.post("/qr/reload")
async def reloadQr():
    """Reload the Home screen (QR) tab. Used from the power-off screen."""
    noteActivity()
    await asyncio.to_thread(switchToQr)
    return {"status": "success"}


# ---------------------------------------------------------------------- wallpapers


@app.get("/wallpapers")
def getWallpapers():
    """The wallpaper collection and which one each mode uses."""
    return wallpapers.listing()


@app.post("/wallpapers")
async def addWallpaper(request: Request):
    """Add a wallpaper from a wallspace.app page (or a direct .mp4 link) and
    use it for Live. Only the video link is saved; it's streamed, not
    downloaded."""
    data = await request.json()
    try:
        return await asyncio.to_thread(wallpapers.add, data.get("url"), data.get("mode") or "live")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/wallpapers/select")
async def selectWallpaper(request: Request):
    data = await request.json()
    try:
        return wallpapers.select(data.get("id"), data.get("mode") or "live")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/wallpapers/{itemId}")
def deleteWallpaper(itemId: str):
    try:
        return wallpapers.remove(itemId)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------------------------- apps and actions


@app.post("/app")
async def switchApp(request: Request):
    """Called when you pick an app on the phone: Chrome switches to (or opens)
    that app's tab, back on whatever page it was left on, and comes to the
    front. Every other app tab is then parked — ended, with its place
    remembered — so only the showing tab costs memory. Laptop needs nothing,
    and leaving a stream playing while you use the laptop remote is
    intentional."""
    noteActivity()
    data = await request.json()
    name = data.get("app")
    print(f"Switch app: {name}")
    if name == "laptop":
        return {"status": "success", "app": name}
    rememberApp(name)
    try:
        # show() drives Chrome (seconds); run it off the event loop so the
        # rest of the API keeps answering meanwhile.
        state = await asyncio.to_thread(showAndParkOthers, name)
        return {"status": "success", "app": name, "state": state}
    except WebDriverException as e:
        raise HTTPException(status_code=500, detail=firstLine(e))
    finally:
        laptop.settle()


# Sync work runs in a worker thread; ChromeSession serialises access to the
# single WebDriver session with a lock, LaptopControl does the same for
# pyautogui.
@app.post("/action")
async def buttonAction(request: Request):
    noteActivity()
    data = await request.json()
    print(f"Received action request: {data}")
    name = data.get("app") or "youtube"
    if name == "laptop":
        return await asyncio.to_thread(runLaptop, data.get("action"), data.get("value"))
    return await asyncio.to_thread(runWeb, name, data.get("action"), data.get("value"))


@app.post("/search")
async def searchQuery(request: Request):
    noteActivity()
    data = await request.json()
    print(f"Received search request: {data}")
    return await asyncio.to_thread(runWeb, data.get("app") or "youtube", "search", data.get("query"))


def runWeb(name, action, value=None):
    remote = webApp(name)
    try:
        # Another phone may have parked this app while its panel was
        # open; land it back on its page before acting on it.
        park.land(name)
        out = remote.run(action, value)
        if isinstance(out.get("state"), dict):
            out["state"] = withSkips(out["state"], name)
        return {"status": "success", "app": name, "action": action, **out}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except (Busy, PageUnresponsive):
        raise  # answered by their exception handlers (503 / 504)
    except (WebDriverException, RuntimeError) as e:
        raise HTTPException(status_code=502, detail=firstLine(e))
    finally:
        # Clicks land the real pointer on the video. Move it off once the
        # action is done, unless the laptop trackpad is in use.
        laptop.settle()


def runLaptop(action, value=None):
    try:
        out = laptop.run(action, value)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "success", "app": "laptop", "action": action, **out}


@app.websocket("/ws/pointer")
async def pointerSocket(ws: WebSocket):
    """Trackpad stream: {"t":"m",dx,dy} move, {"t":"s",dy} scroll,
    {"t":"c",b,double} click, {"t":"d",on} drag (hold left button)."""
    await ws.accept()
    try:
        while True:
            msg = json.loads(await ws.receive_text())
            noteActivity()
            await asyncio.to_thread(laptop.handlePointer, msg)
    except WebSocketDisconnect:
        pass
    finally:
        # Never leave the left button stuck down if the phone drops off.
        if laptop.dragging:
            await asyncio.to_thread(laptop.setDrag, False)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host=HOST, port=PORT, reload=RELOAD)
