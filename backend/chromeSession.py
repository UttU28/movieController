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
from contextlib import contextmanager
from pathlib import Path

import websocket
from selenium import webdriver
from selenium.common.exceptions import WebDriverException
from selenium.webdriver.chrome.options import Options

import windowFocus

DEBUG_PORT = int(os.getenv("CHROME_DEBUG_PORT", "9222"))
DEBUG_URL = f"http://127.0.0.1:{DEBUG_PORT}"
PROFILE_DIR = os.getenv("CHROME_PROFILE_DIR", "").strip() or str(
    Path(os.getenv("LOCALAPPDATA", Path.home())) / "YouTubeRemote" / "chrome-profile"
)
START_URL = "https://www.youtube.com/"
PAGE_SCRIPTS = Path(__file__).resolve().parent / "pageScripts"

# How long a page may take before we give up on it. A site that hangs (a
# slow Jellyfin server, a stuck Prime page) must never hold up the remote.
SCRIPT_TIMEOUT = 8
PAGE_LOAD_TIMEOUT = 25
EVAL_TIMEOUT = 8


def pageScript(name):
    """The source of one of the scripts injected into the app tabs."""
    return (PAGE_SCRIPTS / name).read_text(encoding="utf-8")


def findChrome():
    configured = os.getenv("CHROME_BINARY", "").strip()
    if configured:
        return configured
    candidates = [
        Path(os.getenv("PROGRAMFILES", r"C:\Program Files")) / "Google/Chrome/Application/chrome.exe",
        Path(os.getenv("PROGRAMFILES(X86)", r"C:\Program Files (x86)")) / "Google/Chrome/Application/chrome.exe",
        Path(os.getenv("LOCALAPPDATA", "")) / "Google/Chrome/Application/chrome.exe",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    return shutil.which("chrome") or shutil.which("google-chrome") or "chrome"


def chromeRunning():
    """True if the remote's Chrome is already up (its debug port answers)."""
    try:
        urllib.request.urlopen(f"{DEBUG_URL}/json/version", timeout=0.5)
        return True
    except OSError:
        return False


def hostMatches(url, hosts):
    return any(host in (url or "") for host in hosts)


def markProfileClean():
    """Tell Chrome the last session ended normally, so it doesn't offer to
    restore pages the next time it opens. Only safe while Chrome is closed;
    the file is locked (and rewritten) while it's running."""
    path = Path(PROFILE_DIR) / "Default" / "Preferences"
    if not path.is_file():
        return
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        profile = data.setdefault("profile", {})
        profile["exit_type"] = "Normal"
        profile["exited_cleanly"] = True
        path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    except (OSError, json.JSONDecodeError, TypeError):
        pass


# Close the "Restore pages? Chrome didn't shut down correctly" bubble when it
# is already on screen. markProfileClean() only helps the next launch.
BUBBLE_SCRIPT = r"""
Add-Type -AssemblyName UIAutomationClient
$root = [System.Windows.Automation.AutomationElement]::RootElement
$winCond = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ClassNameProperty, 'Chrome_WidgetWin_1')
$windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $winCond)
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$closeCond = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::NameProperty, 'Close')
$textCond = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::NameProperty, 'Chrome didn''t shut down correctly.')
foreach ($w in $windows) {
  $hit = $w.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $textCond)
  if (-not $hit) { continue }
  $node = $hit
  $btn = $null
  for ($i = 0; $i -lt 8 -and $node; $i++) {
    $btn = $node.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $closeCond)
    if ($btn) { break }
    $node = $walker.GetParent($node)
  }
  if ($btn) {
    $btn.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
  }
}
"""
bubbleLock = threading.Lock()


def dismissRestoreBubble():
    """Click away Chrome's restore-pages bubble if it is showing."""
    if os.name != "nt" or not bubbleLock.acquire(blocking=False):
        return
    try:
        subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", BUBBLE_SCRIPT],
            timeout=12,
            check=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except (OSError, subprocess.TimeoutExpired):
        pass
    finally:
        bubbleLock.release()


def cdpSend(tab, commands, timeout):
    """Send DevTools commands [(method, params)] in order over a tab's own
    socket, which needs no WebDriver and activates nothing. Returns the reply
    to the last one."""
    ws = websocket.create_connection(tab["webSocketDebuggerUrl"], timeout=timeout, suppress_origin=True)
    try:
        for msgId, (method, params) in enumerate(commands, start=1):
            ws.send(json.dumps({"id": msgId, "method": method, "params": params}))
            reply = json.loads(ws.recv())
            while reply.get("id") != msgId:
                reply = json.loads(ws.recv())
    finally:
        ws.close()
    return reply


class Busy(RuntimeError):
    """Chrome is tied up with another request; try again shortly."""


class PageUnresponsive(RuntimeError):
    """The page didn't answer in time (site down, loading, or frozen)."""


class ChromeSession:
    def __init__(self):
        self.driver = None
        self.lock = threading.RLock()
        # Set when TV mode is on, so un-minimizing goes back to fullscreen.
        self.tvBeforeMinimize = False

    # ------------------------------------------------------------------ process

    def startChrome(self):
        """Start a real (non-chromedriver) Chrome that outlives this process."""
        args = [
            findChrome(),
            f"--remote-debugging-port={DEBUG_PORT}",
            f"--user-data-dir={PROFILE_DIR}",
            "--autoplay-policy=no-user-gesture-required",
            # Keep background tabs' timers running (the remote reads tabs that
            # aren't in front), but let Chrome lower their priority and memory
            # as usual: playing on Jellyfin brings its tab forward anyway.
            "--disable-background-timer-throttling",
            "--no-first-run",
            "--no-default-browser-check",
            "--hide-crash-restore-bubble",
            "--start-maximized",
            START_URL,
        ]
        markProfileClean()
        popen = dict(close_fds=True, stdin=subprocess.DEVNULL,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if os.name == "nt":
            # Launch via `cmd /c start` so Chrome's parent is a short-lived cmd,
            # not this process: stopping the backend (Ctrl+C, closing the
            # terminal, killing its process tree) leaves Chrome running.
            flags = subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP
            cmdLine = 'start "" ' + subprocess.list2cmdline(args)
            try:
                subprocess.Popen(cmdLine, shell=True,
                                 creationflags=flags | subprocess.CREATE_BREAKAWAY_FROM_JOB, **popen)
            except OSError:
                subprocess.Popen(cmdLine, shell=True, creationflags=flags, **popen)
        else:
            subprocess.Popen(args, start_new_session=True, **popen)
        end = time.time() + 20
        while time.time() < end:
            if chromeRunning():
                return
            time.sleep(0.3)
        raise WebDriverException(f"Chrome did not open debug port {DEBUG_PORT}")

    def attach(self, launch):
        if not chromeRunning():
            if not launch:
                return False
            self.startChrome()
        options = Options()
        options.debugger_address = f"127.0.0.1:{DEBUG_PORT}"
        self.driver = webdriver.Chrome(options=options)
        # Never wait minutes on a page that hangs.
        self.driver.set_script_timeout(SCRIPT_TIMEOUT)
        self.driver.set_page_load_timeout(PAGE_LOAD_TIMEOUT)
        # chromedriver attaches to an arbitrary tab; start on the one showing.
        visible = self.visibleTabId()
        if visible in self.driver.window_handles:
            self.driver.switch_to.window(visible)
        return True

    def alive(self):
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
                visible = self.visibleTabId()
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
        if self.alive():
            return True
        self.teardown()
        return self.attach(launch)

    @contextmanager
    def locked(self, timeout):
        """Hold the Chrome lock, but give up after `timeout` seconds instead of
        queueing behind a slow request forever."""
        if not self.lock.acquire(timeout=timeout):
            raise Busy("The remote is busy with another request. Try again.")
        try:
            yield
        finally:
            self.lock.release()

    # ------------------------------------------------------------------ tabs

    def tabList(self):
        """Page targets from Chrome's DevTools list. Reading it doesn't
        activate anything (unlike switch_to.window)."""
        try:
            with urllib.request.urlopen(f"{DEBUG_URL}/json/list", timeout=2) as response:
                return [t for t in json.load(response) if t.get("type") == "page"]
        except OSError:
            return []

    def visibleTabId(self, tabs=None):
        """The tab Chrome is showing, found by asking each tab over its own
        DevTools socket (which, unlike switching to it, activates nothing)."""
        tabs = self.tabList() if tabs is None else tabs
        for tab in tabs:
            if not tab.get("webSocketDebuggerUrl"):
                continue
            try:
                reply = cdpSend(tab, [("Runtime.evaluate", {
                    "expression": "document.visibilityState", "returnByValue": True})], timeout=1)
            except (OSError, websocket.WebSocketException, ValueError):
                continue
            if reply.get("result", {}).get("result", {}).get("value") == "visible":
                return tab["id"]
        # Chrome covered by another app: every tab says "hidden", but the
        # window title still names the active tab.
        titles = windowFocus.activeTabTitles(windowFocus.pidListeningOn(DEBUG_PORT))
        for tab in tabs:
            if tab.get("title") and tab["title"] in titles:
                return tab["id"]
        return None

    def onHost(self, hosts):
        """True if the driver's current tab shows one of `hosts`. Read from
        Chrome's tab list, which (unlike asking the page through WebDriver)
        doesn't wait for a page that's still loading."""
        handle = self.driver.current_window_handle
        tab = next((t for t in self.tabList() if t["id"] == handle), None)
        if tab is not None:
            return hostMatches(tab.get("url"), hosts)
        return hostMatches(self.driver.execute_script("return location.host"), hosts)

    def followVisible(self, hosts):
        """If the tab Chrome is showing is one of `hosts` (say you switched to
        it by hand), move the driver there. It's already the visible tab, so
        nothing changes on screen. Returns True if the driver is on `hosts`."""
        if self.onHost(hosts):
            return True
        tabs = [t for t in self.tabList() if hostMatches(t.get("url"), hosts)]
        visible = self.visibleTabId(tabs) if tabs else None
        if visible and visible in self.driver.window_handles:
            self.driver.switch_to.window(visible)
            return True
        return False

    def useTab(self, hosts, url):
        """Point the driver at a tab showing one of `hosts`: the current tab if
        it already does, else an existing matching tab, else a new tab at `url`.
        Moving to another tab activates it in Chrome, so this only runs for
        commands and app switches, never for status polls."""
        if self.followVisible(hosts):
            return
        handles = self.driver.window_handles
        for tab in self.tabList():
            if tab["id"] in handles and hostMatches(tab.get("url"), hosts):
                self.driver.switch_to.window(tab["id"])
                return
        self.driver.switch_to.new_window("tab")
        self.driver.get(url)

    def findTab(self, hosts):
        """First tab showing one of `hosts` (DevTools target dict), or None."""
        return next((t for t in self.tabList() if hostMatches(t.get("url"), hosts)), None)

    def evalInTab(self, tab, expression, timeout=EVAL_TIMEOUT):
        """Run JS in a tab over its own DevTools socket and return the result
        (promises are awaited). Doesn't need the WebDriver or the tab to be in
        front, and doesn't activate it. Raises PageUnresponsive if the page
        doesn't answer within `timeout` seconds."""
        try:
            reply = cdpSend(tab, [("Runtime.evaluate", {
                "expression": expression, "returnByValue": True, "awaitPromise": True,
                "timeout": int(timeout * 1000)})], timeout)
        except (websocket.WebSocketException, OSError, ValueError) as e:
            raise PageUnresponsive("The page isn't responding right now.") from e
        result = reply.get("result", {})
        if "exceptionDetails" in result:
            details = result["exceptionDetails"]
            message = (details.get("exception") or {}).get("description") or details.get("text") or "Script error"
            raise RuntimeError(message.splitlines()[0])
        return result.get("result", {}).get("value")

    def clickInTab(self, tab, x, y, timeout=3):
        """A real (trusted) left click at viewport point (x, y), sent over the
        tab's own DevTools socket: no WebDriver, no tab switch, and the OS
        pointer stays where it is."""
        press = {"button": "left", "clickCount": 1}
        events = [("mouseMoved", {}), ("mousePressed", press), ("mouseReleased", press)]
        try:
            cdpSend(tab, [("Input.dispatchMouseEvent", {"type": kind, "x": x, "y": y, **extra})
                          for kind, extra in events], timeout)
        except (websocket.WebSocketException, OSError, ValueError) as e:
            raise PageUnresponsive("The page isn't responding right now.") from e

    def newBackgroundTab(self, url):
        """Open `url` in a new tab at the end, without switching to it.
        Returns the new tab's id."""
        return self.driver.execute_cdp_cmd("Target.createTarget", {"url": url, "background": True})["targetId"]

    def closeTab(self, tabId):
        try:
            urllib.request.urlopen(f"{DEBUG_URL}/json/close/{tabId}", timeout=2)
        except OSError:
            pass

    # ------------------------------------------------------------------ window

    def windowId(self):
        return self.driver.execute_cdp_cmd("Browser.getWindowForTarget", {})["windowId"]

    def windowState(self):
        try:
            return self.driver.execute_cdp_cmd(
                "Browser.getWindowBounds", {"windowId": self.windowId()}
            )["bounds"].get("windowState", "normal")
        except WebDriverException:
            return "unknown"

    def setWindowState(self, windowState):
        self.driver.execute_cdp_cmd(
            "Browser.setWindowBounds",
            {"windowId": self.windowId(), "bounds": {"windowState": windowState}},
        )

    def bringToFront(self):
        """Show the driver's tab and bring Chrome in front of other apps and
        popups, un-minimizing it (and keeping F11 TV mode) if needed."""
        if self.windowState() == "minimized":
            # A minimized window has to go back to "normal" before any other state.
            self.setWindowState("normal")
            self.setWindowState("fullscreen" if self.tvBeforeMinimize else "maximized")
        self.driver.execute_cdp_cmd("Page.bringToFront", {})
        return windowFocus.focusChrome(windowFocus.pidListeningOn(DEBUG_PORT), self.driver.title)

    @property
    def tvMode(self):
        """TV mode = the Chrome window is fullscreen (F11). Read from Chrome
        every time, so it's right even after the backend restarts."""
        return self.windowState() == "fullscreen"

    def toggleTvMode(self):
        """Toggle the whole Chrome window between fullscreen (F11) and maximized."""
        state = self.windowState()
        # Chrome only changes fullscreen/minimized windows via "normal".
        if state in ("minimized", "fullscreen"):
            self.setWindowState("normal")
        target = "maximized" if state == "fullscreen" else "fullscreen"
        self.setWindowState(target)
        self.tvBeforeMinimize = target == "fullscreen"
        return self.tvBeforeMinimize

    def ensureTvMode(self):
        """Enter fullscreen if Chrome isn't already. Leaves an existing
        fullscreen window alone."""
        state = self.windowState()
        if state != "fullscreen":
            if state == "minimized":
                self.setWindowState("normal")
            self.setWindowState("fullscreen")
        self.tvBeforeMinimize = True
        return True
