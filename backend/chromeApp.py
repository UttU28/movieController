"""Base for a remote that drives one website in the shared Chrome."""

import time

from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By

from chromeSession import PageUnresponsive


class ChromeApp:
    """Subclasses set NAME / HOSTS / HOME_URL, implement pageState() and add
    `_do<Action>` handlers (action "playPause" -> _doPlayPause). Remotes
    whose page script runs through WebDriver set SCRIPT and NAMESPACE; those
    that click with a real mouse set CLICK_TARGET and PLAYER_SELECTOR.
    """

    NAME = ""
    HOSTS = ()
    HOME_URL = ""
    SCRIPT = ""
    NAMESPACE = ""
    CLICK_TARGET = ""
    PLAYER_SELECTOR = "video"
    WAKE_OFFSET = (40, 20)

    def __init__(self, session):
        self.session = session

    @property
    def driver(self):
        return self.session.driver

    def pageState(self):
        raise NotImplementedError

    def fullState(self):
        state = self.pageState()
        state["app"] = self.NAME
        state["browser"] = "running"
        state["tvMode"] = self.session.tvMode
        state["windowState"] = self.session.windowState()
        return state

    def state(self):
        """Snapshot of this app's tab. Attaches to a running Chrome but never
        launches one or changes which tab is showing; if Chrome is showing
        another app's tab the phone gets pageType "otherTab" and can offer to
        switch."""
        with self.session.locked(timeout=3):
            try:
                if not self.session.connect(launch=False):
                    return {"app": self.NAME, "browser": "stopped"}
                if not self.session.followVisible(self.HOSTS):
                    return {"app": self.NAME, "browser": "running", "pageType": "otherTab",
                            "url": self.driver.current_url}
                return self.fullState()
            except WebDriverException as e:
                self.session.teardown()
                return {"app": self.NAME, "browser": "error", "error": str(e).splitlines()[0]}

    def show(self):
        """Switch Chrome to this app's tab (opening it if needed) and bring it
        to the front. Called when you pick this app on the phone."""
        with self.session.locked(timeout=15):
            self.ensureTab()
            self.session.bringToFront()
            return self.fullState()

    def screenshot(self):
        with self.session.locked(timeout=10):
            try:
                if not self.session.connect(launch=False):
                    return None
                return self.driver.get_screenshot_as_png()
            except WebDriverException:
                return None

    def ensureTab(self):
        self.session.connect(launch=True)
        self.session.useTab(self.HOSTS, self.HOME_URL)

    def handlerFor(self, action):
        """The _do<Action> method for a phone action, or None."""
        if not isinstance(action, str) or not action:
            return None
        return getattr(self, f"_do{action[0].upper()}{action[1:]}", None)

    def run(self, action, value=None):
        with self.session.locked(timeout=15):
            try:
                return self.runAction(action, value)
            except TimeoutException as e:
                # The page hung (not the session): report it, don't retry.
                raise PageUnresponsive("The page took too long to respond.") from e
            except WebDriverException:
                # Session died mid-command (window closed, crash): restart once.
                self.session.teardown()
                return self.runAction(action, value)

    def runAction(self, action, value):
        self.ensureTab()
        handler = self.handlerFor(action)
        if handler is None:
            raise ValueError(f"Unknown {self.NAME} action '{action}'")
        result = handler(value) if value is not None else handler()
        time.sleep(0.05)
        return {"result": result, "state": self.fullState()}

    # ------------------------------------------------------------------ page helpers

    def js(self, fn, *args):
        """Call window.<NAMESPACE>.<fn>(*args) from the app's page script."""
        script = f"{self.SCRIPT}\nreturn window.{self.NAMESPACE}.{fn}.apply(null, arguments);"
        return self.driver.execute_script(script, *args)

    def page(self):
        return self.js("state").get("pageType")

    def seasons(self):
        detail = self.js("state").get("detail") or {}
        return detail.get("seasons") or []

    def stepSeason(self, step, noneMessage):
        """Move to the previous/next season (by the season list's index)."""
        seasons = self.seasons()
        if not seasons:
            raise ValueError(noneMessage)
        current = next((i for i, s in enumerate(seasons) if s.get("selected")), 0)
        target = current + step
        if not 0 <= target < len(seasons):
            return {"edge": True, "season": seasons[current]["label"]}
        return self._doSeason(target)

    def clickMarked(self):
        """Real mouse click on the element the page script marked with CLICK_TARGET."""
        elements = self.driver.find_elements(By.CSS_SELECTOR, self.CLICK_TARGET)
        if not elements:
            return False
        try:
            ActionChains(self.driver).move_to_element(elements[0]).click().perform()
        except WebDriverException:
            self.driver.execute_script("arguments[0].click()", elements[0])
        return True

    def wakeControls(self):
        """Players hide their controls until the mouse moves over them."""
        players = self.driver.find_elements(By.CSS_SELECTOR, self.PLAYER_SELECTOR)
        if not players:
            return
        dx, dy = self.WAKE_OFFSET
        try:
            chain = ActionChains(self.driver)
            chain.move_to_element_with_offset(players[0], -dx, dy)
            chain.move_to_element_with_offset(players[0], dx, -dy)
            chain.perform()
        except WebDriverException:
            return
        time.sleep(0.25)

    def wakeAndClick(self, marker, *args):
        """Show the player controls, let the page script's `marker` function
        mark a button, and give that button a real click."""
        self.wakeControls()
        if not self.js(marker, *args):
            return False
        return self.clickMarked()

    def pressKey(self, key):
        ActionChains(self.driver).send_keys(key).perform()

    def move(self, direction):
        raise NotImplementedError

    # ------------------------------------------------------------------ shared actions

    def _doUp(self):
        return self.move("up")

    def _doDown(self):
        return self.move("down")

    def _doLeft(self):
        return self.move("left")

    def _doRight(self):
        return self.move("right")

    def _doFocus(self):
        """Bring this app's tab and Chrome in front of whatever else is open."""
        return {"foreground": self.session.bringToFront()}

    def _doTvMode(self):
        return self.session.toggleTvMode()

    def _doReload(self):
        self.driver.refresh()
        return "reload"
