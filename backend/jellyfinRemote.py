"""Jellyfin remote for the Jellyfin web client open in the shared Chrome.

Unlike the other apps, Jellyfin has a proper remote-control protocol: the
web tab is a Jellyfin "session" that obeys commands (MoveUp, Select, Back,
Pause, Seek, SetSubtitleStreamIndex, DisplayContent, ...).
pageScripts/jellyfin.js sends those through the tab's own logged-in
ApiClient and also reads the library for the phone. It runs over the tab's
DevTools socket, so everything works with the Jellyfin tab in the background;
the WebDriver is only needed for bringing the tab forward and for fullscreen.
"""

import json
import os
import time
from urllib.parse import urlparse

from selenium.common.exceptions import WebDriverException
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By

from chromeApp import ChromeApp
from chromeSession import Busy, PageUnresponsive, pageScript

JELLYFIN_JS = pageScript("jellyfin.js")
JELLYFIN_URL = os.getenv("JELLYFIN_URL", "https://streaming.thatinsaneguy.com").rstrip("/")

SEEK_SECONDS = 10

# D-pad and menu buttons -> Jellyfin general commands.
COMMANDS = {
    "up": "MoveUp",
    "down": "MoveDown",
    "left": "MoveLeft",
    "right": "MoveRight",
    "select": "Select",
    "back": "Back",
    "home": "GoHome",
    "menu": "ToggleContextMenu",
    "osd": "ToggleOsd",
    "search": "GoToSearch",
    "volumeUp": "VolumeUp",
    "volumeDown": "VolumeDown",
    "mute": "ToggleMute",
    "pageUp": "PageUp",
    "pageDown": "PageDown",
}

# Transport buttons -> Jellyfin playstate commands.
PLAYSTATE = {
    "playPause": "PlayPause",
    "stop": "Stop",
    "next": "NextTrack",
    "previous": "PreviousTrack",
}

# Actions that need the WebDriver (and its lock). Playing needs the tab in
# front: Chrome throttles background tabs so hard that the web player can't
# start there.
DRIVER_ACTIONS = ("focus", "tvMode", "fullscreen", "reload", "play", "show")


