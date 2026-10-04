"""Viki remote: TV-style navigation of viki.com in the shared Chrome.

pageScripts/viki.js reads the page (tiles, episode ranges, episodes, player)
and moves the focus ring. Viki shows and episodes are plain links, so most
things open by navigating; the few buttons Viki might ignore when clicked
from script (the show's Play button, skip, next episode) get a real mouse
click from Selenium. Playback itself (play/pause, seek, volume) goes straight
to the <video>.
"""

import json
import time
from urllib.parse import quote_plus

from selenium.common.exceptions import WebDriverException
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

from chromeApp import ChromeApp
from chromeSession import DEBUG_PORT, pageScript

VIKI_JS = pageScript("viki.js")
VIKI_URL = "https://www.viki.com"

VOLUME_STEP = 10
SEEK_SECONDS = 10

SUBTITLE_BUTTON = "button[aria-label='Select subtitles'], .vmp-subtitle-setting button"

# Player buttons, by their aria-label / title.
PLAYER_BUTTONS = {
    "fullscreen": r"^(Full ?screen|Exit full ?screen|Non-Fullscreen)",
}

SECTIONS = {
    "home": "/",
    "shows": "/categories?type=series",
    "movies": "/movies",
    "watchlist": "/watchlist",
}


class VikiRemote(ChromeApp):
    NAME = "viki"
    HOSTS = ("viki.com",)
    HOME_URL = f"{VIKI_URL}/"
    CLICK_TARGET = "[data-vk-click]"

    def __init__(self, session):
        super().__init__(session)
        # Subtitle tracks the phone has been asked to choose from, if any.
        self.subtitleChoices = None

    # ------------------------------------------------------------------ helpers

    def tab(self):
        """The driver's tab, for talking to it over its own DevTools socket."""
        tabId = self.driver.current_window_handle
        return {"id": tabId,
                "webSocketDebuggerUrl": f"ws://127.0.0.1:{DEBUG_PORT}/devtools/page/{tabId}"}

    def evalHere(self, expression, timeout=3):
        return self.session.evalInTab(self.tab(), expression, timeout=timeout)

    def js(self, fn, *args):
        """Call window.__vk.<fn>. Goes over the tab's DevTools socket rather
        than WebDriver: WebDriver holds every script until a page has fully
        loaded, and a Viki episode page with its ads can take a minute."""
        return self.evalHere(f"{VIKI_JS}\nwindow.__vk.{fn}.apply(null, {json.dumps(list(args))});", timeout=6)

    def pageState(self):
        state = self.js("state")
        # Subtitle tracks waiting for the phone to pick one (same video only).
        choices = self.subtitleChoices
        if choices and state.get("player") and choices["url"] == state.get("url"):
            state["player"]["subtitleOptions"] = choices["options"]
        return state

    def wakeAndClick(self, marker, *args):
        # As ChromeApp's, then the pointer moves off the controls so Viki's
        # hover menus close again.
        self.wakeControls()
        if not self.js(marker, *args):
            return False
        clicked = self.clickMarked()
        self.restPointer()
        return clicked

    def playerButton(self, name):
        return self.wakeAndClick("markPlayerButton", PLAYER_BUTTONS[name])

    def open(self, href, plays=False):
        """Go to a page without waiting for all of Viki to finish loading
        (that can take half a minute); the remote answers as soon as the
        new page is up."""
        old = self.evalHere("location.href")
        self.evalHere(f"location.assign({json.dumps(href)})", timeout=4)
        end = time.time() + 8
        while time.time() < end:
            time.sleep(0.3)
            try:
                if self.evalHere("location.href", timeout=2) != old:
                    break
            except Exception:
                pass  # mid-navigation; ask again
        if plays:
            self.startedPlaying()

    # ------------------------------------------------------------------ navigation

    def move(self, direction):
        if self.page() == "player":
            # In the player the D-pad works like a TV: seek and volume.
            if direction == "left":
                return self._doSeekBack()
            if direction == "right":
                return self._doSeekForward()
            return self.js("volume", VOLUME_STEP if direction == "up" else -VOLUME_STEP)

        result = self.js("move", direction)
        if result.get("edge") and direction == "down":
            # Rows further down load lazily as the page scrolls.
            time.sleep(0.8)
            result = self.js("move", direction)
        return result

    def _doSelect(self):
        if self.page() == "player":
            return self._doPlayPause()
        result = self.js("select")
        if result.get("action") == "open" and result.get("href"):
            self.open(result["href"], result.get("plays"))
        elif result.get("action") == "click" and result.get("ok"):
            self.clickMarked()
            if result.get("plays"):
                self.startedPlaying()
        return result

    def _doBack(self):
        if self.page() == "player" and self.evalHere("!!document.fullscreenElement"):
            self.pressKey(Keys.ESCAPE)
            return "exitFullscreen"
        self.evalHere("history.back()")
        return "back"

    def _doSearch(self, query=None):
        query = (query or "").strip()
        if not query:
            raise ValueError("Empty search query")
        self.open(f"{VIKI_URL}/search?q={quote_plus(query)}")
        return query

    def _doSection(self, name=None):
        if name not in SECTIONS:
            raise ValueError(f"Unknown Viki section '{name}'")
        self.open(VIKI_URL + SECTIONS[name])
        return name

    def _doHome(self):
        return self._doSection("home")

    # ------------------------------------------------------------------ show page

    def startedPlaying(self, timeout=10):
        """Wait for the player to load (the page is answered over DevTools,
        so this doesn't wait for everything else on it)."""
        end = time.time() + timeout
        while time.time() < end:
            try:
                page = self.page()
            except Exception:
                page = None  # between pages; ask again
            if page == "player":
                return True
            if page == "login":
                return False
            time.sleep(0.3)
        return False

    def openOrClick(self, found):
        """Play what the page script found: by its link if it has one,
        else with a real click on it."""
        if found.get("href"):
            self.open(found["href"], plays=True)
            return True
        self.clickMarked()
        return self.startedPlaying()

    def _doPlay(self):
        """The big Play button on a show or movie page."""
        if not self.js("markPlay"):
            raise ValueError("No play button on this page")
        self.clickMarked()
        return self.startedPlaying()

    def _doPlayEpisode(self, index=None):
        found = self.js("episode", int(index))
        if not found:
            raise ValueError(f"Episode {index} isn't on this page")
        return self.openOrClick(found)

    def _doSeason(self, index=None):
        """Show one block of episodes (Viki splits long shows into 1-10, 11-20, ...)."""
        label = self.js("range", int(index))
        if label is None:
            raise ValueError("No such episode range")
        time.sleep(0.6)
        return label

    def _doNextSeason(self):
        return self.stepSeason(1, "This title has only one page of episodes")

    def _doPrevSeason(self):
        return self.stepSeason(-1, "This title has only one page of episodes")

    # ------------------------------------------------------------------ player

    def _doPlayPause(self):
        if self.page() != "player":
            return self._doPlay()
        before = self.js("paused")
        self.js("playPause")
        time.sleep(0.4)
        if self.js("paused") == before:
            # The page refused a scripted play: press Space like a person.
            self.pressKey(Keys.SPACE)
        return "playPause"

    def _doSeekBack(self):
        return self.js("seek", -SEEK_SECONDS)

    def _doSeekForward(self):
        return self.js("seek", SEEK_SECONDS)

    def _doVolumeUp(self):
        return self.js("volume", VOLUME_STEP)

    def _doVolumeDown(self):
        return self.js("volume", -VOLUME_STEP)

    def _doMute(self):
        return self.js("mute")

    def restPointer(self):
        """Park the pointer in the top part of the video, away from the
        control bar. Viki's menus open on hover and stay open while the
        pointer is over them; this lets them (and the controls) close."""
        videos = self.driver.find_elements(By.CSS_SELECTOR, "video")
        if not videos:
            return
        try:
            height = videos[0].size.get("height") or 0
            ActionChains(self.driver).move_to_element_with_offset(videos[0], 0, -int(height * 0.35)).perform()
        except WebDriverException:
            pass

    def openSubtitleMenu(self):
        """Hover the subtitles button until its menu shows (click if hovering
        isn't enough). True once the menu is open."""
        self.wakeControls()
        buttons = self.driver.find_elements(By.CSS_SELECTOR, SUBTITLE_BUTTON)
        if not buttons:
            return False
        for press in (False, True):
            chain = ActionChains(self.driver).move_to_element(buttons[0])
            if press:
                chain.click()
            chain.perform()
            end = time.time() + 1.2
            while time.time() < end:
                if self.js("subtitleMenuOpen"):
                    return True
                time.sleep(0.15)
        return False

    def _doSubtitles(self, pick=None):
        """English subtitles on/off. Viki's button holds a language menu: on
        picks Off, off picks English. With several English tracks (or none)
        the phone is shown the choices, and picking one comes back as `pick`
        (the menu row). The menu is closed again either way."""
        self.subtitleChoices = None
        try:
            if not self.openSubtitleMenu():
                return False
            found = self.js("markSubtitle", None if pick is None else int(pick))
            if not found:
                return False
            if found.get("choose"):
                self.subtitleChoices = {"url": self.evalHere("location.href"), "options": found["choose"]}
                return found
            picked = found.get("picked")
            for _ in range(2):
                self.clickMarked()
                time.sleep(0.4)
                if self.js("subtitleOn") == picked:
                    break
            return picked
        finally:
            self.restPointer()

    def _doCloseSubtitles(self):
        self.subtitleChoices = None
        return True

    def _doFullscreen(self):
        if not self.playerButton("fullscreen"):
            self.pressKey("f")
        return "fullscreen"

    def _doSkip(self):
        """Skip the ad that's playing, else Skip Intro / Skip Recap."""
        if self.js("skipAd"):
            return "ad"
        return self.wakeAndClick("markSkip")

    def _doNext(self):
        """Next episode: the player's own button, else the next one in the list."""
        if self.page() != "player":
            raise ValueError("Nothing is playing")
        self.wakeControls()
        found = self.js("next")
        if not found:
            return False
        return self.openOrClick(found)
