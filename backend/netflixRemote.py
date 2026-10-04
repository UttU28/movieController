"""Netflix remote: TV-style navigation of netflix.com in the shared Chrome.

pageScripts/netflix.js reads the page (profiles, rows, the title pop-up, the
player) and moves the focus ring. Clicks go through Selenium as real mouse
clicks. Netflix ignores synthetic key presses, so playback (pause, seek,
volume) goes through its own player API instead.
"""

import time
from urllib.parse import quote_plus

from chromeApp import ChromeApp
from chromeSession import pageScript

NETFLIX_URL = "https://www.netflix.com"

SEEK_SECONDS = 10
VOLUME_STEP = 10

SECTIONS = {
    "home": "/browse",
    "shows": "/browse/genre/83",
    "movies": "/browse/genre/34399",
    "new": "/latest",
    "mylist": "/browse/my-list",
}


class NetflixRemote(ChromeApp):
    NAME = "netflix"
    HOSTS = ("netflix.com",)
    HOME_URL = f"{NETFLIX_URL}/browse"
    SCRIPT = pageScript("netflix.js")
    NAMESPACE = "__nfr"
    CLICK_TARGET = "[data-nfr-click]"
    PLAYER_SELECTOR = "[data-uia='player'], .watch-video"
    WAKE_OFFSET = (30, 10)

    def __init__(self, session):
        super().__init__(session)
        # Season names per title page; reading them means opening a dropdown.
        self.seasonNames = {}
        self.wokenUrl = None

    # ------------------------------------------------------------------ helpers

    def pageState(self):
        state = self.js("state")
        detail = state.get("detail")
        if detail is not None:
            # Only shows have a season dropdown; it appears once the pop-up
            # has finished loading, so don't cache until it's there.
            key = self.driver.current_url.split("?")[0]
            if key not in self.seasonNames and detail.get("season"):
                self.seasonNames[key] = self.js("seasons")
            detail["seasons"] = [
                {"label": name, "selected": name == detail.get("season")}
                for name in self.seasonNames.get(key, [])
            ]
        player = state.get("player")
        if player and not player.get("subtitle") and self.wokenUrl != self.driver.current_url:
            # Joined a video that was already playing: show the controls once
            # so the title and episode can be read.
            self.wokenUrl = self.driver.current_url
            self.wakeControls()
            state = self.js("state")
            state["detail"] = detail
        return state

    def inPlayer(self):
        return self.page() == "player"

    def startedPlaying(self, timeout=10):
        """Wait for the player, then show its controls once so the phone
        learns the title / episode."""
        end = time.time() + timeout
        while time.time() < end:
            if self.inPlayer():
                time.sleep(1.5)
                self.wakeControls()
                return True
            time.sleep(0.3)
        return False

    def open(self, href):
        before = self.driver.current_url
        self.clickMarked()
        deadline = time.time() + 2
        while time.time() < deadline:
            if self.driver.current_url != before:
                return
            time.sleep(0.15)
        self.driver.get(href)

    # ------------------------------------------------------------------ navigation

    def move(self, direction):
        if self.inPlayer():
            # In the player the D-pad works like a TV: seek and volume.
            if direction in ("left", "right"):
                return self.js("seek", SEEK_SECONDS if direction == "right" else -SEEK_SECONDS)
            return self.js("volume", VOLUME_STEP if direction == "up" else -VOLUME_STEP)

        result = self.js("move", direction)
        if result.get("page"):
            # Stepped past the edge of a row: press its arrow, then land on
            # the first new card.
            self.clickMarked()
            time.sleep(0.9)
            result["moved"] = self.js("afterPage")
        elif result.get("edge") and direction == "down":
            time.sleep(0.8)
            result = self.js("move", direction)
        return result

    def _doSelect(self):
        if self.inPlayer():
            return self._doPlayPause()
        result = self.js("select")
        if result.get("action") == "open" and result.get("ok"):
            self.open(result["href"])
        elif result.get("action") == "click" and result.get("ok"):
            if result.get("href"):
                self.open(result["href"])
            else:
                self.clickMarked()
            if result.get("plays"):
                self.startedPlaying()
        return result

    def _doBack(self):
        page = self.page()
        if page == "player":
            self.driver.back()
            return "closePlayer"
        if page == "detail" and self.js("closeModal"):
            return "closeDetail"
        self.driver.back()
        return "back"

    def _doSearch(self, query=None):
        query = (query or "").strip()
        if not query:
            raise ValueError("Empty search query")
        self.driver.get(f"{NETFLIX_URL}/search?q={quote_plus(query)}")
        return query

    def _doSection(self, name=None):
        if name not in SECTIONS:
            raise ValueError(f"Unknown Netflix section '{name}'")
        self.driver.get(f"{NETFLIX_URL}{SECTIONS[name]}")
        return name

    def _doHome(self):
        return self._doSection("home")

    def _doProfile(self, index=None):
        if not self.js("markProfile", int(index)):
            raise ValueError("No such profile on this screen")
        self.clickMarked()
        return index

    # ------------------------------------------------------------------ title pop-up

    def _doPlay(self):
        """The Play / Resume button in the title pop-up (or on the billboard)."""
        target = self.js("markPlay")
        if not target:
            raise ValueError("No play button on this page")
        self.clickMarked()
        if self.startedPlaying(timeout=3):
            return True
        if target.get("href"):
            self.driver.get(target["href"])
            return self.startedPlaying()
        return False

    def _doPlayEpisode(self, index=None):
        if not self.js("markEpisode", int(index)):
            raise ValueError(f"Episode {index} isn't listed")
        self.clickMarked()
        return self.startedPlaying()

    def _doSeason(self, index=None):
        if not self.js("pickSeason", int(index)):
            raise ValueError("No such season")
        return int(index)

    # ------------------------------------------------------------------ player

    def _doPlayPause(self):
        if not self.inPlayer():
            return self._doPlay()
        return self.js("playPause")

    def _doSeekBack(self):
        return self.js("seek", -SEEK_SECONDS)

    def _doSeekForward(self):
        return self.js("seek", SEEK_SECONDS)

    def _doVolumeUp(self):
        return self.js("volume", VOLUME_STEP)

    def _doVolumeDown(self):
        return self.js("volume", -VOLUME_STEP)

    def _doMute(self):
        return self.js("toggleMute")

    def _doFullscreen(self):
        # Both ways need a real click on the player's own button
        # (control-fullscreen-enter / control-fullscreen-exit).
        return self.wakeAndClick("markControl", "control-fullscreen")

    def _doSubtitles(self):
        """Open Netflix's Audio & Subtitles menu."""
        return self.wakeAndClick("markControl", "control-audio-subtitle")

    def _doSkip(self):
        """Skip Intro / Skip Recap, whichever Netflix is offering."""
        return self.wakeAndClick("markSkip")

    def _doNext(self):
        if not self.inPlayer():
            raise ValueError("Nothing is playing")
        self.wakeControls()
        if not self.js("markNext"):
            raise ValueError("No next episode")
        self.clickMarked()
        return self.startedPlaying()
