"""YouTube remote: TV-style navigation of youtube.com in the shared Chrome.

Navigation (focus ring, spatial D-pad moves, selection) runs inside the page
via remote.js; shortcuts that need trusted key events (fullscreen, captions,
shorts) go through Selenium's ActionChains.
"""

import time
from pathlib import Path
from urllib.parse import quote_plus

from selenium.common.exceptions import WebDriverException
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

from chrome_session import ChromeApp

BASE_DIR = Path(__file__).resolve().parent
REMOTE_JS = (BASE_DIR / "remote.js").read_text(encoding="utf-8")
YOUTUBE_URL = "https://www.youtube.com/"

SEEK_SECONDS = 10
VOLUME_STEP = 10
# How long to wait before clicking Skip again if the button is still up.
SKIP_AD_RETRY_SECONDS = 1.5
# YouTube's ArrowUp/Down shortcut changes volume by 5%.
VOLUME_KEY_PRESSES = VOLUME_STEP // 5

SKIP_AD_SELECTOR = ", ".join([
    ".ytp-skip-ad-button",
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-modern",
    "button[id^='skip-button']",
])


class YouTubeRemote(ChromeApp):
    NAME = "youtube"
    HOSTS = ("youtube.com",)
    HOME_URL = YOUTUBE_URL

    def __init__(self, session):
        super().__init__(session)
        self._last_ad_skip = 0.0

    # ------------------------------------------------------------------ helpers

    def _js(self, fn, *args):
        script = REMOTE_JS + f"\nreturn window.__ytr.{fn}.apply(null, arguments);"
        return self.driver.execute_script(script, *args)

    def pause_playback(self):
        tab = self.session.find_tab(self.HOSTS)
        if tab is None:
            return False
        try:
            return bool(self.session.eval_in_tab(tab, REMOTE_JS + "\nwindow.__ytr.pause();"))
        except Exception as e:
            print(f"youtube pause failed: {e}")
            return False

    def _keys(self, *keys, shift=False):
        self._js("blur")
        chain = ActionChains(self.driver)
        if shift:
            chain.key_down(Keys.SHIFT)
        for k in keys:
            chain.send_keys(k)
        if shift:
            chain.key_up(Keys.SHIFT)
        chain.perform()

    def _page(self):
        return self._js("state")["pageType"]

    def _wait_for_url_change(self, old_url, timeout=1.5):
        end = time.time() + timeout
        while time.time() < end:
            if self.driver.current_url != old_url:
                return True
            time.sleep(0.1)
        return False

    def _maybe_skip_ad(self, state):
        """Press Skip as soon as YouTube shows the button."""
        player = (state or {}).get("player") or {}
        if not player.get("canSkipAd"):
            return state
        now = time.time()
        if now - self._last_ad_skip < SKIP_AD_RETRY_SECONDS:
            return state
        self._last_ad_skip = now
        try:
            self._do_skipAd()
            return self._js("state")
        except WebDriverException:
            return state

    def _page_state(self):
        return self._maybe_skip_ad(self._js("state"))

    def _focus_player(self):
        """Give the player keyboard focus so YouTube's own shortcuts
        (arrows = volume, m = mute) apply to it without scrolling the page."""
        return self.driver.execute_script(
            "const p = window.__ytr && window.__ytr.activePlayer();"
            "if (!p) return false; p.focus({preventScroll: true}); return true;"
        )

    # ------------------------------------------------------------------ navigation

    def _move(self, direction):
        page = self._page()
        fullscreen = self.driver.execute_script("return !!document.fullscreenElement")

        # Fullscreen video behaves like a TV player: arrows seek / change volume.
        if page == "watch" and fullscreen:
            if direction in ("left", "right"):
                self._js("seek", SEEK_SECONDS if direction == "right" else -SEEK_SECONDS)
            else:
                self._js("volume", VOLUME_STEP if direction == "up" else -VOLUME_STEP)
            return {"mode": "player"}

        # Shorts: up/down swipe between shorts.
        if page == "shorts" and direction in ("up", "down"):
            self._keys(Keys.ARROW_UP if direction == "up" else Keys.ARROW_DOWN)
            return {"mode": "shorts"}

        result = self._js("move", direction)
        if result.get("edge") and direction == "down":
            # Give YouTube a moment to lazy-load more tiles, then retry.
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
        page = self._page()
        if page == "shorts":
            return {"action": "playPause", "ok": self._js("playPause")}
        before = self.driver.current_url
        result = self._js("select")
        href = result.get("href")
        if result.get("action") == "click" and href and "youtube.com" in href:
            if not self._wait_for_url_change(before):
                self.driver.get(href)
        return result

    def _do_back(self):
        if self.driver.execute_script("return !!document.fullscreenElement"):
            self._keys("f")
            return "exitFullscreen"
        self.driver.back()
        return "back"

    def _do_home(self):
        if not self._js("goHome"):
            self.driver.get(YOUTUBE_URL)
        return "home"

    def _do_openResult(self, index=None):
        """Play search result number `index` (from the phone's result list)."""
        href = self._js("resultHref", int(index))
        if not href:
            raise ValueError("That result isn't on the page any more")
        self.driver.get(href)
        return href

    def _do_search(self, query=None):
        query = (query or "").strip()
        if not query:
            raise ValueError("Empty search query")
        self.driver.get(f"{YOUTUBE_URL}results?search_query={quote_plus(query)}")
        return query

    def _do_clearFocus(self):
        self._js("clearFocus")
        return "cleared"

    # ------------------------------------------------------------------ playback

    def _do_playPause(self):
        return self._js("playPause")

    def _do_seekBack(self):
        return self._js("seek", -SEEK_SECONDS)

    def _do_seekForward(self):
        return self._js("seek", SEEK_SECONDS)

    def _do_seekTo(self, fraction=None):
        return self._js("seekTo", float(fraction))

    def _volume_keys(self, key, presses):
        # Real key presses show YouTube's volume overlay on screen and go
        # through the same path as a keyboard; the JS API is the fallback.
        visible = self.driver.execute_script("return document.visibilityState") == "visible"
        if visible and self._page() in ("watch", "shorts") and self._focus_player():
            ActionChains(self.driver).send_keys(key * presses).perform()
            return True
        return False

    def _do_volumeUp(self):
        return self._volume_keys(Keys.ARROW_UP, VOLUME_KEY_PRESSES) or self._js("volume", VOLUME_STEP)

    def _do_volumeDown(self):
        return self._volume_keys(Keys.ARROW_DOWN, VOLUME_KEY_PRESSES) or self._js("volume", -VOLUME_STEP)

    def _do_mute(self):
        return self._volume_keys("m", 1) or self._js("toggleMute")

    def _do_speed(self):
        return self._js("cycleSpeed")

    def _do_skipAd(self):
        # YouTube ignores synthetic element.click() on the skip button, so
        # click it through WebDriver (a real, trusted mouse click).
        for button in self.driver.find_elements(By.CSS_SELECTOR, SKIP_AD_SELECTOR):
            try:
                if button.is_displayed():
                    ActionChains(self.driver).move_to_element(button).click().perform()
                    return True
            except WebDriverException:
                continue
        return self._js("skipAd")

    def _do_next(self):
        page = self._page()
        if page == "shorts":
            self._keys(Keys.ARROW_DOWN)
            return "nextShort"
        if not self._js("clickNext"):
            self._keys("n", shift=True)
        return "next"

    def _do_previous(self):
        page = self._page()
        if page == "shorts":
            self._keys(Keys.ARROW_UP)
            return "prevShort"
        if page == "watch" and "list=" in self.driver.current_url:
            self._keys("p", shift=True)
            return "prevInPlaylist"
        self.driver.back()
        return "back"

    def _do_fullscreen(self):
        self._keys("f")
        return "fullscreen"

    def _do_theater(self):
        self._keys("t")
        return "theater"

    def _do_captions(self):
        self._keys("c")
        return "captions"

    def _do_miniplayer(self):
        """The "i" button: YouTube's own `i` shortcut, which shrinks the video
        into the miniplayer or expands the miniplayer back to full page."""
        self._keys("i")
        return "miniplayer"
