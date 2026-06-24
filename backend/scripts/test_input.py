#!/usr/bin/env python3
"""
Test input backends on the Raspberry Pi (run ON the Pi desktop session).

  cd ~/Desktop/movieController/backend
  source env/bin/activate   # or your venv
  python scripts/test_input.py
  python scripts/test_input.py --live    # actually move mouse + type (careful!)
  python scripts/test_input.py --backend xdotool

If pyautogui fails but xdotool/ydotool work, set in .env:
  INPUT_BACKEND=xdotool    # X11 desktop
  INPUT_BACKEND=ydotool    # Wayland desktop (also: ydotoold &)
"""

from __future__ import annotations

import argparse
import json
import os
import sys

# Allow running from backend/ or backend/scripts/
BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_ROOT)

from dotenv import load_dotenv

load_dotenv(os.path.join(BACKEND_ROOT, ".env"))


def print_header(title: str) -> None:
    print()
    print("=" * 72)
    print(f" {title}")
    print("=" * 72)


def print_fixes(session: str) -> None:
    print_header("Likely fixes on Raspberry Pi")
    if session == "wayland":
        print("""
  Your session is Wayland — pyautogui and xdotool will NOT work.

  1. Install ydotool:
       sudo apt install ydotool
  2. Add your user to the input group (then reboot):
       sudo usermod -aG input $USER
  3. Start the daemon (add to autostart or ~/.profile):
       ydotoold &
  4. In backend/.env:
       INPUT_BACKEND=ydotool

  OR switch Pi to X11: Raspberry Pi Configuration → Advanced → Wayland → X11
""")
    else:
        print("""
  Your session looks like X11.

  1. Install xdotool (recommended — more reliable than pyautogui on Pi):
       sudo apt install xdotool
  2. In backend/.env:
       INPUT_BACKEND=xdotool
       DISPLAY=:0
       XAUTHORITY=/home/YOUR_USER/.Xauthority

  3. Run the API as the SAME user logged into the desktop (not root).
     PM2: pm2 start ... --uid $(whoami)

  4. If started via SSH, export display first:
       export DISPLAY=:0
       export XAUTHORITY=/home/YOUR_USER/.Xauthority
""")


def main() -> int:
    parser = argparse.ArgumentParser(description="Movie Controller input diagnostics")
    parser.add_argument(
        "--backend",
        choices=["auto", "xdotool", "ydotool", "pyautogui"],
        default=None,
        help="Force a backend for --live test",
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="Run a real move + key test (watch the screen!)",
    )
    args = parser.parse_args()

    if args.backend:
        os.environ["INPUT_BACKEND"] = args.backend

    from utils import input_control

    print_header("Environment")
    diag = input_control.diagnostics()
    print(json.dumps(diag, indent=2))

    print_header("Backend probe summary")
    for name, result in diag["probes"].items():
        status = "OK" if result["ok"] else "FAIL"
        print(f"  [{status:4}] {name:10} — {result['detail']}")

    if diag.get("active_backend"):
        print(f"\n  Active backend: {diag['active_backend']}")
    elif diag.get("active_backend_error"):
        print(f"\n  No active backend: {diag['active_backend_error']}")

    print_fixes(diag.get("session_type", "unknown"))

    if args.live:
        print_header("Live test (5 second countdown — focus the desktop)")
        import time

        for i in range(5, 0, -1):
            print(f"  {i}...")
            time.sleep(1)

        try:
            backend = input_control.get_backend_name()
            print(f"  Using backend: {backend}")
            print("  → move mouse +50px right")
            input_control.moveRel(50, 0)
            time.sleep(0.3)
            print("  → move mouse -50px left")
            input_control.moveRel(-50, 0)
            time.sleep(0.3)
            print("  → scroll up")
            input_control.scroll(2)
            time.sleep(0.3)
            print("  → press Escape (should not break anything)")
            input_control.press("esc")
            print("\n  LIVE TEST PASSED — if you saw movement, input is working.")
            return 0
        except Exception as exc:
            print(f"\n  LIVE TEST FAILED: {exc}")
            return 1

    # Recommend best backend
    probes = diag["probes"]
    if probes.get("xdotool", {}).get("ok"):
        print("\n  Recommendation: INPUT_BACKEND=xdotool")
    elif probes.get("ydotool", {}).get("ok"):
        print("\n  Recommendation: INPUT_BACKEND=ydotool")
    elif probes.get("pyautogui", {}).get("ok"):
        print("\n  Recommendation: INPUT_BACKEND=pyautogui")
    else:
        print("\n  No backend passed probe — install xdotool or ydotool (see above).")
        return 1

    print("\n  Run with --live to verify mouse movement on screen.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
