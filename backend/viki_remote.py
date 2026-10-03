"""Viki remote: TV-style navigation of viki.com in the shared Chrome.

viki.js reads the page (tiles, episode ranges, episodes, player) and moves the
focus ring. Viki shows and episodes are plain links, so most things open by
navigating; the few buttons Viki might ignore when clicked from script (the
show's Play button, skip, next episode) get a real mouse click from Selenium.
Playback itself (play/pause, seek, volume) goes straight to the <video>.
"""

import json
import time
from pathlib import Path
from urllib.parse import quote_plus

from selenium.common.exceptions import WebDriverException
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

import chrome_session
from chrome_session import ChromeApp

BASE_DIR = Path(__file__).resolve().parent
VIKI_JS = (BASE_DIR / "viki.js").read_text(encoding="utf-8")
VIKI_URL = "https://www.viki.com/"
CLICK_TARGET = "[data-vk-click]"

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
    HOME_URL = VIKI_URL
    # Subtitle tracks the phone has been asked to choose from, if any.
    _subtitle_choices = None

    # ------------------------------------------------------------------ helpers

    def _tab(self):
        """The driver's tab, for talking to it over its own DevTools socket."""
        tab_id = self.driver.current_window_handle
        return {"id": tab_id,
                "webSocketDebuggerUrl": f"ws://127.0.0.1:{chrome_session.DEBUG_PORT}/devtools/page/{tab_id}"}

    def _js(self, fn, *args):
        """Call window.__vk.<fn>. Goes over the tab's DevTools socket rather
        than WebDriver: WebDriver holds every script until a page has fully
        loaded, and a Viki episode page with its ads can take a minute."""
        expr = VIKI_JS + f"\nwindow.__vk.{fn}.apply(null, {json.dumps(list(args))});"
        return self.session.eval_in_tab(self._tab(), expr, timeout=6)

    def pause_playback(self):
        tab = self.session.find_tab(self.HOSTS)
        if tab is None:
            return False
        try:
            return bool(self.session.eval_in_tab(tab, VIKI_JS + "\nwindow.__vk.pause();"))
        except Exception as e:
            print(f"viki pause failed: {e}")
            return False

    def _page_state(self):
        state = self._js("state")
        # Subtitle tracks waiting for the phone to pick one (same video only).
        choices = self._subtitle_choices
        if choices and state.get("player") and choices["url"] == state.get("url"):
            state["player"]["subtitleOptions"] = choices["options"]
        return state

    def _page(self):
        return self._js("state")["pageType"]

    def _click_marked(self):
        """Real mouse click on the element viki.js marked with CLICK_TARGET."""
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
        videos = self.driver.find_elements(By.CSS_SELECTOR, "video")
        if not videos:
            return
        try:
            chain = ActionChains(self.driver)
            chain.move_to_element_with_offset(videos[0], -40, 20)
            chain.move_to_element_with_offset(videos[0], 40, -20)
            chain.perform()
        except WebDriverException:
            return
        time.sleep(0.25)

    def _player_button(self, name):
        self._wake_controls()
        if not self._js("markPlayerButton", PLAYER_BUTTONS[name]):
            return False
        clicked = self._click_marked()
        self._rest_pointer()
        return clicked

    def _key(self, key):
        ActionChains(self.driver).send_keys(key).perform()

    def _open(self, href, plays=False):
        """Go to a page without waiting for all of Viki to finish loading
        (that can take half a minute); the remote answers as soon as the
        new page is up."""
        tab = self._tab()
        old = self.session.eval_in_tab(tab, "location.href", timeout=3)
        self.session.eval_in_tab(tab, f"location.assign({json.dumps(href)})", timeout=4)
        end = time.time() + 8
        while time.time() < end:
            time.sleep(0.3)
            try:
                if self.session.eval_in_tab(tab, "location.href", timeout=2) != old:
                    break
            except Exception:
                pass  # mid-navigation; ask again
        if plays:
            self._started_playing()

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
            self._open(result["href"], result.get("plays"))
        elif result.get("action") == "click" and result.get("ok"):
            self._click_marked()
            if result.get("plays"):
                self._started_playing()
        return result

    def _do_back(self):
        if self._page() == "player" and self.session.eval_in_tab(self._tab(), "!!document.fullscreenElement", timeout=3):
            self._key(Keys.ESCAPE)
            return "exitFullscreen"
        self.session.eval_in_tab(self._tab(), "history.back()", timeout=3)
        return "back"

    def _do_search(self, query=None):
        query = (query or "").strip()
        if not query:
            raise ValueError("Empty search query")
        self._open(f"https://www.viki.com/search?q={quote_plus(query)}")
        return query

    def _do_section(self, name=None):
        if name not in SECTIONS:
            raise ValueError(f"Unknown Viki section '{name}'")
        self._open("https://www.viki.com" + SECTIONS[name])
        return name

    def _do_home(self):
        return self._do_section("home")

    # ------------------------------------------------------------------ show page

    def _started_playing(self, timeout=10):
        """Wait for the player to load (the page is answered over DevTools,
        so this doesn't wait for everything else on it)."""
        end = time.time() + timeout
        while time.time() < end:
            try:
                page = self._page()
            except Exception:
                page = None  # between pages; ask again
            if page == "player":
                return True
            if page == "login":
                return False
            time.sleep(0.3)
        return False

    def _do_play(self):
        """The big Play button on a show or movie page."""
        if not self._js("markPlay"):
            raise ValueError("No play button on this page")
        self._click_marked()
        return self._started_playing()

    def _do_playEpisode(self, index=None):
        found = self._js("episode", int(index))
        if not found:
            raise ValueError(f"Episode {index} isn't on this page")
        if found.get("href"):
            self._open(found["href"], plays=True)
            return True
        self._click_marked()
        return self._started_playing()

    def _ranges(self):
        detail = self._js("state").get("detail") or {}
        return detail.get("seasons") or []

    def _do_season(self, index=None):
        """Show one block of episodes (Viki splits long shows into 1-10, 11-20, ...)."""
        label = self._js("range", int(index))
        if label is None:
            raise ValueError("No such episode range")
        time.sleep(0.6)
        return label

    def _step_season(self, step):
        ranges = self._ranges()
        if not ranges:
            raise ValueError("This title has only one page of episodes")
        current = next((i for i, s in enumerate(ranges) if s.get("selected")), 0)
        target = current + step
        if not 0 <= target < len(ranges):
            return {"edge": True, "season": ranges[current]["label"]}
        return self._do_season(target)

    def _do_nextSeason(self):
        return self._step_season(1)

    def _do_prevSeason(self):
        return self._step_season(-1)

    # ------------------------------------------------------------------ player

    def _do_playPause(self):
        if self._page() != "player":
            return self._do_play()
        before = self._js("paused")
        self._js("playPause")
        time.sleep(0.4)
        if self._js("paused") == before:
            # The page refused a scripted play: press Space like a person.
            self._key(Keys.SPACE)
        return "playPause"

    def _do_seekBack(self):
        return self._js("seek", -SEEK_SECONDS)

    def _do_seekForward(self):
        return self._js("seek", SEEK_SECONDS)

    def _do_volumeUp(self):
        return self._js("volume", VOLUME_STEP)

    def _do_volumeDown(self):
        return self._js("volume", -VOLUME_STEP)

    def _do_mute(self):
        return self._js("mute")

    def _rest_pointer(self):
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

    def _open_subtitle_menu(self):
        """Hover the subtitles button until its menu shows (click if hovering
        isn't enough). True once the menu is open."""
        self._wake_controls()
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
                if self._js("subtitleMenuOpen"):
                    return True
                time.sleep(0.15)
        return False

    def _do_subtitles(self, pick=None):
        """English subtitles on/off. Viki's button holds a language menu: on
        picks Off, off picks English. With several English tracks (or none)
        the phone is shown the choices, and picking one comes back as `pick`
        (the menu row). The menu is closed again either way."""
        self._subtitle_choices = None
        if not self._open_subtitle_menu():
            self._rest_pointer()
            return False
        try:
            found = self._js("markSubtitle", None if pick is None else int(pick))
            if not found:
                return False
            if found.get("choose"):
                self._subtitle_choices = {"url": self.session.eval_in_tab(self._tab(), "location.href", timeout=3), "options": found["choose"]}
                return found
            picked = found.get("picked")
            for _ in range(2):
                self._click_marked()
                time.sleep(0.4)
                if self._js("subtitleOn") == picked:
                    break
            return picked
        finally:
            self._rest_pointer()

    def _do_closeSubtitles(self):
        self._subtitle_choices = None
        return True

    def _do_fullscreen(self):
        if not self._player_button("fullscreen"):
            self._key("f")
        return "fullscreen"

    def _do_skip(self):
        """Skip the ad that's playing, else Skip Intro / Skip Recap."""
        if self._js("skipAd"):
            return "ad"
        self._wake_controls()
        if not self._js("markSkip"):
            return False
        clicked = self._click_marked()
        self._rest_pointer()
        return clicked

    def _do_next(self):
        """Next episode: the player's own button, else the next one in the list."""
        if self._page() != "player":
            raise ValueError("Nothing is playing")
        self._wake_controls()
        found = self._js("next")
        if not found:
            return False
        if found.get("href"):
            self._open(found["href"], plays=True)
            return True
        self._click_marked()
        return self._started_playing()
