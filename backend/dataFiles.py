"""The small state files the backend keeps next to itself (all gitignored)."""

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def dataFile(name, oldName=None):
    """Path of a state file. A file still under its old snake_case name
    (from before the rename) is moved over once, so nothing is lost."""
    path = BASE_DIR / name
    old = BASE_DIR / oldName if oldName else None
    if old is not None and old.exists() and not path.exists():
        try:
            old.rename(path)
        except OSError:
            pass
    return path


def readText(path, default=""):
    try:
        return path.read_text(encoding="utf-8").strip()
    except OSError:
        return default


def writeText(path, text):
    try:
        path.write_text(text, encoding="utf-8")
    except OSError:
        pass
