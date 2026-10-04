"""Laptop control: mouse, keyboard, hotkeys, media keys and app launching.

Drives the real Windows desktop with pyautogui, like the original controller.
Mouse movement arrives over a WebSocket for smooth trackpad control; everything
else is a named action.

On Windows the pointer is hidden after a few seconds of stillness (and right
after a streaming-app click) so it does not sit on a video and keep it hovered.
It stays where it is; a blank spot covers it. The next trackpad move shows it
again in the same place.
"""

import atexit
import os
import subprocess
import threading
import time

import pyautogui

# The trackpad can legitimately push the pointer into a screen corner.
pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0.02

if os.name == "nt":
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.WinDLL("user32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    # Cursor coordinates and window positions must use the same pixel space.
    user32.SetProcessDPIAware()
    user32.OpenClipboard.argtypes = [wintypes.HWND]
    user32.SetClipboardData.argtypes = [wintypes.UINT, wintypes.HANDLE]
    user32.SetClipboardData.restype = wintypes.HANDLE
    kernel32.GlobalAlloc.argtypes = [wintypes.UINT, ctypes.c_size_t]
    kernel32.GlobalAlloc.restype = wintypes.HGLOBAL
    kernel32.GlobalLock.argtypes = [wintypes.HGLOBAL]
    kernel32.GlobalLock.restype = wintypes.LPVOID
    kernel32.GlobalUnlock.argtypes = [wintypes.HGLOBAL]

CF_UNICODETEXT = 13
GMEM_MOVEABLE = 0x0002

# Key combos, keyed by action name (pyautogui key names).
HOTKEYS = {
    "altTab": ("alt", "tab"),
    "desktop": ("win", "d"),
    "startMenu": ("win",),
    "taskView": ("win", "tab"),
    "closeWindow": ("alt", "f4"),
    "newTab": ("ctrl", "t"),
    "closeTab": ("ctrl", "w"),
    "reopenTab": ("ctrl", "shift", "t"),
    "nextTab": ("ctrl", "tab"),
    "prevTab": ("ctrl", "shift", "tab"),
    "browserBack": ("alt", "left"),
    "browserForward": ("alt", "right"),
    "refresh": ("f5",),
    "fullscreenKey": ("f11",),
    "copy": ("ctrl", "c"),
    "paste": ("ctrl", "v"),
    "undo": ("ctrl", "z"),
    "selectAll": ("ctrl", "a"),
    "screenshot": ("win", "shift", "s"),
    "volumeUp": ("volumeup",),
    "volumeDown": ("volumedown",),
    "mute": ("volumemute",),
    "mediaPlayPause": ("playpause",),
    "mediaNext": ("nexttrack",),
    "mediaPrev": ("prevtrack",),
}

# Single keys the phone keyboard strip can send.
KEYS = {
    "esc", "tab", "enter", "backspace", "delete", "space",
    "up", "down", "left", "right", "home", "end", "pageup", "pagedown",
    "f", "k", "m",
}

# How to open each app. Strings go through `start`, so URIs work too.
APPS = {
    "chrome": "chrome",
    "explorer": "explorer",
    "notepad": "notepad",
    "calculator": "calc",
    "settings": "ms-settings:",
    "taskManager": "taskmgr",
}

SCROLL_LIMIT = 2400
MOVE_LIMIT = 400
# How long the pointer may sit still before it is hidden in place.
CURSOR_IDLE_SECONDS = 3.0


def setClipboard(text):
    data = ctypes.create_unicode_buffer(text)
    size = ctypes.sizeof(data)
    handle = kernel32.GlobalAlloc(GMEM_MOVEABLE, size)
    ptr = kernel32.GlobalLock(handle)
    ctypes.memmove(ptr, data, size)
    kernel32.GlobalUnlock(handle)
    for _ in range(10):
        if user32.OpenClipboard(None):
            break
        time.sleep(0.05)
    else:
        raise RuntimeError("Clipboard is busy")
    try:
        user32.EmptyClipboard()
        user32.SetClipboardData(CF_UNICODETEXT, handle)
    finally:
        user32.CloseClipboard()


# Hiding the cursor with CSS does not clear :hover, so a pointer left on a
# video (by a click, or by the trackpad) keeps the player controls and tile
# previews up. After it sits still, a tiny window of our own is slid under
# it. The window is what the pointer is "on", so Chrome is no longer
# hovered, and the window's cursor is blank.
if os.name == "nt":
    LRESULT = ctypes.c_ssize_t
    WNDPROC = ctypes.WINFUNCTYPE(LRESULT, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM)
    HWND_TOPMOST = ctypes.c_void_p(-1)
    WS_POPUP = 0x80000000
    WS_EX_LAYERED = 0x00080000
    WS_EX_TOPMOST = 0x00000008
    WS_EX_TOOLWINDOW = 0x00000080
    WS_EX_NOACTIVATE = 0x08000000
    LWA_ALPHA = 0x2
    SW_HIDE = 0
    SWP_NOACTIVATE = 0x0010
    SWP_SHOWWINDOW = 0x0040
    PM_REMOVE = 0x0001
    WM_SETCURSOR = 0x0020
    PARK_SIZE = 16

    class WNDCLASSW(ctypes.Structure):
        _fields_ = [
            ("style", wintypes.UINT),
            ("lpfnWndProc", WNDPROC),
            ("cbClsExtra", ctypes.c_int),
            ("cbWndExtra", ctypes.c_int),
            ("hInstance", wintypes.HINSTANCE),
            ("hIcon", wintypes.HICON),
            ("hCursor", wintypes.HANDLE),
            ("hbrBackground", wintypes.HBRUSH),
            ("lpszMenuName", wintypes.LPCWSTR),
            ("lpszClassName", wintypes.LPCWSTR),
        ]

    class MSG(ctypes.Structure):
        _fields_ = [
            ("hwnd", wintypes.HWND),
            ("message", wintypes.UINT),
            ("wParam", wintypes.WPARAM),
            ("lParam", wintypes.LPARAM),
            ("time", wintypes.DWORD),
            ("pt", wintypes.POINT),
            ("lPrivate", wintypes.DWORD),
        ]

    user32.DefWindowProcW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
    user32.DefWindowProcW.restype = LRESULT
    user32.RegisterClassW.argtypes = [ctypes.POINTER(WNDCLASSW)]
    user32.RegisterClassW.restype = wintypes.ATOM
    user32.CreateWindowExW.argtypes = [
        wintypes.DWORD, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD,
        ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
        wintypes.HWND, wintypes.HMENU, wintypes.HINSTANCE, wintypes.LPVOID,
    ]
    user32.CreateWindowExW.restype = wintypes.HWND
    user32.SetWindowPos.argtypes = [
        wintypes.HWND, ctypes.c_void_p, ctypes.c_int, ctypes.c_int,
        ctypes.c_int, ctypes.c_int, wintypes.UINT,
    ]
    user32.SetWindowPos.restype = wintypes.BOOL
    user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
    user32.ShowWindow.restype = wintypes.BOOL
    user32.SetLayeredWindowAttributes.argtypes = [wintypes.HWND, wintypes.DWORD, wintypes.BYTE, wintypes.DWORD]
    user32.SetLayeredWindowAttributes.restype = wintypes.BOOL
    user32.SetCursorPos.argtypes = [ctypes.c_int, ctypes.c_int]
    user32.SetCursorPos.restype = wintypes.BOOL
    user32.GetCursorPos.argtypes = [ctypes.POINTER(wintypes.POINT)]
    user32.GetCursorPos.restype = wintypes.BOOL
    user32.SetCursor.argtypes = [wintypes.HANDLE]
    user32.SetCursor.restype = wintypes.HANDLE
    user32.CreateCursor.argtypes = [
        wintypes.HINSTANCE, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
        ctypes.c_void_p, ctypes.c_void_p,
    ]
    user32.CreateCursor.restype = wintypes.HANDLE
    user32.GetSystemMetrics.argtypes = [ctypes.c_int]
    user32.GetSystemMetrics.restype = ctypes.c_int
    user32.PeekMessageW.argtypes = [ctypes.POINTER(MSG), wintypes.HWND, wintypes.UINT, wintypes.UINT, wintypes.UINT]
    user32.PeekMessageW.restype = wintypes.BOOL
    user32.TranslateMessage.argtypes = [ctypes.POINTER(MSG)]
    user32.DispatchMessageW.argtypes = [ctypes.POINTER(MSG)]
    user32.DispatchMessageW.restype = LRESULT
    kernel32.GetModuleHandleW.argtypes = [wintypes.LPCWSTR]
    kernel32.GetModuleHandleW.restype = wintypes.HINSTANCE

    blankCursorHandle = None

    def blankCursor():
        global blankCursorHandle
        if blankCursorHandle:
            return blankCursorHandle
        width = user32.GetSystemMetrics(13) or 32
        height = user32.GetSystemMetrics(14) or 32
        stride = ((width + 15) // 16) * 2
        count = stride * height
        # AND bits set and XOR bits clear: the pointer draws nothing.
        andMask = (ctypes.c_ubyte * count)(*([0xFF] * count))
        xorMask = (ctypes.c_ubyte * count)(*([0x00] * count))
        blankCursorHandle = user32.CreateCursor(
            kernel32.GetModuleHandleW(None), 0, 0, width, height, andMask, xorMask,
        )
        # CreateCursor copies the masks, but keep them alive anyway.
        blankCursor.masks = (andMask, xorMask)
        return blankCursorHandle

    def windowProc(hwnd, msg, wparam, lparam):
        if msg == WM_SETCURSOR and blankCursorHandle:
            user32.SetCursor(blankCursorHandle)
            return 1
        return user32.DefWindowProcW(hwnd, msg, wparam, lparam)

    WINDOW_PROC = WNDPROC(windowProc)
    CLASS_NAME = "YtRemoteCursorPark"

    def cursorPos():
        pt = wintypes.POINT()
        if not user32.GetCursorPos(ctypes.byref(pt)):
            return None
        return (int(pt.x), int(pt.y))


class LaptopControl:
    def __init__(self):
        # pyautogui isn't thread-safe; the WebSocket and HTTP handlers share it.
        self.lock = threading.Lock()
        self.dragging = False
        self.parked = False
        self.savedPos = None
        self.lastPos = None
        self.lastActivity = time.monotonic()
        self.trackpadAt = 0.0
        self.parkRequested = False
        self.hideWindow = False
        self.hwnd = None
        self.poke = threading.Event()
        self.uncovered = threading.Event()
        self.uncovered.set()
        self.tickLogged = False
        if os.name == "nt":
            threading.Thread(target=self.cursorLoop, name="cursor-idle", daemon=True).start()
            atexit.register(self.restoreCursor)

    def restoreCursor(self):
        if not self.parked or not self.savedPos:
            return
        try:
            user32.SetCursorPos(int(self.savedPos[0]), int(self.savedPos[1]))
        except Exception:
            pass

    # ------------------------------------------------------------------ mouse

    def notePointer(self):
        """Caller holds self.lock. A trackpad action means the pointer is in use.
        Returns True when the blank cover is up and must be dropped by the
        window thread before this action runs."""
        if os.name != "nt":
            return False
        now = time.monotonic()
        self.lastActivity = now
        self.trackpadAt = now
        if not (self.parked and self.savedPos):
            return False
        # The cover window belongs to the cursor thread. Hiding it from here
        # would wait on that thread while we still hold the lock, and every
        # later click, move and key would stall.
        self.parked = False
        self.lastPos = self.savedPos
        self.hideWindow = True
        self.uncovered.clear()
        self.poke.set()
        return True

    def usePointer(self, fn):
        """Run a mouse action with the blank cover already gone."""
        with self.lock:
            waiting = self.notePointer()
        if waiting:
            self.uncovered.wait(0.5)
        with self.lock:
            fn()

    def move(self, dx, dy):
        dx = max(-MOVE_LIMIT, min(MOVE_LIMIT, int(round(dx))))
        dy = max(-MOVE_LIMIT, min(MOVE_LIMIT, int(round(dy))))
        if dx or dy:
            def go():
                pyautogui.moveRel(dx, dy, _pause=False)
                if os.name == "nt":
                    self.lastPos = cursorPos()
            self.usePointer(go)

    def scroll(self, amount):
        # Windows wheel units: 120 = one notch; small values scroll smoothly.
        amount = max(-SCROLL_LIMIT, min(SCROLL_LIMIT, int(round(amount))))
        if amount:
            self.usePointer(lambda: pyautogui.scroll(amount, _pause=False))

    def click(self, button="left", double=False):
        if button not in ("left", "right", "middle"):
            raise ValueError(f"Unknown mouse button '{button}'")
        clicks = 2 if double else 1
        self.usePointer(lambda: pyautogui.click(button=button, clicks=clicks, interval=0.08))

    def setDrag(self, on):
        """Hold the left button down so trackpad moves drag things."""
        def go():
            if on and not self.dragging:
                pyautogui.mouseDown()
            elif not on and self.dragging:
                pyautogui.mouseUp()
            self.dragging = bool(on)
        self.usePointer(go)
        return self.dragging

    def settle(self):
        """Put the pointer away now. Web-app clicks leave it on the video;
        the trackpad keeps it if it was just used."""
        if os.name != "nt":
            return
        with self.lock:
            if self.dragging or self.parked:
                return
            if time.monotonic() - self.trackpadAt < 0.8:
                return
            self.parkRequested = True
        self.poke.set()

    def cursorLoop(self):
        try:
            self.createParkWindow()
        except Exception as e:
            print(f"cursor park window failed: {e}")
        while True:
            self.poke.wait(0.25)
            self.poke.clear()
            try:
                self.pumpMessages()
                self.tick()
                self.pumpMessages()
            except Exception as e:
                if not self.tickLogged:
                    self.tickLogged = True
                    print(f"cursor idle failed: {e}")

    def createParkWindow(self):
        blank = blankCursor()
        instance = kernel32.GetModuleHandleW(None)
        cls = WNDCLASSW()
        cls.lpfnWndProc = WINDOW_PROC
        cls.hInstance = instance
        cls.hCursor = blank
        cls.lpszClassName = CLASS_NAME
        # Windows keeps the class-name pointer; the structure has to stay alive.
        self.windowClass = cls
        if not user32.RegisterClassW(ctypes.byref(cls)):
            err = ctypes.get_last_error()
            if err != 1410:  # class already registered (reload)
                raise OSError(f"RegisterClassW failed ({err})")
        hwnd = user32.CreateWindowExW(
            WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
            CLASS_NAME, "", WS_POPUP,
            0, 0, PARK_SIZE, PARK_SIZE,
            None, None, instance, None,
        )
        if not hwnd:
            raise OSError(f"CreateWindowExW failed ({ctypes.get_last_error()})")
        user32.SetLayeredWindowAttributes(hwnd, 0, 1, LWA_ALPHA)
        user32.ShowWindow(hwnd, SW_HIDE)
        self.hwnd = hwnd

    def pumpMessages(self):
        if not self.hwnd:
            return
        msg = MSG()
        while user32.PeekMessageW(ctypes.byref(msg), None, 0, 0, PM_REMOVE):
            user32.TranslateMessage(ctypes.byref(msg))
            user32.DispatchMessageW(ctypes.byref(msg))

    def tick(self):
        with self.lock:
            hide = self.hideWindow
            self.hideWindow = False
            requested = self.parkRequested
            self.parkRequested = False
            pos = cursorPos()
            now = time.monotonic()
            if pos is not None and self.lastPos is None:
                self.lastPos = pos
            elif pos is not None and pos != self.lastPos:
                nudged = (self.parked and abs(pos[0] - self.lastPos[0]) <= PARK_SIZE
                          and abs(pos[1] - self.lastPos[1]) <= PARK_SIZE)
                self.lastPos = pos
                if not nudged:
                    # A physical mouse, or a click the web remote just made.
                    self.lastActivity = now
                    if self.parked:
                        self.parked = False
                        self.savedPos = pos
                        hide = True
            idle = (not self.dragging and not self.parked
                    and now - self.lastActivity >= CURSOR_IDLE_SECONDS)
            trackpadLive = now - self.trackpadAt < 0.8
            doPark = (requested or idle) and not self.dragging and not self.parked and not trackpadLive
            if doPark and pos is not None:
                self.parkCursor(pos)
                hide = False
            parked = self.parked
        if hide and not parked and self.hwnd:
            user32.ShowWindow(self.hwnd, SW_HIDE)
        if hide:
            self.uncovered.set()

    def parkCursor(self, pos):
        """Hide the pointer where it is. Caller holds self.lock and is the
        window's thread. A blank window covers the hotspot, so Windows draws
        nothing and the video underneath stops seeing a hover."""
        self.savedPos = pos
        x, y = int(pos[0]), int(pos[1])
        if self.hwnd:
            user32.SetWindowPos(
                self.hwnd, HWND_TOPMOST,
                x - PARK_SIZE // 2, y - PARK_SIZE // 2,
                PARK_SIZE, PARK_SIZE,
                SWP_NOACTIVATE | SWP_SHOWWINDOW,
            )
        if blankCursorHandle:
            user32.SetCursor(blankCursorHandle)
        self.parked = True
        self.lastPos = pos

    # ------------------------------------------------------------------ keyboard

    def typeText(self, text):
        if not text:
            return 0
        with self.lock:
            self.writeAny(text)
        return len(text)

    def openApp(self, name):
        target = APPS.get(name)
        if target is None:
            raise ValueError(f"Unknown app '{name}'")
        subprocess.Popen(f'start "" {target}', shell=True,
                         creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        return name

    def searchOpen(self, query):
        """Open anything by name through the Start menu search."""
        query = (query or "").strip()
        if not query:
            raise ValueError("Type an app or file name")
        with self.lock:
            pyautogui.press("win")
            time.sleep(0.6)
            self.writeAny(query)
            time.sleep(0.9)
            pyautogui.press("enter")
        return query

    def writeAny(self, text):
        # pyautogui can only type ASCII; paste anything else.
        if text.isascii():
            pyautogui.write(text, interval=0.01)
        else:
            setClipboard(text)
            pyautogui.hotkey("ctrl", "v")

    # ------------------------------------------------------------------ actions

    def run(self, action, value=None):
        if action in HOTKEYS:
            with self.lock:
                pyautogui.hotkey(*HOTKEYS[action])
            return {"result": action}
        if action == "key":
            if value not in KEYS:
                raise ValueError(f"Unknown key '{value}'")
            with self.lock:
                pyautogui.press(value)
            return {"result": value}
        if action == "type":
            return {"result": self.typeText(value or "")}
        if action == "click":
            self.click(value or "left")
            return {"result": value or "left"}
        if action == "doubleClick":
            self.click("left", double=True)
            return {"result": "doubleClick"}
        if action == "drag":
            return {"result": self.setDrag(bool(value))}
        if action == "openApp":
            return {"result": self.openApp(value)}
        if action == "searchOpen":
            return {"result": self.searchOpen(value)}
        raise ValueError(f"Unknown laptop action '{action}'")

    def handlePointer(self, msg):
        """One message from the trackpad WebSocket."""
        kind = msg.get("t")
        if kind == "m":
            self.move(msg.get("dx", 0), msg.get("dy", 0))
        elif kind == "s":
            self.scroll(msg.get("dy", 0))
        elif kind == "c":
            self.click(msg.get("b", "left"), double=bool(msg.get("double")))
        elif kind == "d":
            self.setDrag(bool(msg.get("on")))
