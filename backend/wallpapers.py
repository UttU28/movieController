"""Video wallpapers for the Home screen (the QR page).

Wallpapers are streamed, not downloaded: for a wallspace.app page we find its
video file once and keep the link in wallpapers.json. The Home screen then plays
that link on a loop (the browser keeps it after the first load).

wallpapers.json:
  {"items": [{"id", "title", "page", "video", "poster"}],
   "selected": {"night": "<id>", "live": "<id>"}}
"""

import json
import re
import ssl
import threading
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

try:
    import certifi
    _SSL = ssl.create_default_context(cafile=certifi.where())
except ImportError:  # pragma: no cover
    _SSL = ssl.create_default_context()

DATA_FILE = Path(__file__).resolve().parent / "wallpapers.json"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154 Safari/537.36"

DEFAULTS = {
    "items": [
        {
            "id": "travelling-through-deepspace",
            "title": "Travelling Through Deepspace",
            "page": "https://wallspace.app/wallpaper/travelling-through-deepspace",
            "video": "https://s4.wallspace.app/wallpaper/484141906788993/previewhd.mp4",
            "poster": "https://s4.wallspace.app/wallpaper/484141906788993/thumbnail.webp",
        },
        {
            "id": "adorable-black-kitten",
            "title": "Adorable Black Kitten",
            "page": "https://wallspace.app/wallpaper/adorable-black-kitten",
            "video": "https://s4.wallspace.app/wallpaper/316884596819388/previewhd.mp4",
            "poster": "https://s4.wallspace.app/wallpaper/316884596819388/thumbnail.webp",
        },
    ],
    "selected": {"night": "travelling-through-deepspace", "live": "adorable-black-kitten"},
}

_lock = threading.Lock()


def _load():
    try:
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        if data.get("items"):
            return data
    except (OSError, ValueError):
        pass
    return json.loads(json.dumps(DEFAULTS))


def _save(data):
    tmp = DATA_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    tmp.replace(DATA_FILE)


def listing():
    with _lock:
        return _load()


def current(mode):
    """The wallpaper item for a mode ("night" or "live"), or None."""
    data = listing()
    wanted = data.get("selected", {}).get(mode)
    items = data["items"]
    return next((i for i in items if i["id"] == wanted), items[0] if items else None)


def _fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=20, context=_SSL) as r:
        return r.read(2_000_000).decode("utf-8", "replace")


def _meta(html, prop):
    m = re.search(r'<meta[^>]+property="og:%s"[^>]+content="([^"]+)"' % re.escape(prop), html)
    return m.group(1) if m else None


def resolve(page_url):
    """Find the video for a wallpaper page. Accepts a wallspace.app page or
    a direct .mp4 / .webm link. Raises ValueError with a readable message."""
    url = (page_url or "").strip()
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("Paste a full link, starting with https://")

    last = re.sub(r"\.(mp4|webm)$", "", parsed.path.rstrip("/").split("/")[-1], flags=re.I)
    slug = re.sub(r"[^a-z0-9-]+", "-", last.lower()).strip("-") or "wallpaper"

    if re.search(r"\.(mp4|webm)$", parsed.path, re.I):
        return {"id": slug, "title": slug.replace("-", " ").title(), "page": url, "video": url, "poster": None}

    try:
        html = _fetch(url)
    except Exception as e:
        raise ValueError(f"Couldn't open that page ({type(e).__name__}).")

    # wallspace: /wallpaper/<number>/previewhd.mp4 (the page also has an
    # unrelated showcase.mp4, which we skip).
    m = re.search(r"https://[a-z0-9.]*wallspace\.app/wallpaper/(\d+)/previewhd\.mp4", html)
    video = m.group(0) if m else None
    if not video:
        candidates = [v for v in re.findall(r'https?://[^"\'\s<>]+?\.(?:mp4|webm)', html) if "showcase" not in v]
        video = _meta(html, "video") or _meta(html, "video:url") or (candidates[0] if candidates else None)
    if not video:
        raise ValueError("Couldn't find a video on that page.")

    title = _meta(html, "title") or slug.replace("-", " ").title()
    title = re.sub(r"\s*(Live Wallpaper.*|\|.*)$", "", title).strip() or slug
    return {"id": slug, "title": title, "page": url, "video": video, "poster": _meta(html, "image")}


def add(page_url, select_for="live"):
    item = resolve(page_url)  # network: outside the lock
    with _lock:
        data = _load()
        data["items"] = [i for i in data["items"] if i["id"] != item["id"]] + [item]
        if select_for:
            data.setdefault("selected", {})[select_for] = item["id"]
        _save(data)
        return data


def select(item_id, mode="live"):
    with _lock:
        data = _load()
        if not any(i["id"] == item_id for i in data["items"]):
            raise ValueError("That wallpaper isn't in the collection.")
        data.setdefault("selected", {})[mode] = item_id
        _save(data)
        return data


def remove(item_id):
    with _lock:
        data = _load()
        items = [i for i in data["items"] if i["id"] != item_id]
        if len(items) == len(data["items"]):
            raise ValueError("That wallpaper isn't in the collection.")
        if not items:
            raise ValueError("Keep at least one wallpaper.")
        data["items"] = items
        for mode, chosen in list(data.get("selected", {}).items()):
            if chosen == item_id:
                data["selected"][mode] = items[0]["id"]
        _save(data)
        return data
