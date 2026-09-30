"""Prime Video remote: TV-style navigation of primevideo.com in the shared Chrome.

prime.js reads the page (tiles, seasons, episodes, player) and moves the focus
ring. Anything Prime might ignore when clicked from script (play buttons, player
controls, skip intro) is clicked by Selenium with a real mouse click.
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
PRIME_JS = (BASE_DIR / "prime.js").read_text(encoding="utf-8")
PRIME_URL = "https://www.primevideo.com/"
CLICK_TARGET = "[data-prv-click]"

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
    HOME_URL = PRIME_URL

    # ------------------------------------------------------------------ helpers

    def _js(self, fn, *args):
        script = PRIME_JS + f"\nreturn window.__prv.{fn}.apply(null, arguments);"
        return self.driver.execute_script(script, *args)

    def _page_state(self):
        return self._js("state")

    def _page(self):
        return self._js("state")["pageType"]

    def _region_url(self, path):
        region = self._js("state").get("region") or ""
        return f"https://www.primevideo.com{region}{path}"

    def _click_marked(self):
        """Real mouse click on the element prime.js marked with CLICK_TARGET."""
        elements = self.driver.find_elements(By.CSS_SELECTOR, CLICK_TARGET)
        if not elements:
            return False
        try:
            ActionChains(self.driver).move_to_element(elements[0]).click().perform()
        except WebDriverException:
            self.driver.execute_script("arguments[0].click()", elements[0])
        return True

    def _wake_controls(self):
        """The player hides its controls until the mouse moves over it."""
        players = self.driver.find_elements(By.CSS_SELECTOR, "#dv-web-player")
        if not players:
            return
        chain = ActionChains(self.driver)
        chain.move_to_element_with_offset(players[0], -40, 20)
        chain.move_to_element_with_offset(players[0], 40, -20)
        chain.perform()
        time.sleep(0.25)

    def _player_button(self, name):
        self._wake_controls()
        if not self._js("markPlayerButton", PLAYER_BUTTONS[name]):
            return False
        return self._click_marked()

    def _key(self, key):
        ActionChains(self.driver).send_keys(key).perform()

    # ------------------------------------------------------------------ navigation

    def _move(self, direction):
        if self._page() == "player":
            # In the player the D-pad works like a TV: seek and volume.
            if direction == "left":
                return self._do_seekBack()
            if direction == "right":
                return self._do_seekForward()
            return self._js("volume", VOLUME_STEP if direction == "up" else -VOLUME_STEP)

        result = self._js("move", direction)
        if result.get("edge") and direction == "down":
            # Rows further down load lazily as the page scrolls.
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
        if self._page() == "player":
            return self._do_playPause()
        result = self._js("select")
        if result.get("action") == "open" and result.get("href"):
            self.driver.get(result["href"])
        elif result.get("action") == "click" and result.get("ok"):
            self._click_marked()
            if result.get("plays"):
                self._started_playing()
        return result

    def _do_back(self):
        if self._page() == "player":
            if not self._player_button("closePlayer"):
                self._key(Keys.ESCAPE)
            return "closePlayer"
        self.driver.back()
        return "back"

    def _do_search(self, query=None):
        query = (query or "").strip()
        if not query:
            raise ValueError("Empty search query")
        self.driver.get(self._region_url(f"/search/ref=atv_nb_sug?phrase={quote_plus(query)}"))
        return query

    def _do_section(self, name=None):
        if name not in SECTIONS:
            raise ValueError(f"Unknown Prime section '{name}'")
        self.driver.get(self._region_url(SECTIONS[name]))
        return name

    def _do_home(self):
        return self._do_section("home")

    # ------------------------------------------------------------------ detail page

    def _started_playing(self, timeout=8):
        """Wait for the player to open, then show its controls once so the
        phone learns the episode title and whether there's a next episode."""
        end = time.time() + timeout
        while time.time() < end:
            if self._page() == "player":
                time.sleep(1)
                self._wake_controls()
                return True
            time.sleep(0.3)
        return False

    def _do_play(self):
        """The big Play / Resume button on a title's page."""
        if not self._js("markPlay"):
            raise ValueError("No play button on this page")
        self._click_marked()
        return self._started_playing()

    def _do_playEpisode(self, index=None):
        if not self._js("markEpisode", int(index)):
            raise ValueError(f"Episode {index} isn't on this page")
        self._click_marked()
        return self._started_playing()

    def _seasons(self):
        detail = self._js("state").get("detail") or {}
        return detail.get("seasons") or []

    def _do_season(self, index=None):
        seasons = self._seasons()
        index = int(index)
        if not 0 <= index < len(seasons):
            raise ValueError("No such season")
        self.driver.get(seasons[index]["href"])
        return seasons[index]["label"]

    def _step_season(self, step):
        seasons = self._seasons()
        if not seasons:
            raise ValueError("This title has no seasons")
        current = next((i for i, s in enumerate(seasons) if s.get("selected")), 0)
        target = current + step
        if not 0 <= target < len(seasons):
            return {"edge": True, "season": seasons[current]["label"]}
        return self._do_season(target)

    def _do_nextSeason(self):
        return self._step_season(1)

    def _do_prevSeason(self):
        return self._step_season(-1)

    # ------------------------------------------------------------------ player

    def _do_playPause(self):
        if self._page() != "player":
            return self._do_play()
        if not self._player_button("playPause"):
            self._key(Keys.SPACE)
        return "playPause"

    def _do_seekBack(self):
        return self._player_button("seekBack")

    def _do_seekForward(self):
        return self._player_button("seekForward")

    def _do_volumeUp(self):
        return self._js("volume", VOLUME_STEP)

    def _do_volumeDown(self):
        return self._js("volume", -VOLUME_STEP)

    def _do_mute(self):
        return self._player_button("mute")

    def _do_subtitles(self):
        return self._player_button("subtitles")

    def _do_fullscreen(self):
        if not self._player_button("fullscreen"):
            self._key("f")
        return "fullscreen"

    def _do_skip(self):
        """Skip Intro / Skip Recap / skip ad, whichever Prime is offering."""
        self._wake_controls()
        if not self._js("markSkip"):
            return False
        return self._click_marked()

    def _do_next(self):
        """Next episode, from the player's button or the "Next up" card."""
        if self._page() != "player":
            raise ValueError("Nothing is playing")
        self._wake_controls()
        if not self._js("markNextUp"):
            return False
        return self._click_marked()
