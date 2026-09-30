"""Netflix remote: TV-style navigation of netflix.com in the shared Chrome.

netflix.js reads the page (profiles, rows, the title pop-up, the player) and
moves the focus ring. Clicks go through Selenium as real mouse clicks. Netflix
ignores synthetic key presses, so playback (pause, seek, volume) goes through
its own player API instead.
"""

import time
from pathlib import Path
from urllib.parse import quote_plus

from selenium.common.exceptions import WebDriverException
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By

from chrome_session import ChromeApp

BASE_DIR = Path(__file__).resolve().parent
NETFLIX_JS = (BASE_DIR / "netflix.js").read_text(encoding="utf-8")
NETFLIX_URL = "https://www.netflix.com/browse"
CLICK_TARGET = "[data-nfr-click]"

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
    HOME_URL = NETFLIX_URL

    def __init__(self, session):
        super().__init__(session)
        # Season names per title page; reading them means opening a dropdown.
        self._seasons = {}
        self._woken = None

    # ------------------------------------------------------------------ helpers

    def _js(self, fn, *args):
        script = NETFLIX_JS + f"\nreturn window.__nfr.{fn}.apply(null, arguments);"
        return self.driver.execute_script(script, *args)

    def _page(self):
        return self._js("state")["pageType"]

    def _page_state(self):
        state = self._js("state")
        detail = state.get("detail")
        if detail is not None:
            # Only shows have a season dropdown; it appears once the pop-up
            # has finished loading, so don't cache until it's there.
            key = self.driver.current_url.split("?")[0]
            if key not in self._seasons and detail.get("season"):
                self._seasons[key] = self._js("seasons")
            detail["seasons"] = [
                {"label": name, "selected": name == detail.get("season")}
                for name in self._seasons.get(key, [])
            ]
        player = state.get("player")
        if player and not player.get("subtitle") and self._woken != self.driver.current_url:
            # Joined a video that was already playing: show the controls once
            # so the title and episode can be read.
            self._woken = self.driver.current_url
            self._wake_controls()
            state = self._js("state")
            state["detail"] = detail
        return state

    def _click_marked(self):
        """Real mouse click on the element netflix.js marked with CLICK_TARGET."""
        elements = self.driver.find_elements(By.CSS_SELECTOR, CLICK_TARGET)
        if not elements:
            return False
        try:
            ActionChains(self.driver).move_to_element(elements[0]).click().perform()
        except WebDriverException:
            self.driver.execute_script("arguments[0].click()", elements[0])
        return True

    def _wake_controls(self):
        """Netflix hides its control bar until the mouse moves."""
        players = self.driver.find_elements(By.CSS_SELECTOR, "[data-uia='player'], .watch-video")
        if not players:
            return
        chain = ActionChains(self.driver)
        chain.move_to_element_with_offset(players[0], -30, 10)
        chain.move_to_element_with_offset(players[0], 30, -10)
        chain.perform()
        time.sleep(0.25)

    def _in_player(self):
        return self._page() == "player"

    def _started_playing(self, timeout=10):
        """Wait for the player, then show its controls once so the phone
        learns the title / episode."""
        end = time.time() + timeout
        while time.time() < end:
            if self._in_player():
                time.sleep(1.5)
                self._wake_controls()
                return True
            time.sleep(0.3)
        return False

    def _open(self, href):
        before = self.driver.current_url
        self._click_marked()
        deadline = time.time() + 2
        while time.time() < deadline:
            if self.driver.current_url != before:
                return
            time.sleep(0.15)
        self.driver.get(href)

    # ------------------------------------------------------------------ navigation

    def _move(self, direction):
        if self._in_player():
            # In the player the D-pad works like a TV: seek and volume.
            if direction in ("left", "right"):
                return self._js("seek", SEEK_SECONDS if direction == "right" else -SEEK_SECONDS)
            return self._js("volume", VOLUME_STEP if direction == "up" else -VOLUME_STEP)

        result = self._js("move", direction)
        if result.get("page"):
            # Stepped past the edge of a row: press its arrow, then land on
            # the first new card.
            self._click_marked()
            time.sleep(0.9)
            result["moved"] = self._js("afterPage")
        elif result.get("edge") and direction == "down":
            time.sleep(0.8)
            result = self._js("move", direction)
        return result

    def _do_up(self):
        return self._move("up")

    def _do_down(self):
        return self._move("down")

    def _do_left(self):
        return self._move("left")

    def _do_right(self):
        return self._move("right")

    def _do_select(self):
        if self._in_player():
            return self._do_playPause()
        result = self._js("select")
        if result.get("action") == "open" and result.get("ok"):
            self._open(result["href"])
        elif result.get("action") == "click" and result.get("ok"):
            if result.get("href"):
                self._open(result["href"])
            else:
                self._click_marked()
            if result.get("plays"):
                self._started_playing()
        return result

    def _do_back(self):
        page = self._page()
        if page == "player":
            self.driver.back()
            return "closePlayer"
        if page == "detail" and self._js("closeModal"):
            return "closeDetail"
        self.driver.back()
        return "back"

    def _do_search(self, query=None):
        query = (query or "").strip()
        if not query:
            raise ValueError("Empty search query")
        self.driver.get(f"https://www.netflix.com/search?q={quote_plus(query)}")
        return query

    def _do_section(self, name=None):
        if name not in SECTIONS:
            raise ValueError(f"Unknown Netflix section '{name}'")
        self.driver.get(f"https://www.netflix.com{SECTIONS[name]}")
        return name

    def _do_home(self):
        return self._do_section("home")

    def _do_profile(self, index=None):
        if not self._js("markProfile", int(index)):
            raise ValueError("No such profile on this screen")
        self._click_marked()
        return index

    # ------------------------------------------------------------------ title pop-up

    def _do_play(self):
        """The Play / Resume button in the title pop-up (or on the billboard)."""
        target = self._js("markPlay")
        if not target:
            raise ValueError("No play button on this page")
        self._click_marked()
        if self._started_playing(timeout=3):
            return True
        if target.get("href"):
            self.driver.get(target["href"])
            return self._started_playing()
        return False

    def _do_playEpisode(self, index=None):
        if not self._js("markEpisode", int(index)):
            raise ValueError(f"Episode {index} isn't listed")
        self._click_marked()
        return self._started_playing()

    def _do_season(self, index=None):
        if not self._js("pickSeason", int(index)):
            raise ValueError("No such season")
        return int(index)

    # ------------------------------------------------------------------ player

    def _do_playPause(self):
        if not self._in_player():
            return self._do_play()
        return self._js("playPause")

    def _do_seekBack(self):
        return self._js("seek", -SEEK_SECONDS)

    def _do_seekForward(self):
        return self._js("seek", SEEK_SECONDS)

    def _do_volumeUp(self):
        return self._js("volume", VOLUME_STEP)

    def _do_volumeDown(self):
        return self._js("volume", -VOLUME_STEP)

    def _do_mute(self):
        return self._js("toggleMute")

    def _do_fullscreen(self):
        # Both ways need a real click on the player's own button
        # (control-fullscreen-enter / control-fullscreen-exit).
        self._wake_controls()
        if self._js("markControl", "control-fullscreen"):
            return self._click_marked()
        return False

    def _do_subtitles(self):
        """Open Netflix's Audio & Subtitles menu."""
        self._wake_controls()
        if self._js("markControl", "control-audio-subtitle"):
            return self._click_marked()
        return False

    def _do_skip(self):
        """Skip Intro / Skip Recap, whichever Netflix is offering."""
        self._wake_controls()
        if not self._js("markSkip"):
            return False
        return self._click_marked()

    def _do_next(self):
        if not self._in_player():
            raise ValueError("Nothing is playing")
        self._wake_controls()
        if not self._js("markNext"):
            raise ValueError("No next episode")
        self._click_marked()
        return self._started_playing()
