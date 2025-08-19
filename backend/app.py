from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import pyautogui

from utils.fMoviesFunctions import *
from utils.googleChromeFunctions import *
from utils.homeFunctions import *
from utils.hotKeys import *
from utils.iBommaFunctions import *
from utils.netflixFunctions import *
from utils.primeVideosFunctions import *
from utils.youTubeFunctions import *

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    """Health check endpoint for connection monitoring"""
    return {"status": "healthy", "message": "Backend is running"}

@app.post("/move")
async def move_mouse(request: Request):
    data = await request.json()
    dx = data.get("dx", 0)
    dy = data.get("dy", 0)
    print(f"Received move request: {data}")
    pyautogui.moveRel(dx, dy)
    return {"status": "success", "message": f"Moved by dx={dx}, dy={dy}"}

@app.post("/scroll")
async def scroll_page(request: Request):
    data = await request.json()
    dy = data.get("dy", 0)
    print(f"Received scroll request: {data}")
    pyautogui.scroll(int(dy))
    return {"status": "success", "message": f"Scrolled by dy={dy}"}

@app.post("/click")
async def mouse_click(request: Request):
    data = await request.json()
    button = data.get("button", "left")
    print(f"Received click request: {data}")
    pyautogui.click(button=button)
    return {"status": "success", "message": f"Performed {button} click"}

@app.post("/action")
async def button_action(request: Request):
    data = await request.json()
    action = data.get("action")
    action_map = {
            "volumeIncrease": volumeIncrease,
            "previousTrack": previousTrack,
            "backSeek": backSeek,
            "pause": pause,
            "forwardSeek": forwardSeek,
            "nextTrack": nextTrack,
            "volumeDecrease": volumeDecrease,
            "refreshPage": refreshPage,
            "altTab": altTab,
            "desktop": desktop,
            "openChrome": openChrome,
            "reviveTabs": reviveTabs,
            "volumeUp": volumeUp,
            "volumeDown": volumeDown,
            "fullScreen": fullScreen,
            "prevTab": prevTab,
            "nextTab": nextTab,
            "closeTab": closeTab,
            "goBackTab": goBackTab,
            "goAheadTab": goAheadTab,
            # YouTube Functions
            "newTabYT": newTabYT,
            "escapeYT": escapeYT,
            "startYT": startYT,
            "iButtonYT": iButtonYT,
            # Google Chrome Functions
            "newTabGC": newTabGC,
            "saveLinkGC": saveLinkGC,
            # FMovies Functions
            "newTabFM": newTabFM,
            "click1FM": click1FM,
            "startFM": startFM,
            "skipIntroFM": skipIntroFM,
            # iBomma Functions
            "newTabIB": newTabIB,
            "startIB": startIB,
            "skipIntroIB": skipIntroIB,
            # Netflix Functions
            "newTabN": newTabN,
            "skipIntroN": skipIntroN,
            "startN": startN,
            # Prime Functions
            "newTabAP": newTabAP,
            "startAP": startAP,
        }
    
    if action in action_map:
            action_map[action]()
    print(f"Received action request: {data}")
    return {"status": "success", "message": f"Action '{action}' executed"}

@app.post("/search")
async def search_query(request: Request):
    data = await request.json()
    query = data.get("query")
    visible_content_id = data.get("visibleContentId")
    action_map = {
            "youTube": lambda: searchYouTube(query),
            "googleChrome": lambda: searchGoogleChrome(query),
            "fMovies": lambda: searchFMovies(query),
            "iBomma": lambda: searchIBomma(query),
            "netflix": lambda: searchNetflix(query),
            "primeVideos": lambda: searchPrime(query),
        }
    
    if visible_content_id in action_map:
            action_map[visible_content_id]()
    print(f"Received search request: {data}")
    return {
        "status": "success",
        "message": f"Search query '{query}' executed for content ID {visible_content_id}"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=5000, reload=True)
