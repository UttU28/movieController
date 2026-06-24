"""
Linux input control with pyautogui / xdotool / ydotool backends.

pyautogui often silently fails on Raspberry Pi (Wayland, missing Xlib, wrong session).
Set INPUT_BACKEND=xdotool or ydotool in .env if auto-detection picks the wrong one.
"""

from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

def _session_env() -> dict[str, str]:
    env = os.environ.copy()
    if not env.get("DISPLAY"):
        env["DISPLAY"] = os.getenv("DISPLAY", ":0")

    xauth = os.getenv("XAUTHORITY", "").strip()
    if xauth and os.path.isfile(os.path.expanduser(xauth)):
        env["XAUTHORITY"] = os.path.expanduser(xauth)
    elif env.get("XAUTHORITY") and os.path.isfile(os.path.expanduser(env["XAUTHORITY"])):
        env["XAUTHORITY"] = os.path.expanduser(env["XAUTHORITY"])
    else:
        home = os.path.expanduser("~")
        uid = os.getuid()
        for candidate in (
            f"{home}/.Xauthority",
            f"/run/user/{uid}/gdm/Xauthority",
            f"/run/user/{uid}/Xauthority",
        ):
            if os.path.isfile(candidate):
                env["XAUTHORITY"] = candidate
                break
        else:
            import glob

            for candidate in glob.glob(f"/run/user/{uid}/.mutter-Xwaylandauth.*"):
                if os.path.isfile(candidate):
                    env["XAUTHORITY"] = candidate
                    break
            else:
                env.pop("XAUTHORITY", None)
    return env


def _session_type() -> str:
    explicit = os.getenv("XDG_SESSION_TYPE", "").strip().lower()
    if explicit:
        return explicit
    if os.getenv("WAYLAND_DISPLAY"):
        return "wayland"
    return "x11"


# ---------------------------------------------------------------------------
# Key name mapping (pyautogui -> xdotool / ydotool)
# ---------------------------------------------------------------------------

KEY_MAP: dict[str, str] = {
    "win": "super",
    "super": "super",
    "ctrl": "ctrl",
    "control": "ctrl",
    "alt": "alt",
    "shift": "shift",
    "tab": "Tab",
    "enter": "Return",
    "return": "Return",
    "backspace": "BackSpace",
    "esc": "Escape",
    "escape": "Escape",
    "space": "space",
    "left": "Left",
    "right": "Right",
    "up": "Up",
    "down": "Down",
    "volumeup": "XF86AudioRaiseVolume",
    "volumedown": "XF86AudioLowerVolume",
    "f": "f",
    "f5": "F5",
    "f6": "F6",
    "slash": "slash",
    "/": "slash",
    "0": "0",
    "1": "1",
    "a": "a",
    "d": "d",
    "i": "i",
    "l": "l",
    "n": "n",
    "t": "t",
    "w": "w",
}

HELD_KEYS: list[str] = []


def _map_key(key: str) -> str:
    k = key.lower().strip()
    if k in KEY_MAP:
        return KEY_MAP[k]
    if len(key) == 1:
        return key
    if key.startswith("f") and key[1:].isdigit():
        return key.upper()
    return key


def _xdotool_combo(keys: list[str]) -> str:
    return "+".join(_map_key(k) for k in keys)


# ---------------------------------------------------------------------------
# Backend runners
# ---------------------------------------------------------------------------

class _Runner:
    name = "base"

    def move_rel(self, dx: float, dy: float) -> None:
        raise NotImplementedError

    def click(self, x: int | None, y: int | None, button: str) -> None:
        raise NotImplementedError

    def scroll(self, amount: int) -> None:
        raise NotImplementedError

    def press(self, key: str) -> None:
        raise NotImplementedError

    def key_down(self, key: str) -> None:
        raise NotImplementedError

    def key_up(self, key: str) -> None:
        raise NotImplementedError

    def hotkey(self, *keys: str) -> None:
        raise NotImplementedError

    def typewrite(self, text: str) -> None:
        raise NotImplementedError

    def probe(self) -> tuple[bool, str]:
        return False, "not implemented"


