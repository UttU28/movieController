"""A page with a QR code for the phone remote's URL, shown in a Chrome tab so
any phone on the Wi-Fi can scan it and open the remote.

The page is templates/qr.html: edit it freely; {{QR}} becomes the QR code
(inline SVG) and {{URL}} the remote's address. It's re-read on every request.
"""

import html
import os
import socket
from pathlib import Path

import segno

FRONTEND_PORT = int(os.getenv("FRONTEND_PORT", "9283"))
TEMPLATE = Path(__file__).resolve().parent / "templates" / "qr.html"


def lan_ip():
    """This PC's address on the local network (the interface used to reach
    the internet; no packets are actually sent)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def remote_url():
    return os.getenv("FRONTEND_URL", "").strip() or f"http://{lan_ip()}:{FRONTEND_PORT}"


def render():
    url = remote_url()
    svg = segno.make(url, error="m").svg_inline(scale=10, border=2, dark="#000", light="#fff")
    page = TEMPLATE.read_text(encoding="utf-8")
    return page.replace("{{QR}}", svg).replace("{{URL}}", html.escape(url))
