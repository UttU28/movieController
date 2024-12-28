import subprocess
import threading
from time import sleep
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys
from bs4 import BeautifulSoup
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import atexit

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

pathToProject = 'C:/Users/utsav/OneDrive/Desktop/Movie_Controller_2/'
chromeDriverPath = f'{pathToProject}backend/chromeDriver/chromedriver.exe'

options = Options()
options.add_experimental_option("debuggerAddress", "localhost:8989")
options.add_argument("--disable-notifications")
options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
options.add_argument("window-size=1920x1080")

currentIndex = 0
allWindows = []
thisType = None
thisDriver = None

def prepareChromeAndSelenium():
    subprocess.Popen([
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        '--remote-debugging-port=8989',
        f'--user-data-dir={pathToProject}backend/chromeData/'
    ])
    sleep(2)
    driver = webdriver.Chrome(options=options)
    return driver

def extractTitleAndLink(window):
    try:
        html = window.get_attribute("outerHTML")
        soup = BeautifulSoup(html, "html.parser")
        return soup
    except Exception as e:
        print(f"Error extracting data with BeautifulSoup: {e}")
        return None

def loadYouTubeContent(resetIndex=False):
    global allWindows, thisType, currentIndex
    if resetIndex:
        currentIndex = 0
    try:
        currentUrl = thisDriver.current_url
        if "https://www.youtube.com/watch" in currentUrl:
            contentsContainer = WebDriverWait(thisDriver, 5).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, 'div#related'))
            )
            allWindows = contentsContainer.find_elements(By.TAG_NAME, 'ytd-compact-video-renderer')
            thisType = 'related'
        else:
            contentsContainer = WebDriverWait(thisDriver, 5).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, 'div#contents'))
            )
            allWindows = (
                contentsContainer.find_elements(By.TAG_NAME, 'ytd-rich-item-renderer') or
                contentsContainer.find_elements(By.TAG_NAME, 'ytd-video-renderer')
            )
            thisType = 'contents'
    except Exception as e:
        print(f"Error loading YouTube content: {e}")

def highlightCurrentWindow():
    global currentIndex, allWindows
    for i, window in enumerate(allWindows):
        try:
            if i == currentIndex:
                thisDriver.execute_script("arguments[0].style.border='3px solid blue'", window)
            else:
                thisDriver.execute_script("arguments[0].style.border=''", window)
        except Exception as e:
            print(f"Error highlighting window at index {i}: {e}")

def scrollToCurrentWindow():
    global currentIndex, allWindows
    try:
        thisDriver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", allWindows[currentIndex])
    except Exception as e:
        print(f"Error scrolling to window at index {currentIndex}: {e}")

def getFocusedContent():
    global currentIndex, allWindows, thisType
    items = allWindows
    if not items:
        print("No items available.")
        return None, None, None
    
    window = items[currentIndex]
    soup = extractTitleAndLink(window)
    
    if soup:
        if thisType == 'related':
            titleElement = soup.select_one('span#video-title')
            title = titleElement['title'] if titleElement else None
            linkElement = soup.select_one('a#thumbnail')
            link = linkElement['href']
        else:
            linkElement = soup.select_one('a#video-title') or soup.select_one('a#video-title-link') 
            link = linkElement['href'] if linkElement else None
            title = linkElement['title'] if linkElement else None
        
        channelElement = soup.select_one('div#text-container')
        channelName = channelElement.select_one('yt-formatted-string').text.strip() if channelElement else "Unknown Channel"
        
        print(f"Title: {title}, Channel: {channelName}")
        return title, link, channelName
    
    return None, None, None

@app.post("/on")
def goToYouTubeHome():
    global currentIndex
    thisDriver.get("https://www.youtube.com/")
    loadYouTubeContent(resetIndex=True)
    title, link, channelName = getFocusedContent()
    return {"message": "Navigated to YouTube homepage", "title": title, "link": f"https://www.youtube.com{link}", "channel": channelName}

@app.get("/current")
def getCurrentVideo():
    title, link, channelName = getFocusedContent()
    if title and ("/watch?v=" in link):
        fullUrl = f"https://www.youtube.com{link}" if link.startswith("/") else link
        thisDriver.get(fullUrl)
        loadYouTubeContent(resetIndex=True)
        title, link, channelName = getFocusedContent()
        return {"title": title, "link": fullUrl, "channel": channelName}
    return {"error": "No video content available"}

@app.post("/next")
def moveToNextVideo():
    global currentIndex, allWindows
    while currentIndex < len(allWindows) - 1:
        currentIndex += 1
        title, link, channelName = getFocusedContent()
        if title:
            highlightCurrentWindow()
            scrollToCurrentWindow()
            loadYouTubeContent()
            return {"title": title, "link": f"https://www.youtube.com{link}", "channel": channelName}
    return {"message": "Reached the end of the list or no valid title found"}

@app.post("/previous")
def moveToPreviousVideo():
    global currentIndex
    while currentIndex > 0:
        currentIndex -= 1
        title, link, channelName = getFocusedContent()
        if title:
            highlightCurrentWindow()
            scrollToCurrentWindow()
            return {"title": title, "link": f"https://www.youtube.com{link}", "channel": channelName}
    return {"message": "Reached the beginning of the list or no valid title found"}

@app.post("/search")
def search(query: str = Query(...)):
    try:
        thisDriver.get(f'https://www.youtube.com/results?search_query={"+".join(query.split())}')
        loadYouTubeContent(resetIndex=True)
        title, link, channelName = getFocusedContent()
        return {"message": "Search completed", "query": query, "title": title, "link": f"https://www.youtube.com{link}", "channel": channelName}
    except Exception as e:
        print(f"Error during search: {e}")
        return {"message": "Search failed", "error": str(e)}

@app.post("/pressButton")
def pressButton(key: str = Query(...)):
    try:
        thisDriver.execute_script("window.scrollTo({top: 0, behavior: 'smooth'});")
        element = thisDriver.find_element(By.TAG_NAME, 'body')
        element.send_keys(key)
        return {"message": f"'{key}' key pressed"}
    except Exception as e:
        print(f"Error pressing '{key}' key: {e}")
        return {"error": f"Failed to press '{key}' key"}

@app.post("/reload")
def reloadPage():
    try:
        currentUrl = thisDriver.current_url
        thisDriver.get(currentUrl)
        loadYouTubeContent(resetIndex=True)  
        title, link, channelName = getFocusedContent()
        return {"message": "Page reloaded", "title": title, "link": f"https://www.youtube.com{link}", "channel": channelName}
    except Exception as e:
        print(f"Error reloading page: {e}")
        return {"error": "Failed to reload the page"}

def runDriverInThread():
    global thisDriver
    thisDriver = prepareChromeAndSelenium()
    loadYouTubeContent()

atexit.register(lambda: thisDriver.quit() if thisDriver else None)

if __name__ == "__main__":
    threading.Thread(target=runDriverInThread, daemon=True).start()
    uvicorn.run(app, host="0.0.0.0", port=5000)
