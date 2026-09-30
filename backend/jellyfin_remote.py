"""Jellyfin remote for the Jellyfin web client open in the shared Chrome.

Unlike the other apps, Jellyfin has a proper remote-control protocol: the
web tab is a Jellyfin "session" that obeys commands (MoveUp, Select, Back,
Pause, Seek, SetSubtitleStreamIndex, DisplayContent, ...). jellyfin.js sends
those through the tab's own logged-in ApiClient and also reads the library for
the phone. It runs over the tab's DevTools socket, so everything works with
the Jellyfin tab in the background; the WebDriver is only needed for bringing
the tab forward and for fullscreen.
"""

import json
import os
import time
from pathlib import Path
from urllib.parse import urlparse

from selenium.common.exceptions import WebDriverException
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By

from chrome_session import ChromeApp

BASE_DIR = Path(__file__).resolve().parent
JELLYFIN_JS = (BASE_DIR / "jellyfin.js").read_text(encoding="utf-8")
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


class JellyfinRemote(ChromeApp):
    NAME = "jellyfin"
    HOSTS = (urlparse(JELLYFIN_URL).netloc,)
    HOME_URL = f"{JELLYFIN_URL}/web/#/home"

    # ------------------------------------------------------------------ helpers

    def _tab(self):
        return self.session.find_tab(self.HOSTS)

    def _js(self, fn, *args):
        tab = self._tab()
        if tab is None:
            raise ValueError("Jellyfin isn't open in Chrome")
        call = f"window.__jfr.{fn}({', '.join(json.dumps(a) for a in args)})"
        return self.session.eval_in_tab(tab, f"(async () => {{ {JELLYFIN_JS}\n return await {call}; }})()")

    def _page_state(self):
        return self._js("state")

    def _state(self):
        state = self._page_state()
        state["app"] = self.NAME
        state["browser"] = "running"
        state["tvMode"] = self.session.tv_mode if self.driver else False
        return state

    # ------------------------------------------------------------------ public

    def state(self):
        """Works whichever tab Chrome is showing: Jellyfin is controlled
        through its session, not by the tab being in front."""
        try:
            with self.session.lock:
                if not self.session.connect(launch=False):
                    return {"app": self.NAME, "browser": "stopped"}
            if self._tab() is None:
                return {"app": self.NAME, "browser": "running", "pageType": "noTab"}
            return self._state()
        except (WebDriverException, RuntimeError, OSError) as e:
            return {"app": self.NAME, "browser": "error", "error": str(e).splitlines()[0]}

    def run(self, action, value=None):
        # Only some actions need the WebDriver (and its lock).
        # Playing needs the tab in front: Chrome throttles background tabs so
        # hard that the web player can't start there.
        needs_driver = action in ("focus", "tvMode", "fullscreen", "reload", "play", "show")
        try:
            if self._tab() is None:
                with self.session.lock:
                    self._ensure()
                self._wait_until_ready()
            if needs_driver:
                with self.session.lock:
                    self._ensure()
                    return self._run_action(action, value)
            return self._run_action(action, value)
        except RuntimeError as e:
            # Errors from the page script (e.g. Jellyfin rejecting a command).
            raise ValueError(str(e))

    def _wait_until_ready(self, timeout=15):
        """A freshly opened tab needs a moment before its ApiClient exists."""
        end = time.time() + timeout
        while time.time() < end:
            try:
                if self._js("state").get("pageType") not in (None, "login"):
                    return
            except (RuntimeError, OSError, ValueError):
                pass
            time.sleep(0.5)

    def _run_action(self, action, value):
        handler = getattr(self, f"_do_{action}", None)
        if action in COMMANDS and handler is None:
            result = self._command(action)
        elif action in PLAYSTATE and handler is None:
            result = self._js("playstate", PLAYSTATE[action])
        elif handler is not None:
            result = handler(value) if value is not None else handler()
        else:
            raise ValueError(f"Unknown jellyfin action '{action}'")
        time.sleep(0.15)
        return {"result": result, "state": self._state()}

    def _command(self, action):
        # In the player the D-pad works like a TV: seek and volume, OK pauses.
        if action in ("left", "right", "select") and self._player_open():
            if action == "select":
                return self._js("playstate", "PlayPause")
            return self._js("seekBy", SEEK_SECONDS if action == "right" else -SEEK_SECONDS)
        if action in ("up", "down") and self._player_open():
            return self._js("command", "VolumeUp" if action == "up" else "VolumeDown")
        return self._js("command", COMMANDS[action])

    def _player_open(self):
        state = self._js("state")
        return state.get("pageType") == "player"

    # ------------------------------------------------------------------ actions

    def _do_seekBack(self):
        return self._js("seekBy", -SEEK_SECONDS)

    def _do_seekForward(self):
        return self._js("seekBy", SEEK_SECONDS)

    def _do_seekTo(self, fraction=None):
        return self._js("seekTo", float(fraction))

    def _do_skip(self):
        """Skip Intro / other media segments, when Jellyfin offers it."""
        return self._js("skip")

    def _do_subtitle(self, index=None):
        return self._js("command", "SetSubtitleStreamIndex", {"Index": str(int(index))})

    def _do_audio(self, index=None):
        return self._js("command", "SetAudioStreamIndex", {"Index": str(int(index))})

    def _do_play(self, value=None):
        """Play an item on the TV. value: {"id": ..., "fromStart": bool}."""
        value = value or {}
        self.session.bring_to_front()
        return self._js("play", value["id"], bool(value.get("fromStart")))

    def _do_show(self, item_id=None):
        """Open an item's page on the TV."""
        self.session.bring_to_front()
        return self._js("display", item_id)

    def _do_search(self, query=None):
        query = (query or "").strip()
        if not query:
            raise ValueError("Empty search query")
        return self._js("search", query)

    def _do_layout(self, layout=None):
        if layout not in ("tv", "desktop"):
            raise ValueError("Layout must be tv or desktop")
        return self._js("setLayout", layout)

    # Library for the phone.

    def _do_library(self):
        return self._js("home")

    def _do_browse(self, value=None):
        value = value or {}
        return self._js("browse", value["id"], int(value.get("start", 0)))

    def _do_item(self, item_id=None):
        return self._js("item", item_id)

    # Browser-level actions (these use the WebDriver on the Jellyfin tab).

    def _do_fullscreen(self):
        if self.driver.execute_script("return !!document.fullscreenElement"):
            self.driver.execute_script("document.exitFullscreen()")
            return "exitFullscreen"
        buttons = self.driver.find_elements(By.CSS_SELECTOR, ".btnFullscreen")
        visible = [b for b in buttons if b.is_displayed()]
        if not visible:
            raise ValueError("Fullscreen works while a video is playing")
        ActionChains(self.driver).move_to_element(visible[0]).click().perform()
        return "fullscreen"
