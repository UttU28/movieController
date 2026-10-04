"""Prime Video remote: TV-style navigation of primevideo.com in the shared Chrome.

pageScripts/prime.js reads the page (tiles, seasons, episodes, player) and
moves the focus ring. Anything Prime might ignore when clicked from script
(play buttons, player controls, skip intro) is clicked by Selenium with a
real mouse click.
"""

import time
from urllib.parse import quote_plus

from selenium.webdriver.common.keys import Keys

from chromeApp import ChromeApp
from chromeSession import pageScript

VOLUME_STEP = 10

# Player buttons, by the start of their aria-label.
PLAYER_BUTTONS = {
    "playPause": r"^(Play|Pause)$",
    "seekBack": r"^Skip back",
    "seekForward": r"^Skip forward",
    "mute": r"^(Mute|Unmute)$",
    "subtitles": r"^(Turn (on|off) subtitles|Subtitles)",
    "fullscreen": r"^(Fullscreen|Exit fullscreen)",
    "closePlayer": r"^Close player",
}

# Pages reachable from the phone's shortcut buttons, relative to the region.
SECTIONS = {
    "home": "/storefront",
    "movies": "/movie",
    "tv": "/tv",
    "watchlist": "/mystuff/watchlist",
}


class PrimeRemote(ChromeApp):
    NAME = "prime"
    HOSTS = ("primevideo.com",)
    HOME_URL = "https://www.primevideo.com/"
    SCRIPT = pageScript("prime.js")
    NAMESPACE = "__prv"
    CLICK_TARGET = "[data-prv-click]"
    PLAYER_SELECTOR = "#dv-web-player"

    # ------------------------------------------------------------------ helpers

    def pageState(self):
        return self.js("state")

    def regionUrl(self, path):
        region = self.js("state").get("region") or ""
        return f"https://www.primevideo.com{region}{path}"

    def playerButton(self, name):
        return self.wakeAndClick("markPlayerButton", PLAYER_BUTTONS[name])

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
            self.driver.get(result["href"])
        elif result.get("action") == "click" and result.get("ok"):
            self.clickMarked()
            if result.get("plays"):
                self.startedPlaying()
        return result

    def _doBack(self):
        if self.page() == "player":
            if not self.playerButton("closePlayer"):
                self.pressKey(Keys.ESCAPE)
            return "closePlayer"
        self.driver.back()
        return "back"

    def _doSearch(self, query=None):
        query = (query or "").strip()
        if not query:
            raise ValueError("Empty search query")
        self.driver.get(self.regionUrl(f"/search/ref=atv_nb_sug?phrase={quote_plus(query)}"))
        return query

    def _doSection(self, name=None):
        if name not in SECTIONS:
            raise ValueError(f"Unknown Prime section '{name}'")
        self.driver.get(self.regionUrl(SECTIONS[name]))
        return name

    def _doHome(self):
        return self._doSection("home")

    # ------------------------------------------------------------------ detail page

    def startedPlaying(self, timeout=8):
        """Wait for the player to open, then show its controls once so the
        phone learns the episode title and whether there's a next episode."""
        end = time.time() + timeout
        while time.time() < end:
            if self.page() == "player":
                time.sleep(1)
                self.wakeControls()
                return True
            time.sleep(0.3)
        return False

    def _doPlay(self):
        """The big Play / Resume button on a title's page."""
        if not self.js("markPlay"):
            raise ValueError("No play button on this page")
        self.clickMarked()
        return self.startedPlaying()

    def _doPlayEpisode(self, index=None):
        if not self.js("markEpisode", int(index)):
            raise ValueError(f"Episode {index} isn't on this page")
        self.clickMarked()
        return self.startedPlaying()

    def _doSeason(self, index=None):
        seasons = self.seasons()
        index = int(index)
        if not 0 <= index < len(seasons):
            raise ValueError("No such season")
        self.driver.get(seasons[index]["href"])
        return seasons[index]["label"]

    def _doNextSeason(self):
        return self.stepSeason(1, "This title has no seasons")

    def _doPrevSeason(self):
        return self.stepSeason(-1, "This title has no seasons")

    # ------------------------------------------------------------------ player

    def _doPlayPause(self):
        if self.page() != "player":
            return self._doPlay()
        if not self.playerButton("playPause"):
            self.pressKey(Keys.SPACE)
        return "playPause"

    def _doSeekBack(self):
        return self.playerButton("seekBack")

    def _doSeekForward(self):
        return self.playerButton("seekForward")

    def _doVolumeUp(self):
        return self.js("volume", VOLUME_STEP)

    def _doVolumeDown(self):
        return self.js("volume", -VOLUME_STEP)

    def _doMute(self):
        return self.playerButton("mute")

    def _doSubtitles(self):
        return self.playerButton("subtitles")

    def _doFullscreen(self):
        if not self.playerButton("fullscreen"):
            self.pressKey("f")
        return "fullscreen"

    def _doSkip(self):
        """Skip Intro / Skip Recap / skip ad, whichever Prime is offering."""
        return self.wakeAndClick("markSkip")

    def _doNext(self):
        """Next episode, from the player's button or the "Next up" card."""
        if self.page() != "player":
            raise ValueError("Nothing is playing")
        return self.wakeAndClick("markNextUp")
