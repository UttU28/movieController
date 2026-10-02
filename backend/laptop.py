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
CURSOR_IDLE_S = 3.0


def _set_clipboard(text):
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
# previews up. After it sits still, move it onto a tiny window of our own in
# the corner of that monitor. The window is what the pointer is "on", so
# Chrome is no longer hovered, and the window's cursor is blank.
if os.name == "nt":
    _LRESULT = ctypes.c_ssize_t
    _WNDPROC = ctypes.WINFUNCTYPE(_LRESULT, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM)
    _HWND_TOPMOST = ctypes.c_void_p(-1)
    _WS_POPUP = 0x80000000
    _WS_EX_LAYERED = 0x00080000
    _WS_EX_TOPMOST = 0x00000008
    _WS_EX_TOOLWINDOW = 0x00000080
    _WS_EX_NOACTIVATE = 0x08000000
    _LWA_ALPHA = 0x2
    _SW_HIDE = 0
    _SW_SHOWNA = 8
    _SWP_NOACTIVATE = 0x0010
    _SWP_SHOWWINDOW = 0x0040
    _PM_REMOVE = 0x0001
    _WM_SETCURSOR = 0x0020
    _PARK_SIZE = 16

    class _WNDCLASSW(ctypes.Structure):
        _fields_ = [
            ("style", wintypes.UINT),
            ("lpfnWndProc", _WNDPROC),
            ("cbClsExtra", ctypes.c_int),
            ("cbWndExtra", ctypes.c_int),
            ("hInstance", wintypes.HINSTANCE),
            ("hIcon", wintypes.HICON),
            ("hCursor", wintypes.HANDLE),
            ("hbrBackground", wintypes.HBRUSH),
            ("lpszMenuName", wintypes.LPCWSTR),
            ("lpszClassName", wintypes.LPCWSTR),
        ]

    class _MSG(ctypes.Structure):
        _fields_ = [
            ("hwnd", wintypes.HWND),
            ("message", wintypes.UINT),
            ("wParam", wintypes.WPARAM),
            ("lParam", wintypes.LPARAM),
            ("time", wintypes.DWORD),
            ("pt", wintypes.POINT),
            ("lPrivate", wintypes.DWORD),
        ]

    class _MONITORINFO(ctypes.Structure):
        _fields_ = [
            ("cbSize", wintypes.DWORD),
            ("rcMonitor", wintypes.RECT),
            ("rcWork", wintypes.RECT),
            ("dwFlags", wintypes.DWORD),
        ]

    user32.DefWindowProcW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
    user32.DefWindowProcW.restype = _LRESULT
    user32.RegisterClassW.argtypes = [ctypes.POINTER(_WNDCLASSW)]
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
    user32.MonitorFromPoint.argtypes = [wintypes.POINT, wintypes.DWORD]
    user32.MonitorFromPoint.restype = wintypes.HANDLE
    user32.GetMonitorInfoW.argtypes = [wintypes.HANDLE, ctypes.POINTER(_MONITORINFO)]
    user32.GetMonitorInfoW.restype = wintypes.BOOL
    user32.PeekMessageW.argtypes = [ctypes.POINTER(_MSG), wintypes.HWND, wintypes.UINT, wintypes.UINT, wintypes.UINT]
    user32.PeekMessageW.restype = wintypes.BOOL
    user32.TranslateMessage.argtypes = [ctypes.POINTER(_MSG)]
    user32.DispatchMessageW.argtypes = [ctypes.POINTER(_MSG)]
    user32.DispatchMessageW.restype = _LRESULT
    kernel32.GetModuleHandleW.argtypes = [wintypes.LPCWSTR]
    kernel32.GetModuleHandleW.restype = wintypes.HINSTANCE

    _BLANK_CURSOR = None

    def _blank_cursor():
        global _BLANK_CURSOR
        if _BLANK_CURSOR:
            return _BLANK_CURSOR
        width = user32.GetSystemMetrics(13) or 32
        height = user32.GetSystemMetrics(14) or 32
        stride = ((width + 15) // 16) * 2
        count = stride * height
        # AND bits set and XOR bits clear: the pointer draws nothing.
        and_mask = (ctypes.c_ubyte * count)(*([0xFF] * count))
        xor_mask = (ctypes.c_ubyte * count)(*([0x00] * count))
        _BLANK_CURSOR = user32.CreateCursor(
            kernel32.GetModuleHandleW(None), 0, 0, width, height, and_mask, xor_mask,
        )
        # CreateCursor copies the masks, but keep them alive anyway.
        _blank_cursor.masks = (and_mask, xor_mask)
        return _BLANK_CURSOR

    def _wnd_proc(hwnd, msg, wparam, lparam):
        if msg == _WM_SETCURSOR and _BLANK_CURSOR:
            user32.SetCursor(_BLANK_CURSOR)
            return 1
        return user32.DefWindowProcW(hwnd, msg, wparam, lparam)

    _WND_PROC_REF = _WNDPROC(_wnd_proc)
    _CLASS_NAME = "YtRemoteCursorPark"

    def _cursor_pos():
        pt = wintypes.POINT()
        if not user32.GetCursorPos(ctypes.byref(pt)):
            return None
        return (int(pt.x), int(pt.y))


class LaptopControl:
    def __init__(self):
        # pyautogui isn't thread-safe; the WebSocket and HTTP handlers share it.
        self.lock = threading.Lock()
        self.dragging = False
        self._parked = False
        self._saved = None
        self._last_pos = None
        self._last_activity = time.monotonic()
        self._trackpad_at = 0.0
        self._park_requested = False
        self._hide_window = False
        self._hwnd = None
        self._poke = threading.Event()
        self._uncovered = threading.Event()
        self._uncovered.set()
        self._tick_logged = False
        if os.name == "nt":
            threading.Thread(target=self._cursor_loop, name="cursor-idle", daemon=True).start()
            atexit.register(self._restore_cursor)

    def _restore_cursor(self):
        if not self._parked or not self._saved:
            return
        try:
            user32.SetCursorPos(int(self._saved[0]), int(self._saved[1]))
        except Exception:
            pass

    # ------------------------------------------------------------------ mouse

    def _note_pointer(self):
        """Caller holds self.lock. A trackpad action means the pointer is in use.
        Returns True when the blank cover is up and must be dropped by the
        window thread before this action runs."""
        if os.name != "nt":
            return False
        now = time.monotonic()
        self._last_activity = now
        self._trackpad_at = now
        if not (self._parked and self._saved):
            return False
        # The cover window belongs to the cursor thread. Hiding it from here
        # would wait on that thread while we still hold the lock, and every
        # later click, move and key would stall.
        self._parked = False
        self._last_pos = self._saved
        self._hide_window = True
        self._uncovered.clear()
        self._poke.set()
        return True

    def _use_pointer(self, fn):
        """Run a mouse action with the blank cover already gone."""
        with self.lock:
            waiting = self._note_pointer()
        if waiting:
            self._uncovered.wait(0.5)
        with self.lock:
            fn()

    def move(self, dx, dy):
        dx = max(-MOVE_LIMIT, min(MOVE_LIMIT, int(round(dx))))
        dy = max(-MOVE_LIMIT, min(MOVE_LIMIT, int(round(dy))))
        if dx or dy:
            def go():
                pyautogui.moveRel(dx, dy, _pause=False)
                if os.name == "nt":
                    self._last_pos = _cursor_pos()
            self._use_pointer(go)

    def scroll(self, amount):
        # Windows wheel units: 120 = one notch; small values scroll smoothly.
        amount = max(-SCROLL_LIMIT, min(SCROLL_LIMIT, int(round(amount))))
        if amount:
            self._use_pointer(lambda: pyautogui.scroll(amount, _pause=False))

    def click(self, button="left", double=False):
        if button not in ("left", "right", "middle"):
            raise ValueError(f"Unknown mouse button '{button}'")
        clicks = 2 if double else 1
        self._use_pointer(lambda: pyautogui.click(button=button, clicks=clicks, interval=0.08))

    def set_drag(self, on):
        """Hold the left button down so trackpad moves drag things."""
        def go():
            if on and not self.dragging:
                pyautogui.mouseDown()
            elif not on and self.dragging:
                pyautogui.mouseUp()
            self.dragging = bool(on)
        self._use_pointer(go)
        return self.dragging

    def settle(self):
        """Put the pointer away now. Web-app clicks leave it on the video;
        the trackpad keeps it if it was just used."""
        if os.name != "nt":
            return
        with self.lock:
            if self.dragging or self._parked:
                return
            if time.monotonic() - self._trackpad_at < 0.8:
                return
            self._park_requested = True
        self._poke.set()

    def _cursor_loop(self):
        try:
            self._create_park_window()
        except Exception as e:
            print(f"cursor park window failed: {e}")
        while True:
            self._poke.wait(0.25)
            self._poke.clear()
            try:
                self._pump()
                self._tick()
                self._pump()
            except Exception as e:
                if not self._tick_logged:
                    self._tick_logged = True
                    print(f"cursor idle failed: {e}")

    def _create_park_window(self):
        blank = _blank_cursor()
        instance = kernel32.GetModuleHandleW(None)
        cls = _WNDCLASSW()
        cls.lpfnWndProc = _WND_PROC_REF
        cls.hInstance = instance
        cls.hCursor = blank
        cls.lpszClassName = _CLASS_NAME
        # Windows keeps the class-name pointer; the structure has to stay alive.
        self._wndclass = cls
        if not user32.RegisterClassW(ctypes.byref(cls)):
            err = ctypes.get_last_error()
            if err != 1410:  # class already registered (reload)
                raise OSError(f"RegisterClassW failed ({err})")
        hwnd = user32.CreateWindowExW(
            _WS_EX_LAYERED | _WS_EX_TOPMOST | _WS_EX_TOOLWINDOW | _WS_EX_NOACTIVATE,
            _CLASS_NAME, "", _WS_POPUP,
            0, 0, _PARK_SIZE, _PARK_SIZE,
            None, None, instance, None,
        )
        if not hwnd:
            raise OSError(f"CreateWindowExW failed ({ctypes.get_last_error()})")
        user32.SetLayeredWindowAttributes(hwnd, 0, 1, _LWA_ALPHA)
        user32.ShowWindow(hwnd, _SW_HIDE)
        self._hwnd = hwnd

    def _pump(self):
        if not self._hwnd:
            return
        msg = _MSG()
        while user32.PeekMessageW(ctypes.byref(msg), None, 0, 0, _PM_REMOVE):
            user32.TranslateMessage(ctypes.byref(msg))
            user32.DispatchMessageW(ctypes.byref(msg))

    def _tick(self):
        with self.lock:
            hide = self._hide_window
            self._hide_window = False
            requested = self._park_requested
            self._park_requested = False
            pos = _cursor_pos()
            now = time.monotonic()
            if pos is not None and self._last_pos is None:
                self._last_pos = pos
            elif pos is not None and pos != self._last_pos:
                nudged = (self._parked and abs(pos[0] - self._last_pos[0]) <= _PARK_SIZE
                          and abs(pos[1] - self._last_pos[1]) <= _PARK_SIZE)
                self._last_pos = pos
                if not nudged:
                    # A physical mouse, or a click the web remote just made.
                    self._last_activity = now
                    if self._parked:
                        self._parked = False
                        self._saved = pos
                        hide = True
            idle = (not self.dragging and not self._parked
                    and now - self._last_activity >= CURSOR_IDLE_S)
            trackpad_live = now - self._trackpad_at < 0.8
            do_park = (requested or idle) and not self.dragging and not self._parked and not trackpad_live
            if do_park and pos is not None:
                self._park(pos)
                hide = False
            parked = self._parked
        if hide and not parked and self._hwnd:
            user32.ShowWindow(self._hwnd, _SW_HIDE)
        if hide:
            self._uncovered.set()

    def _park(self, pos):
        """Hide the pointer where it is. Caller holds self.lock and is the
        window's thread. A blank window covers the hotspot, so Windows draws
        nothing and the video underneath stops seeing a hover."""
        self._saved = pos
        x, y = int(pos[0]), int(pos[1])
        if self._hwnd:
            user32.SetWindowPos(
                self._hwnd, _HWND_TOPMOST,
                x - _PARK_SIZE // 2, y - _PARK_SIZE // 2,
                _PARK_SIZE, _PARK_SIZE,
                _SWP_NOACTIVATE | _SWP_SHOWWINDOW,
            )
        if _BLANK_CURSOR:
            user32.SetCursor(_BLANK_CURSOR)
        self._parked = True
        self._last_pos = pos

    # ------------------------------------------------------------------ keyboard

    def type_text(self, text):
        if not text:
            return 0
        with self.lock:
            self._write_any(text)
        return len(text)

    def open_app(self, name):
        target = APPS.get(name)
        if target is None:
            raise ValueError(f"Unknown app '{name}'")
        subprocess.Popen(f'start "" {target}', shell=True,
                         creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        return name

    def search_open(self, query):
        """Open anything by name through the Start menu search."""
        query = (query or "").strip()
        if not query:
            raise ValueError("Type an app or file name")
        with self.lock:
            pyautogui.press("win")
            time.sleep(0.6)
            self._write_any(query)
            time.sleep(0.9)
            pyautogui.press("enter")
        return query

    def _write_any(self, text):
        # pyautogui can only type ASCII; paste anything else.
        if text.isascii():
            pyautogui.write(text, interval=0.01)
        else:
            _set_clipboard(text)
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
            return {"result": self.type_text(value or "")}
        if action == "click":
            self.click(value or "left")
            return {"result": value or "left"}
        if action == "doubleClick":
            self.click("left", double=True)
            return {"result": "doubleClick"}
        if action == "drag":
            return {"result": self.set_drag(bool(value))}
        if action == "openApp":
            return {"result": self.open_app(value)}
        if action == "searchOpen":
            return {"result": self.search_open(value)}
        raise ValueError(f"Unknown laptop action '{action}'")

    def handle_pointer(self, msg):
        """One message from the trackpad WebSocket."""
        kind = msg.get("t")
        if kind == "m":
            self.move(msg.get("dx", 0), msg.get("dy", 0))
        elif kind == "s":
            self.scroll(msg.get("dy", 0))
        elif kind == "c":
            self.click(msg.get("b", "left"), double=bool(msg.get("double")))
        elif kind == "d":
            self.set_drag(bool(msg.get("on")))
