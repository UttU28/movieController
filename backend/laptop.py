"""Laptop control: mouse, keyboard, hotkeys, media keys and app launching.

Drives the real Windows desktop with pyautogui, like the original controller.
Mouse movement arrives over a WebSocket for smooth trackpad control; everything
else is a named action.
"""

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


class LaptopControl:
    def __init__(self):
        # pyautogui isn't thread-safe; the WebSocket and HTTP handlers share it.
        self.lock = threading.Lock()
        self.dragging = False

    # ------------------------------------------------------------------ mouse

    def move(self, dx, dy):
        dx = max(-MOVE_LIMIT, min(MOVE_LIMIT, int(round(dx))))
        dy = max(-MOVE_LIMIT, min(MOVE_LIMIT, int(round(dy))))
        if dx or dy:
            with self.lock:
                pyautogui.moveRel(dx, dy, _pause=False)

    def scroll(self, amount):
        # Windows wheel units: 120 = one notch; small values scroll smoothly.
        amount = max(-SCROLL_LIMIT, min(SCROLL_LIMIT, int(round(amount))))
        if amount:
            with self.lock:
                pyautogui.scroll(amount, _pause=False)

    def click(self, button="left", double=False):
        if button not in ("left", "right", "middle"):
            raise ValueError(f"Unknown mouse button '{button}'")
        with self.lock:
            pyautogui.click(button=button, clicks=2 if double else 1, interval=0.08)

    def set_drag(self, on):
        """Hold the left button down so trackpad moves drag things."""
        with self.lock:
            if on and not self.dragging:
                pyautogui.mouseDown()
            elif not on and self.dragging:
                pyautogui.mouseUp()
            self.dragging = bool(on)
        return self.dragging

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
