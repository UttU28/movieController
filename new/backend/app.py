import asyncio
import json
import os
import threading
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from selenium.common.exceptions import WebDriverException

load_dotenv()

from chrome_session import ChromeSession
from laptop import LaptopControl
from netflix_remote import NetflixRemote
import qr_page
from prime_remote import PrimeRemote
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
}
laptop = LaptopControl()


@asynccontextmanager
async def lifespan(app):
    if LAUNCH_ON_START:
        # Attach to (or start) Chrome in the background so the API is up
        # immediately. This doesn't bring Chrome to the front.
        threading.Thread(target=_safe_connect, daemon=True).start()
    yield
    with session.lock:
        session.teardown()


def _safe_connect():
    try:
        with session.lock:
            session.connect(launch=True)
            session.open_background_tab(f"http://127.0.0.1:{PORT}/qr", "/qr")
    except Exception as e:
        print(f"Chrome launch failed: {e}")
    print(f"Phone remote: {qr_page.remote_url()}  (QR code at http://127.0.0.1:{PORT}/qr)")


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


@app.post("/app")
async def switch_app(request: Request):
    """Called when you pick an app on the phone: Chrome switches to (or opens)
    that app's tab and comes to the front. Laptop needs nothing."""
    data = await request.json()
    name = data.get("app")
    print(f"Switch app: {name}")
    if name == "laptop":
        return {"status": "success", "app": name}
    try:
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
