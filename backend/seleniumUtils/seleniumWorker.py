import subprocess
import threading
from time import sleep
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import atexit

# Initialize FastAPI app
app = FastAPI()

# Enable CORS for all origins (adjust as needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Set up paths and Chrome options
PATH_TO_PROJECT = 'C:/Users/utsav/OneDrive/Desktop/Movie_Controller_2/'
chromeDriverPath = f'{PATH_TO_PROJECT}backend/chromeDriver/chromedriver.exe'

options = Options()
options.add_experimental_option("debuggerAddress", "localhost:8989")
options.add_argument("--disable-notifications")
options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
options.add_argument("window-size=1920x1080")

# Global variables
current_index = 0
all_windows = []
thisDriver = None

def prepareChromeAndSelenium():
    """ Starts Chrome with debugging mode and connects to WebDriver """
    subprocess.Popen([
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        '--remote-debugging-port=8989',
        f'--user-data-dir={PATH_TO_PROJECT}backend/chromeData/'
    ])
    sleep(2)  # Allow time for Chrome to start
    driver = webdriver.Chrome(options=options)
    return driver

def extractTitleAndLink(window):
    """ Extracts title and link from a given video element using BeautifulSoup """
    try:
        html = window.get_attribute("outerHTML")
        soup = BeautifulSoup(html, "html.parser")
        return soup
    except Exception as e:
        print(f"Error extracting data with BeautifulSoup: {e}")
        return None

def loadYouTubeContent():
    """ Loads current YouTube page content and retrieves all video items """
    global all_windows
    try:
        contentsContainer = WebDriverWait(thisDriver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'div#contents'))
        )
        # Attempt to locate video items in different possible containers
        all_windows = contentsContainer.find_elements(By.TAG_NAME, 'ytd-rich-item-renderer') or \
                      contentsContainer.find_elements(By.TAG_NAME, 'ytd-video-renderer')
        print(f"Loaded {len(all_windows)} items")
        highlightCurrentWindow() 
    except Exception as e:
        print(f"Error loading YouTube content: {e}")

def highlightCurrentWindow():
    """ Highlights the currently selected video element """
    global current_index, all_windows
    for i, window in enumerate(all_windows):
        try:
            if i == current_index:
                thisDriver.execute_script("arguments[0].style.border='3px solid blue'", window)
            else:
                thisDriver.execute_script("arguments[0].style.border=''", window)
        except Exception as e:
            print(f"Error highlighting window at index {i}: {e}")

def getFocusedContent():
    """ Retrieves title, link, and channel name of the currently focused video """
    global current_index, all_windows
    items = all_windows
    if not items:
        print("No items available.")
        return None, None, None
    
    window = items[current_index]
    soup = extractTitleAndLink(window)
    
    if soup:
        # Extract title and link
        link_element = soup.select_one('a#video-title') or soup.select_one('a#video-title-link')
        link = link_element['href'] if link_element else None
        title = link_element['title'] if link_element else None
        
        # Extract channel name
        channel_element = soup.select_one('a#channel-name')
        channel_name = channel_element.text.strip() if channel_element else "Unknown Channel"
        
        print(f"Title: {title}, Channel: {channel_name}")
        return title, link, channel_name
    
    return None, None, None

@app.post("/on")
def go_to_youtube_home():
    """ Navigates to YouTube homepage and loads its content """
    global current_index
    current_index = 0  # Reset index to start from the top
    thisDriver.get("https://www.youtube.com/")
    loadYouTubeContent()  # Load content on the YouTube homepage
    title, link, channel_name = getFocusedContent()
    return {"message": "Navigated to YouTube homepage", "title": title, "link": f"https://www.youtube.com{link}", "channel": channel_name}

@app.get("/current")
def get_current_video():
    """ Endpoint to retrieve title, link, and channel of the current video """
    title, link, channel_name = getFocusedContent()
    if title and link:
        return {"title": title, "link": f"https://www.youtube.com{link}", "channel": channel_name}
    return {"error": "No video content available"}

@app.post("/next")
def move_to_next_video():
    """ Moves to the next video in the list and highlights it """
    global current_index, all_windows
    if current_index < len(all_windows) - 1:
        current_index += 1
    highlightCurrentWindow()  # Highlight the new current video
    title, link, channel_name = getFocusedContent()
    return {"title": title, "link": f"https://www.youtube.com{link}", "channel": channel_name}

@app.post("/previous")
def move_to_previous_video():
    """ Moves to the previous video in the list and highlights it """
    global current_index
    if current_index > 0:
        current_index -= 1
    highlightCurrentWindow()  # Highlight the new current video
    title, link, channel_name = getFocusedContent()
    return {"title": title, "link": f"https://www.youtube.com{link}", "channel": channel_name}

@app.post("/search")
def search(query: str = Query(...)):
    """ Executes a YouTube search, loads results, and refreshes the content """
    global current_index, all_windows
    current_index = 0
    try:
        print(f"Search query received: {query}")
        thisDriver.get(f'https://www.youtube.com/results?search_query={"+".join(query.split())}')
        
        # Wait for search results to load and refresh `all_windows`
        loadYouTubeContent()
        
        # Highlight the first result and return its data
        title, link, channel_name = getFocusedContent()
        return {"message": "Search completed", "query": query, "title": title, "link": f"https://www.youtube.com{link}", "channel": channel_name}
    except Exception as e:
        print(f"Error during search: {e}")
        return {"message": "Search failed", "error": str(e)}

def run_driver_in_thread():
    """ Runs Selenium tasks in a separate thread """
    global thisDriver
    thisDriver = prepareChromeAndSelenium()
    loadYouTubeContent()  # Load initial YouTube content

# Ensure Chrome WebDriver closes on exit
atexit.register(lambda: thisDriver.quit() if thisDriver else None)

if __name__ == "__main__":
    # Start the Selenium driver in a separate thread
    threading.Thread(target=run_driver_in_thread, daemon=True).start()
    # Start the FastAPI app
    uvicorn.run(app, host="0.0.0.0", port=5000)
