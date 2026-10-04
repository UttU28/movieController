"""YouTube remote: TV-style navigation of youtube.com in the shared Chrome.

Navigation (focus ring, spatial D-pad moves, selection) runs inside the page
via pageScripts/youtube.js; shortcuts that need trusted key events
(fullscreen, captions, shorts) go through Selenium's ActionChains.
"""

import time
from urllib.parse import quote_plus

from selenium.common.exceptions import WebDriverException
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

from chromeApp import ChromeApp
from chromeSession import pageScript

YOUTUBE_URL = "https://www.youtube.com/"

SEEK_SECONDS = 10
VOLUME_STEP = 10
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
    SCRIPT = pageScript("youtube.js")
    NAMESPACE = "__ytr"

    # ------------------------------------------------------------------ helpers

    def keys(self, *keys, shift=False):
        self.js("blur")
        chain = ActionChains(self.driver)
        if shift:
            chain.key_down(Keys.SHIFT)
        for key in keys:
            chain.send_keys(key)
        if shift:
            chain.key_up(Keys.SHIFT)
        chain.perform()

    def isFullscreen(self):
        return self.driver.execute_script("return !!document.fullscreenElement")

    def waitForUrlChange(self, oldUrl, timeout=1.5):
        end = time.time() + timeout
        while time.time() < end:
            if self.driver.current_url != oldUrl:
                return True
            time.sleep(0.1)
        return False

    def pageState(self):
        # Skip Ad is pressed by autoSkip as soon as it shows up.
        return self.js("state")

    def focusPlayer(self):
        """Give the player keyboard focus so YouTube's own shortcuts
        (arrows = volume, m = mute) apply to it without scrolling the page."""
        return self.driver.execute_script(
            "const p = window.__ytr && window.__ytr.activePlayer();"
            "if (!p) return false; p.focus({preventScroll: true}); return true;"
        )

    # ------------------------------------------------------------------ navigation

    def move(self, direction):
        page = self.page()

        # Fullscreen video behaves like a TV player: arrows seek / change volume.
        if page == "watch" and self.isFullscreen():
            if direction in ("left", "right"):
                self.js("seek", SEEK_SECONDS if direction == "right" else -SEEK_SECONDS)
            else:
                self.js("volume", VOLUME_STEP if direction == "up" else -VOLUME_STEP)
            return {"mode": "player"}

        # Shorts: up/down swipe between shorts.
        if page == "shorts" and direction in ("up", "down"):
            self.keys(Keys.ARROW_UP if direction == "up" else Keys.ARROW_DOWN)
            return {"mode": "shorts"}

        result = self.js("move", direction)
        if result.get("edge") and direction == "down":
            # Give YouTube a moment to lazy-load more tiles, then retry.
            time.sleep(0.8)
            result = self.js("move", direction)
        return result

    def _doSelect(self):
        if self.page() == "shorts":
            return {"action": "playPause", "ok": self.js("playPause")}
        before = self.driver.current_url
        result = self.js("select")
        href = result.get("href")
        if result.get("action") == "click" and href and "youtube.com" in href:
            if not self.waitForUrlChange(before):
                self.driver.get(href)
        return result

    def _doBack(self):
        if self.isFullscreen():
            self.keys("f")
            return "exitFullscreen"
        self.driver.back()
        return "back"

    def _doHome(self):
        if not self.js("goHome"):
            self.driver.get(YOUTUBE_URL)
        return "home"

    def openHref(self, href, missing):
        if not href:
            raise ValueError(missing)
        self.driver.get(href)
        return href

    def _doOpenResult(self, index=None):
        """Play search result number `index` (from the phone's result list)."""
        return self.openHref(self.js("resultHref", int(index)), "That result isn't on the page any more")

    def _doOpenUpNext(self, index=None):
        """Play recommendation number `index` from the watch page's sidebar."""
        return self.openHref(self.js("upNextHref", int(index)), "That recommendation isn't on the page any more")

    def _doSearch(self, query=None):
        query = (query or "").strip()
        if not query:
            raise ValueError("Empty search query")
        self.driver.get(f"{YOUTUBE_URL}results?search_query={quote_plus(query)}")
        return query

    def _doClearFocus(self):
        self.js("clearFocus")
        return "cleared"

    # ------------------------------------------------------------------ playback

    def _doPlayPause(self):
        return self.js("playPause")

    def _doSeekBack(self):
        return self.js("seek", -SEEK_SECONDS)

    def _doSeekForward(self):
        return self.js("seek", SEEK_SECONDS)

    def _doSeekTo(self, fraction=None):
        return self.js("seekTo", float(fraction))

    def volumeKeys(self, key, presses):
        # Real key presses show YouTube's volume overlay on screen and go
        # through the same path as a keyboard; the JS API is the fallback.
        visible = self.driver.execute_script("return document.visibilityState") == "visible"
        if visible and self.page() in ("watch", "shorts") and self.focusPlayer():
            ActionChains(self.driver).send_keys(key * presses).perform()
            return True
        return False

    def _doVolumeUp(self):
        return self.volumeKeys(Keys.ARROW_UP, VOLUME_KEY_PRESSES) or self.js("volume", VOLUME_STEP)

    def _doVolumeDown(self):
        return self.volumeKeys(Keys.ARROW_DOWN, VOLUME_KEY_PRESSES) or self.js("volume", -VOLUME_STEP)

    def _doMute(self):
        return self.volumeKeys("m", 1) or self.js("toggleMute")

    def _doSpeed(self):
        return self.js("cycleSpeed")

    def _doSkipAd(self):
        # YouTube ignores synthetic element.click() on the skip button, so
        # click it through WebDriver (a real, trusted mouse click).
        for button in self.driver.find_elements(By.CSS_SELECTOR, SKIP_AD_SELECTOR):
            try:
                if button.is_displayed():
                    ActionChains(self.driver).move_to_element(button).click().perform()
                    return True
            except WebDriverException:
                continue
        return self.js("skipAd")

    def _doNext(self):
        if self.page() == "shorts":
            self.keys(Keys.ARROW_DOWN)
            return "nextShort"
        if not self.js("clickNext"):
            self.keys("n", shift=True)
        return "next"

    def _doPrevious(self):
        page = self.page()
        if page == "shorts":
            self.keys(Keys.ARROW_UP)
            return "prevShort"
        if page == "watch" and "list=" in self.driver.current_url:
            self.keys("p", shift=True)
            return "prevInPlaylist"
        self.driver.back()
        return "back"

    def _doFullscreen(self):
        self.keys("f")
        return "fullscreen"

    def _doTheater(self):
        self.keys("t")
        return "theater"

    def _doCaptions(self):
        self.keys("c")
        return "captions"

    def _doMiniplayer(self):
        """The "i" button: YouTube's own `i` shortcut, which shrinks the video
        into the miniplayer or expands the miniplayer back to full page."""
        self.keys("i")
        return "miniplayer"
