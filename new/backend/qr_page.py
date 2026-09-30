"""A page with a QR code for the phone remote's URL, shown in a Chrome tab so
any phone on the Wi-Fi can scan it and open the remote."""

import html
import os
import socket

import segno

FRONTEND_PORT = int(os.getenv("FRONTEND_PORT", "9283"))


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
    safe = html.escape(url)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Remote QR</title>
<style>
  :root {{ color-scheme: dark; }}
  html, body {{ margin: 0; height: 100%; background: #0d0e12; color: #f1f1f1;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }}
  main {{ min-height: 100%; display: grid; place-items: center; padding: 24px; box-sizing: border-box; }}
  .card {{ display: flex; flex-direction: column; align-items: center; gap: 18px; text-align: center; }}
  h1 {{ margin: 0; font-size: 1.8rem; }}
  p {{ margin: 0; color: #9a9aa0; }}
  .qr {{ background: #fff; padding: 14px; border-radius: 18px; box-shadow: 0 20px 60px rgba(0,0,0,.5); }}
  .qr svg {{ display: block; width: min(60vh, 80vw); height: auto; }}
  .url {{ font: 600 1.3rem ui-monospace, Consolas, monospace; color: #fff;
    background: #1a1c22; border: 1px solid #2d3040; border-radius: 12px; padding: 10px 18px; }}
  .apps {{ font-size: .9rem; }}
</style>
</head>
<body>
<main>
  <div class="card">
    <h1>Scan to open the remote</h1>
    <div class="qr">{svg}</div>
    <div class="url">{safe}</div>
    <p>Point your phone camera at the code. The phone must be on the same Wi-Fi.</p>
    <p class="apps">Laptop · YouTube · Prime Video · Netflix</p>
  </div>
</main>
</body>
</html>"""