class JellyfinRemote(ChromeApp):
    NAME = "jellyfin"
    HOSTS = (urlparse(JELLYFIN_URL).netloc,)
    HOME_URL = f"{JELLYFIN_URL}/web/#/home"

    # ------------------------------------------------------------------ helpers

    def tab(self):
        return self.session.findTab(self.HOSTS)

    def js(self, fn, *args):
        tab = self.tab()
        if tab is None:
            raise ValueError("Jellyfin isn't open in Chrome")
        call = f"window.__jfr.{fn}({', '.join(json.dumps(a) for a in args)})"
        return self.session.evalInTab(tab, f"(async () => {{ {JELLYFIN_JS}\n return await {call}; }})()")

    def pageState(self):
        return self.js("state")

    def fullState(self):
        state = self.pageState()
        state["app"] = self.NAME
        state["browser"] = "running"
        state["tvMode"] = self.session.tvMode if self.driver else False
        return state

    def playerOpen(self):
        return self.page() == "player"

    # ------------------------------------------------------------------ public

    def state(self):
        """Works whichever tab Chrome is showing: Jellyfin is controlled
        through its session, not by the tab being in front."""
        try:
            with self.session.locked(timeout=3):
                if not self.session.connect(launch=False):
                    return {"app": self.NAME, "browser": "stopped"}
            if self.tab() is None:
                return {"app": self.NAME, "browser": "running", "pageType": "noTab"}
            return self.fullState()
        except (WebDriverException, RuntimeError, OSError) as e:
            return {"app": self.NAME, "browser": "error", "error": str(e).splitlines()[0]}

    def run(self, action, value=None):
        try:
            if self.tab() is None:
                with self.session.locked(timeout=15):
                    self.ensureTab()
                self.waitUntilReady()
            if action in DRIVER_ACTIONS:
                with self.session.locked(timeout=15):
                    self.ensureTab()
                    return self.runAction(action, value)
            return self.runAction(action, value)
        except (Busy, PageUnresponsive):
            raise
        except RuntimeError as e:
            # Errors from the page script (e.g. Jellyfin rejecting a command).
            raise ValueError(str(e))

    def waitUntilReady(self, timeout=15):
        """A freshly opened tab needs a moment before its ApiClient exists."""
        end = time.time() + timeout
        while time.time() < end:
            try:
                if self.js("state").get("pageType") not in (None, "login"):
                    return
            except (RuntimeError, OSError, ValueError):
                pass
            time.sleep(0.5)

    def runAction(self, action, value):
        handler = self.handlerFor(action)
        if handler is not None:
            result = handler(value) if value is not None else handler()
        elif action in COMMANDS:
            result = self.command(action)
        elif action in PLAYSTATE:
            result = self.js("playstate", PLAYSTATE[action])
        else:
            raise ValueError(f"Unknown jellyfin action '{action}'")
        time.sleep(0.15)
        return {"result": result, "state": self.fullState()}

    def command(self, action):
        if action in ("up", "down", "left", "right", "select") and self.playerOpen():
            # In the player the D-pad works like a TV: seek and volume, OK pauses.
            if action == "select":
                return self.js("playstate", "PlayPause")
            if action in ("up", "down"):
                return self.js("command", "VolumeUp" if action == "up" else "VolumeDown")
            return self.js("seekBy", SEEK_SECONDS if action == "right" else -SEEK_SECONDS)
        # Everywhere else the D-pad moves our own highlight one whole item
        # at a time (Jellyfin's Move commands stop on every part of a card).
        if action == "select":
            return self.js("select")
        if action in ("up", "down", "left", "right"):
            return self.js("move", action)
        return self.js("command", COMMANDS[action])

    def move(self, direction):
        return self.command(direction)

    # ------------------------------------------------------------------ actions

    def _doSeekBack(self):
        return self.js("seekBy", -SEEK_SECONDS)

    def _doSeekForward(self):
        return self.js("seekBy", SEEK_SECONDS)

    def _doSeekTo(self, fraction=None):
        return self.js("seekTo", float(fraction))

    def _doSkip(self):
        """Skip Intro / other media segments, when Jellyfin offers it."""
        return self.js("skip")

    def _doSubtitle(self, index=None):
        return self.js("command", "SetSubtitleStreamIndex", {"Index": str(int(index))})

    def _doAudio(self, index=None):
        return self.js("command", "SetAudioStreamIndex", {"Index": str(int(index))})

    def _doPlay(self, value=None):
        """Play an item on the TV. value: {"id": ..., "fromStart": bool}."""
        value = value or {}
        self.session.bringToFront()
        result = self.js("play", value["id"], bool(value.get("fromStart")))
        self.js("forgetDetail")
        return result

    def _doSeason(self, seasonId=None):
        """Show another season's episodes on the phone (the TV stays put)."""
        if not seasonId:
            raise ValueError("No season given")
        return self.js("pickSeason", str(seasonId))

    def _doShow(self, itemId=None):
        """Open an item's page on the TV."""
        self.session.bringToFront()
        return self.js("display", itemId)

    def _doSearch(self, query=None):
        query = (query or "").strip()
        if not query:
            raise ValueError("Empty search query")
        return self.js("search", query)

    def _doLayout(self, layout=None):
        if layout not in ("tv", "desktop"):
            raise ValueError("Layout must be tv or desktop")
        return self.js("setLayout", layout)

    # Library for the phone.

    def _doLibrary(self):
        return self.js("home")

    def _doBrowse(self, value=None):
        value = value or {}
        return self.js("browse", value["id"], int(value.get("start", 0)))

    def _doItem(self, itemId=None):
        return self.js("item", itemId)

    # Browser-level actions (these use the WebDriver on the Jellyfin tab).

    def _doFullscreen(self):
        if self.driver.execute_script("return !!document.fullscreenElement"):
            self.driver.execute_script("document.exitFullscreen()")
            return "exitFullscreen"
        buttons = self.driver.find_elements(By.CSS_SELECTOR, ".btnFullscreen")
        visible = [b for b in buttons if b.is_displayed()]
        if not visible:
            raise ValueError("Fullscreen works while a video is playing")
        ActionChains(self.driver).move_to_element(visible[0]).click().perform()
        return "fullscreen"
