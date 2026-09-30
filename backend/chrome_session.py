"""One long-lived Chrome shared by every web-app remote (YouTube, Prime, ...).

Chrome runs as a normal, long-lived process (started once with a remote
debugging port and its own persistent profile) and Selenium *attaches* to it,
so the browser, your sign-ins and your tabs survive backend restarts and there
is no "controlled by automated software" banner.

A single WebDriver session can only drive one tab at a time, and switching tabs
activates them in Chrome. So each app remote works on "its" tab, and the driver
only moves between tabs when you switch app on the phone (or when the app's tab
was closed / navigated away). Status polls never switch tabs.
"""

import json
import os
import shutil
import subprocess
import threading
import time
import urllib.request
from pathlib import Path

import websocket
from selenium import webdriver
from selenium.common.exceptions import WebDriverException
from selenium.webdriver.chrome.options import Options

import window_focus

DEBUG_PORT = int(os.getenv("CHROME_DEBUG_PORT", "9222"))
PROFILE_DIR = os.getenv("CHROME_PROFILE_DIR", "").strip() or str(
    Path(os.getenv("LOCALAPPDATA", Path.home())) / "YouTubeRemote" / "chrome-profile"
)
START_URL = "https://www.youtube.com/"


def _find_chrome():
    configured = os.getenv("CHROME_BINARY", "").strip()
    if configured:
        return configured
    candidates = [
        Path(os.getenv("PROGRAMFILES", r"C:\Program Files")) / "Google/Chrome/Application/chrome.exe",
        Path(os.getenv("PROGRAMFILES(X86)", r"C:\Program Files (x86)")) / "Google/Chrome/Application/chrome.exe",
        Path(os.getenv("LOCALAPPDATA", "")) / "Google/Chrome/Application/chrome.exe",
    ]
    for c in candidates:
        if c.is_file():
            return str(c)
    return shutil.which("chrome") or shutil.which("google-chrome") or "chrome"


def _debug_port_open():
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{DEBUG_PORT}/json/version", timeout=0.5)
        return True
    except OSError:
        return False


def _host_matches(url, hosts):
    return any(h in (url or "") for h in hosts)


