"""Bring the remote-controlled Chrome window to the foreground.

CDP's Page.bringToFront only switches tabs inside Chrome; it can't raise the
window above other apps.

Windows: blocks SetForegroundWindow from background processes, so we tap Alt
first (counts as input and lifts the foreground lock), then bring the window
to the top.

macOS: uses AppleScript to activate Chrome and switch to a specific tab by
URL (the QR code tab).
"""

import os
import subprocess


# --------------------------------------------------------------- Windows paths
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
    try:
        if os.name == "nt":
            out = subprocess.run(
                ["netstat", "-ano", "-p", "TCP"],
                capture_output=True, text=True, timeout=5,
                creationflags=subprocess.CREATE_NO_WINDOW,
            ).stdout
            for line in out.splitlines():
                parts = line.split()
                if len(parts) == 5 and parts[3] == "LISTENING" and parts[1].endswith(f":{port}"):
                    return int(parts[4])
        else:
            # macOS / Linux: `lsof -i :<port> -sTCP:LISTEN`
            out = subprocess.run(
                ["lsof", "-i", f":{port}", "-sTCP:LISTEN", "-t"],
                capture_output=True, text=True, timeout=5,
            ).stdout.strip()
            if out:
                return int(out.splitlines()[0])
    except (OSError, subprocess.SubprocessError, ValueError):
        pass
    return None


if os.name == "nt":

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
        """Titles of the active tab in each Chrome window."""
        if not pid:
            return []
        suffix = " - Google Chrome"
        return [t[: -len(suffix)] if t.endswith(suffix) else t for _, t in _chrome_windows(pid)]

    def focus_chrome(pid, tab_title=""):
        """Raise the Chrome window showing `tab_title` (or any window of `pid`)."""
        if not pid:
            return False
        windows = _chrome_windows(pid)
        if not windows:
            return False
        hwnd = next(
            (h for h, t in windows if tab_title and t.startswith(tab_title)),
            windows[0][0],
        )
        if user32.IsIconic(hwnd):
            user32.ShowWindow(hwnd, SW_RESTORE)
        user32.keybd_event(VK_MENU, 0, 0, 0)
        user32.keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0)
        user32.BringWindowToTop(hwnd)
        user32.SetForegroundWindow(hwnd)
        return user32.GetForegroundWindow() == hwnd

else:
    # ---------------------------------------------------------------- macOS

    def active_tab_titles(_pid):
        """macOS doesn't expose active-tab titles from outside Chrome."""
        return []

    def focus_chrome(pid, tab_title=""):
        """Activate Chrome and select the QR tab by URL, then bring it to front.

        Uses AppleScript: tell Chrome to activate, then cycle through windows
        and tabs to find the one whose URL contains the debug/QR port.
        """
        if not pid:
            return False
        try:
            # 1) Activate Chrome (brings its window to front)
            subprocess.run(
                ["osascript", "-e", 'tell application "Google Chrome" to activate'],
                capture_output=True, text=True, timeout=5,
            )

            # 2) Select the QR tab so it's the one showing on top
            qr_url = f":9282/qr"
            script = (
                'tell application "Google Chrome"\n'
                f'    repeat with w in every window\n'
                "        repeat with t in every tab of w\n"
                f'            if (URL of t)'
                f' contains "{qr_url}" then\n'
                "                tell w to set current tab to t\n"
                "                exit repeat\n"
                "            end if\n"
                "        end repeat\n"
                "        if (count of tabs of w) > 0 then exit repeat\n"
                "    end repeat\n"
                "end tell"
            )
            result = subprocess.run(
                ["osascript", "-e", script],
                capture_output=True, text=True, timeout=5,
            )
            return result.returncode == 0
        except (OSError, subprocess.SubprocessError):
            pass

        # Fallback: just activate Chrome (best effort)
        try:
            subprocess.run(
                ["osascript", "-e", 'tell application "Google Chrome" to activate'],
                capture_output=True, text=True, timeout=3,
            )
            return True
        except (OSError, subprocess.SubprocessError):
            return False
