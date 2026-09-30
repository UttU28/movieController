"""Bring the remote-controlled Chrome window to the foreground (Windows only).

CDP's Page.bringToFront only switches tabs inside Chrome; it can't raise the
window above other apps. Windows also blocks SetForegroundWindow from
background processes, so we use the usual workaround of tapping Alt first,
which counts as input and lifts the foreground lock.
"""

import os
import subprocess

if os.name == "nt":
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.WinDLL("user32", use_last_error=True)
    EnumWindowsProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    user32.EnumWindows.argtypes = [EnumWindowsProc, wintypes.LPARAM]
    user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    user32.GetWindowTextLengthW.argtypes = [wintypes.HWND]
    user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    user32.GetClassNameW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    user32.IsWindowVisible.argtypes = [wintypes.HWND]
    user32.IsIconic.argtypes = [wintypes.HWND]
    user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
    user32.SetForegroundWindow.argtypes = [wintypes.HWND]
    user32.BringWindowToTop.argtypes = [wintypes.HWND]
    user32.GetForegroundWindow.restype = wintypes.HWND

SW_RESTORE = 9
VK_MENU = 0x12
KEYEVENTF_KEYUP = 0x0002


def pid_listening_on(port):
    """PID of the process listening on a local TCP port (Chrome's debug port)."""
    if os.name != "nt":
        return None
    try:
        out = subprocess.run(["netstat", "-ano", "-p", "TCP"], capture_output=True, text=True,
                             timeout=5, creationflags=subprocess.CREATE_NO_WINDOW).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    for line in out.splitlines():
        parts = line.split()
        if len(parts) == 5 and parts[3] == "LISTENING" and parts[1].endswith(f":{port}"):
            return int(parts[4])
    return None


def _chrome_windows(pid):
    """Visible top-level Chrome windows of the given browser process."""
    found = []

    def callback(hwnd, _):
        owner = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(owner))
        if owner.value != pid or not user32.IsWindowVisible(hwnd):
            return True
        cls = ctypes.create_unicode_buffer(64)
        user32.GetClassNameW(hwnd, cls, 64)
        length = user32.GetWindowTextLengthW(hwnd)
        if cls.value == "Chrome_WidgetWin_1" and length:
            title = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, title, length + 1)
            found.append((hwnd, title.value))
        return True

    user32.EnumWindows(EnumWindowsProc(callback), 0)
    return found


def active_tab_titles(pid):
    """Titles of the active tab in each Chrome window. Windows keeps these
    even while Chrome is covered by other apps (when every tab reports its
    page as "hidden")."""
    if os.name != "nt" or not pid:
        return []
    suffix = " - Google Chrome"
    return [t[: -len(suffix)] if t.endswith(suffix) else t for _, t in _chrome_windows(pid)]


def focus_chrome(pid, tab_title=""):
    """Raise the Chrome window showing `tab_title` (or any window of `pid`).
    Returns True if it ended up as the foreground window."""
    if os.name != "nt" or not pid:
        return False
    windows = _chrome_windows(pid)
    if not windows:
        return False
    # The window title is "<active tab title> - Google Chrome".
    hwnd = next((h for h, t in windows if tab_title and t.startswith(tab_title)), windows[0][0])
    if user32.IsIconic(hwnd):
        user32.ShowWindow(hwnd, SW_RESTORE)
    user32.keybd_event(VK_MENU, 0, 0, 0)
    user32.keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0)
    user32.BringWindowToTop(hwnd)
    user32.SetForegroundWindow(hwnd)
    return user32.GetForegroundWindow() == hwnd