class ChromeSession:
    def __init__(self):
        self.driver = None
        self.lock = threading.RLock()
        # Set when TV mode is on, so un-minimizing goes back to fullscreen.
        self._tv_before_minimize = False

    # ------------------------------------------------------------------ process

    def _start_chrome(self):
        """Start a real (non-chromedriver) Chrome that outlives this process."""
        args = [
            _find_chrome(),
            f"--remote-debugging-port={DEBUG_PORT}",
            f"--user-data-dir={PROFILE_DIR}",
            "--autoplay-policy=no-user-gesture-required",
            # Keep background / covered tabs running at full speed: the remote
            # drives tabs that aren't in front (Chrome otherwise slows their
            # timers to once a minute).
            "--disable-background-timer-throttling",
            "--disable-renderer-backgrounding",
            "--disable-backgrounding-occluded-windows",
            "--no-first-run",
            "--no-default-browser-check",
            "--start-maximized",
            START_URL,
        ]
        popen = dict(close_fds=True, stdin=subprocess.DEVNULL,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if os.name == "nt":
            # Launch via `cmd /c start` so Chrome's parent is a short-lived cmd,
            # not this process: stopping the backend (Ctrl+C, closing the
            # terminal, killing its process tree) leaves Chrome running.
            flags = subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP
            cmdline = 'start "" ' + subprocess.list2cmdline(args)
            try:
                subprocess.Popen(cmdline, shell=True,
                                 creationflags=flags | subprocess.CREATE_BREAKAWAY_FROM_JOB, **popen)
            except OSError:
                subprocess.Popen(cmdline, shell=True, creationflags=flags, **popen)
        else:
            subprocess.Popen(args, start_new_session=True, **popen)
        end = time.time() + 20
        while time.time() < end:
            if _debug_port_open():
                return
            time.sleep(0.3)
        raise WebDriverException(f"Chrome did not open debug port {DEBUG_PORT}")

    def _attach(self, launch):
        if not _debug_port_open():
            if not launch:
                return False
            self._start_chrome()
        opts = Options()
        opts.debugger_address = f"127.0.0.1:{DEBUG_PORT}"
        self.driver = webdriver.Chrome(options=opts)
        # chromedriver attaches to an arbitrary tab; start on the one showing.
        visible = self._visible_tab_id()
        if visible in self.driver.window_handles:
            self.driver.switch_to.window(visible)
        return True

    def _alive(self):
        if self.driver is None:
            return False
        try:
            handles = self.driver.window_handles
            if not handles:
                return False
            try:
                self.driver.current_window_handle
            except WebDriverException:
                # The tab we were on was closed. Move to the tab Chrome is
                # already showing, so nothing visibly changes.
                visible = self._visible_tab_id()
                self.driver.switch_to.window(visible if visible in handles else handles[-1])
            return True
        except WebDriverException:
            return False

    def teardown(self):
        # Only stop chromedriver; the Chrome window itself is left running.
        if self.driver is not None:
            try:
                self.driver.service.stop()
            except Exception:
                pass
        self.driver = None

    def connect(self, launch):
        """Attach to Chrome if needed. Returns False when Chrome isn't running
        and launch is False."""
        if self._alive():
            return True
        self.teardown()
        return self._attach(launch)

    # ------------------------------------------------------------------ tabs

    def _tab_list(self):
        """Page targets from Chrome's DevTools list. Reading it doesn't
        activate anything (unlike switch_to.window)."""
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{DEBUG_PORT}/json/list", timeout=2) as r:
                return [t for t in json.load(r) if t.get("type") == "page"]
        except OSError:
            return []

    def _visible_tab_id(self, tabs=None):
        """The tab Chrome is showing, found by asking each tab over its own
        DevTools socket (which, unlike switching to it, activates nothing)."""
        for tab in tabs if tabs is not None else self._tab_list():
            url = tab.get("webSocketDebuggerUrl")
            if not url:
                continue
            try:
                ws = websocket.create_connection(url, timeout=1, suppress_origin=True)
                try:
                    ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate",
                                        "params": {"expression": "document.visibilityState", "returnByValue": True}}))
                    reply = json.loads(ws.recv())
                finally:
                    ws.close()
            except (OSError, websocket.WebSocketException, ValueError):
                continue
            if reply.get("result", {}).get("result", {}).get("value") == "visible":
                return tab["id"]
        # Chrome covered by another app: every tab says "hidden", but the
        # window title still names the active tab.
        titles = window_focus.active_tab_titles(window_focus.pid_listening_on(DEBUG_PORT))
        for tab in tabs if tabs is not None else self._tab_list():
            if tab.get("title") and tab["title"] in titles:
                return tab["id"]
        return None

    def on_host(self, hosts):
        """True if the driver's current tab shows one of `hosts`."""
        return _host_matches(self.driver.execute_script("return location.host"), hosts)

    def follow_visible(self, hosts):
        """If the tab Chrome is showing is one of `hosts` (say you switched to
        it by hand), move the driver there. It's already the visible tab, so
        nothing changes on screen. Returns True if the driver is on `hosts`."""
        if self.on_host(hosts):
            return True
        tabs = [t for t in self._tab_list() if _host_matches(t.get("url"), hosts)]
        visible = self._visible_tab_id(tabs) if tabs else None
        if visible and visible in self.driver.window_handles:
            self.driver.switch_to.window(visible)
            return True
        return False

    def use_tab(self, hosts, url):
        """Point the driver at a tab showing one of `hosts`: the current tab if
        it already does, else an existing matching tab, else a new tab at `url`.
        Moving to another tab activates it in Chrome, so this only runs for
        commands and app switches, never for status polls."""
        if self.follow_visible(hosts):
            return
        handles = self.driver.window_handles
        for tab in self._tab_list():
            if tab["id"] in handles and _host_matches(tab.get("url"), hosts):
                self.driver.switch_to.window(tab["id"])
                return
        self.driver.switch_to.new_window("tab")
        self.driver.get(url)

    def find_tab(self, hosts):
        """First tab showing one of `hosts` (DevTools target dict), or None."""
        return next((t for t in self._tab_list() if _host_matches(t.get("url"), hosts)), None)

    def eval_in_tab(self, tab, expression, timeout=20):
        """Run JS in a tab over its own DevTools socket and return the result
        (promises are awaited). Doesn't need the WebDriver or the tab to be in
        front, and doesn't activate it."""
        ws = websocket.create_connection(tab["webSocketDebuggerUrl"], timeout=timeout, suppress_origin=True)
        try:
            ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {
                "expression": expression, "returnByValue": True, "awaitPromise": True}}))
            while True:
                reply = json.loads(ws.recv())
                if reply.get("id") == 1:
                    break
        finally:
            ws.close()
        result = reply.get("result", {})
        if "exceptionDetails" in result:
            details = result["exceptionDetails"]
            message = (details.get("exception") or {}).get("description") or details.get("text") or "Script error"
            raise RuntimeError(message.splitlines()[0])
        return result.get("result", {}).get("value")

    def new_background_tab(self, url):
        """Open `url` in a new tab at the end, without switching to it.
        Returns the new tab's id."""
        return self.driver.execute_cdp_cmd("Target.createTarget", {"url": url, "background": True})["targetId"]

    def close_tab(self, tab_id):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{DEBUG_PORT}/json/close/{tab_id}", timeout=2)
        except OSError:
            pass

    # ------------------------------------------------------------------ window

    def _window_id(self):
        return self.driver.execute_cdp_cmd("Browser.getWindowForTarget", {})["windowId"]

    def window_state(self):
        try:
            return self.driver.execute_cdp_cmd(
                "Browser.getWindowBounds", {"windowId": self._window_id()}
            )["bounds"].get("windowState", "normal")
        except WebDriverException:
            return "unknown"

    def set_window_state(self, window_state):
        self.driver.execute_cdp_cmd(
            "Browser.setWindowBounds",
            {"windowId": self._window_id(), "bounds": {"windowState": window_state}},
        )

    def bring_to_front(self):
        """Show the driver's tab and bring Chrome in front of other apps and
        popups, un-minimizing it (and keeping F11 TV mode) if needed."""
        if self.window_state() == "minimized":
            # A minimized window has to go back to "normal" before any other state.
            self.set_window_state("normal")
            self.set_window_state("fullscreen" if self._tv_before_minimize else "maximized")
        self.driver.execute_cdp_cmd("Page.bringToFront", {})
        return window_focus.focus_chrome(window_focus.pid_listening_on(DEBUG_PORT), self.driver.title)

    @property
    def tv_mode(self):
        """TV mode = the Chrome window is fullscreen (F11). Read from Chrome
        every time, so it's right even after the backend restarts."""
        return self.window_state() == "fullscreen"

    def toggle_tv_mode(self):
        """Toggle the whole Chrome window between fullscreen (F11) and maximized."""
        state = self.window_state()
        # Chrome only changes fullscreen/minimized windows via "normal".
        if state in ("minimized", "fullscreen"):
            self.set_window_state("normal")
        target = "maximized" if state == "fullscreen" else "fullscreen"
        self.set_window_state(target)
        self._tv_before_minimize = target == "fullscreen"
        return target == "fullscreen"