class _XdotoolRunner(_Runner):
    name = "xdotool"

    def _run(self, *args: str) -> None:
        cmd = ["xdotool", *args]
        result = subprocess.run(
            cmd,
            env=_session_env(),
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            err = (result.stderr or result.stdout or "").strip()
            raise RuntimeError(f"xdotool failed ({' '.join(cmd)}): {err}")

    def move_rel(self, dx: float, dy: float) -> None:
        self._run("mousemove_relative", "--", str(int(dx)), str(int(dy)))

    def click(self, x: int | None, y: int | None, button: str) -> None:
        btn = {"left": "1", "right": "3", "middle": "2"}.get(button, "1")
        if x is not None and y is not None:
            self._run("mousemove", "--sync", str(int(x)), str(int(y)))
        self._run("click", btn)

    def scroll(self, amount: int) -> None:
        btn = "4" if amount > 0 else "5"
        repeats = max(1, abs(int(amount)))
        self._run("click", "--repeat", str(repeats), btn)

    def press(self, key: str) -> None:
        self._run("key", "--clearmodifiers", _map_key(key))

    def key_down(self, key: str) -> None:
        HELD_KEYS.append(_map_key(key))
        self._run("keydown", _map_key(key))

    def key_up(self, key: str) -> None:
        mapped = _map_key(key)
        if mapped in HELD_KEYS:
            HELD_KEYS.remove(mapped)
        self._run("keyup", mapped)

    def hotkey(self, *keys: str) -> None:
        self._run("key", "--clearmodifiers", _xdotool_combo(list(keys)))

    def typewrite(self, text: str) -> None:
        # xdotool type handles most chars; delay helps on slow Pi
        self._run("type", "--delay", "12", "--", text)

    def probe(self) -> tuple[bool, str]:
        if not shutil.which("xdotool"):
            return False, "xdotool not installed"
        env = _session_env()
        if not env.get("DISPLAY"):
            return False, "DISPLAY not set"
        try:
            result = subprocess.run(
                ["xdotool", "getdisplaygeometry"],
                env=env,
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                return True, f"display {env['DISPLAY']} geometry {result.stdout.strip()}"
            return False, (result.stderr or result.stdout or "xdotool probe failed").strip()
        except Exception as exc:
            return False, str(exc)


class _YdotoolRunner(_Runner):
    name = "ydotool"

    def _run(self, *args: str) -> None:
        cmd = ["ydotool", *args]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode != 0:
            err = (result.stderr or result.stdout or "").strip()
            raise RuntimeError(f"ydotool failed ({' '.join(cmd)}): {err}")

    def move_rel(self, dx: float, dy: float) -> None:
        self._run("mousemove", "--", str(int(dx)), str(int(dy)))

    def click(self, x: int | None, y: int | None, button: str) -> None:
        if x is not None and y is not None:
            self._run("mousemove", "--absolute", "--", str(int(x)), str(int(y)))
        code = {"left": "0x00", "right": "0x01", "middle": "0x02"}.get(button, "0x00")
        self._run("click", code)

    def scroll(self, amount: int) -> None:
        code = "0xC8" if amount > 0 else "0xC9"
        repeats = max(1, abs(int(amount)))
        for _ in range(repeats):
            self._run("click", code)

    def press(self, key: str) -> None:
        self._run("key", _map_key(key))

    def key_down(self, key: str) -> None:
        mapped = _map_key(key)
        HELD_KEYS.append(mapped)
        self._run("key", f"{mapped}:1")

    def key_up(self, key: str) -> None:
        mapped = _map_key(key)
        if mapped in HELD_KEYS:
            HELD_KEYS.remove(mapped)
        self._run("key", f"{mapped}:0")

    def hotkey(self, *keys: str) -> None:
        self._run("key", _xdotool_combo(list(keys)))

    def typewrite(self, text: str) -> None:
        self._run("type", text)

    def probe(self) -> tuple[bool, str]:
        if not shutil.which("ydotool"):
            return False, "ydotool not installed (sudo apt install ydotool)"
        sock = os.getenv("YDOTOOL_SOCKET", "/tmp/.ydotool_socket")
        if not os.path.exists(sock):
            return False, f"ydotoold not running (start: ydotoold &; socket {sock})"
        try:
            result = subprocess.run(
                ["ydotool", "mousemove", "0", "0"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                return True, f"ydotool socket {sock} ok"
            return False, (result.stderr or result.stdout or "ydotool probe failed").strip()
        except Exception as exc:
            return False, str(exc)


class _PyAutoGuiRunner(_Runner):
    name = "pyautogui"

    def __init__(self) -> None:
        import pyautogui

        pyautogui.FAILSAFE = False
        pyautogui.PAUSE = float(os.getenv("PYAUTOGUI_PAUSE", "0.02"))
        self._py = pyautogui

    def move_rel(self, dx: float, dy: float) -> None:
        self._py.moveRel(dx, dy)

    def click(self, x: int | None, y: int | None, button: str) -> None:
        if x is not None and y is not None:
            self._py.click(x, y, button=button)
        else:
            self._py.click(button=button)

    def scroll(self, amount: int) -> None:
        self._py.scroll(int(amount))

    def press(self, key: str) -> None:
        self._py.press(key)

    def key_down(self, key: str) -> None:
        self._py.keyDown(key)

    def key_up(self, key: str) -> None:
        self._py.keyUp(key)

    def hotkey(self, *keys: str) -> None:
        self._py.hotkey(*keys)

    def typewrite(self, text: str) -> None:
        self._py.typewrite(text, interval=0.02)

    def probe(self) -> tuple[bool, str]:
        try:
            pos = self._py.position()
            return True, f"position {pos}"
        except Exception as exc:
            return False, str(exc)


# ---------------------------------------------------------------------------
# Backend selection
# ---------------------------------------------------------------------------

_RUNNER: _Runner | None = None
_BACKEND_NAME = "uninitialized"


def _tool_available(name: str) -> bool:
    return shutil.which(name) is not None


def _pick_runner() -> _Runner:
    global _RUNNER, _BACKEND_NAME
    if _RUNNER is not None:
        return _RUNNER

    preference = os.getenv("INPUT_BACKEND", "auto").lower().strip()
    session = _session_type()
    order: list[str]

    if preference != "auto":
        order = [preference]
    elif session == "wayland":
        order = ["ydotool", "xdotool", "pyautogui"]
    else:
        order = ["xdotool", "pyautogui", "ydotool"]

    factories: dict[str, type[_Runner]] = {
        "xdotool": _XdotoolRunner,
        "ydotool": _YdotoolRunner,
        "pyautogui": _PyAutoGuiRunner,
    }

    errors: list[str] = []
    for name in order:
        if name not in factories:
            errors.append(f"unknown backend {name}")
            continue
        if name in ("xdotool", "ydotool") and not _tool_available(name):
            errors.append(f"{name}: binary not found")
            continue
        runner = factories[name]()
        ok, detail = runner.probe()
        if ok:
            _RUNNER = runner
            _BACKEND_NAME = name
            logger.info("Using input backend %s (%s)", name, detail)
            return _RUNNER
        errors.append(f"{name}: {detail}")

    raise RuntimeError(
        "No working input backend. Tried: "
        + "; ".join(errors)
        + ". Install xdotool (X11) or ydotool (Wayland) on the Pi."
    )


def get_backend_name() -> str:
    _pick_runner()
    return _BACKEND_NAME


def diagnostics() -> dict[str, Any]:
    env = _session_env()
    results: dict[str, Any] = {
        "user": os.getenv("USER") or os.getlogin(),
        "uid": os.getuid(),
        "session_type": _session_type(),
        "display": env.get("DISPLAY"),
        "wayland_display": os.getenv("WAYLAND_DISPLAY"),
        "xauthority": env.get("XAUTHORITY"),
        "input_backend_env": os.getenv("INPUT_BACKEND", "auto"),
        "active_backend": None,
        "probes": {},
    }
    for name, cls in [
        ("xdotool", _XdotoolRunner),
        ("ydotool", _YdotoolRunner),
        ("pyautogui", _PyAutoGuiRunner),
    ]:
        try:
            ok, detail = cls().probe()
            results["probes"][name] = {"ok": ok, "detail": detail}
        except Exception as exc:
            results["probes"][name] = {"ok": False, "detail": str(exc)}
    try:
        results["active_backend"] = get_backend_name()
    except Exception as exc:
        results["active_backend_error"] = str(exc)
    return results


# ---------------------------------------------------------------------------
# Public API (pyautogui-compatible)
# ---------------------------------------------------------------------------

def moveRel(dx: float, dy: float) -> None:
    _pick_runner().move_rel(dx, dy)


def click(x: int | None = None, y: int | None = None, button: str = "left") -> None:
    _pick_runner().click(x, y, button)


def scroll(amount: int) -> None:
    _pick_runner().scroll(amount)


def press(key: str) -> None:
    _pick_runner().press(key)


def keyDown(key: str) -> None:
    _pick_runner().key_down(key)


def keyUp(key: str) -> None:
    _pick_runner().key_up(key)


def hotkey(*keys: str) -> None:
    _pick_runner().hotkey(*keys)


def typewrite(text: str) -> None:
    _pick_runner().typewrite(text)


# Alias used by util modules: `from utils.input_control import py`
class _PyNamespace:
    moveRel = staticmethod(moveRel)
    click = staticmethod(click)
    scroll = staticmethod(scroll)
    press = staticmethod(press)
    keyDown = staticmethod(keyDown)
    keyUp = staticmethod(keyUp)
    hotkey = staticmethod(hotkey)
    typewrite = staticmethod(typewrite)


py = _PyNamespace()