class ChromeApp:
    """Base for a remote that drives one website in the shared Chrome.

    Subclasses set NAME / HOSTS / HOME_URL, implement _page_state() and add
    `_do_<action>` handlers.
    """

    NAME = ""
    HOSTS = ()
    HOME_URL = ""

    def __init__(self, session):
        self.session = session

    @property
    def driver(self):
        return self.session.driver

    def _page_state(self):
        raise NotImplementedError

    def _state(self):
        state = self._page_state()
        state["app"] = self.NAME
        state["browser"] = "running"
        state["tvMode"] = self.session.tv_mode
        state["windowState"] = self.session.window_state()
        return state

    def state(self):
        """Snapshot of this app's tab. Attaches to a running Chrome but never
        launches one or changes which tab is showing; if Chrome is showing
        another app's tab the phone gets pageType "otherTab" and can offer to
        switch."""
        with self.session.lock:
            try:
                if not self.session.connect(launch=False):
                    return {"app": self.NAME, "browser": "stopped"}
                if not self.session.follow_visible(self.HOSTS):
                    return {"app": self.NAME, "browser": "running", "pageType": "otherTab",
                            "url": self.driver.current_url}
                return self._state()
            except WebDriverException as e:
                self.session.teardown()
                return {"app": self.NAME, "browser": "error", "error": str(e).splitlines()[0]}

    def show(self):
        """Switch Chrome to this app's tab (opening it if needed) and bring it
        to the front. Called when you pick this app on the phone."""
        with self.session.lock:
            self._ensure()
            self.session.bring_to_front()
            return self._state()

    def screenshot(self):
        with self.session.lock:
            try:
                if not self.session.connect(launch=False):
                    return None
                return self.driver.get_screenshot_as_png()
            except WebDriverException:
                return None

    def _ensure(self):
        self.session.connect(launch=True)
        self.session.use_tab(self.HOSTS, self.HOME_URL)

    def run(self, action, value=None):
        with self.session.lock:
            try:
                return self._run(action, value)
            except WebDriverException:
                # Session died mid-command (window closed, crash): restart once.
                self.session.teardown()
                return self._run(action, value)

    def _run(self, action, value):
        self._ensure()
        handler = getattr(self, f"_do_{action}", None)
        if handler is None:
            raise ValueError(f"Unknown {self.NAME} action '{action}'")
        result = handler(value) if value is not None else handler()
        time.sleep(0.05)
        return {"result": result, "state": self._state()}

    # Actions every web app shares.

    def _do_focus(self):
        """Bring this app's tab and Chrome in front of whatever else is open."""
        return {"foreground": self.session.bring_to_front()}

    def _do_tvMode(self):
        return self.session.toggle_tv_mode()

    def _do_reload(self):
        self.driver.refresh()
        return "reload"
