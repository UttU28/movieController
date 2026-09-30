"""A page with a QR code for the phone remote's URL, shown in a Chrome tab so
any phone on the Wi-Fi can scan it and open the remote.

The page is templates/qr.html: edit it freely; {{QR}} becomes the QR code
(inline SVG) and {{URL}} the remote's address.  {{MODE}} is the UI mode
("day", "night", "live") for matching styles.  Re-read on every request.
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


def render(mode="day"):
    mode = (mode or "day").lower()
    if mode not in ("day", "night", "live"):
        mode = "day"

    url = remote_url()
    svg = segno.make(url, error="m").svg_inline(scale=10, border=2, dark="#000", light="#fff")
    page = TEMPLATE.read_text(encoding="utf-8")
    page = page.replace("{{QR}}", svg).replace("{{URL}}", html.escape(url)).replace("{{MODE}}", mode)

    if mode == "live":
        # Inject noise canvas for live mode.
        canvas_el = (
            '<canvas id="noise-canvas" style="position:fixed;inset:0;z-index:0;'
            'opacity:.08;pointer-events:none;filter:blur(1px)">'
            '</canvas><script>'
        )
        noise_js = (
            '(function(){var c=document.getElementById("noise-canvas");'
            'if(!c)return;var x=c.getContext("2d",{willReadFrequently:true});'
            'var w,h,seed=Date.now();'
            'function R(){w=c.width=innerWidth;h=c.height=innerHeight;}R();'
            'addEventListener("resize",R);'
            'function n(){seed=(seed*16807+1)&0x7fffffff;return(seed-1)/0x7fffffff;}'
            'var id;function F(){var i=x.createImageData(w,h),d=i.data;'
            'for(var j=0;j<d.length;j+=4){var v=n()*255|0;'
            'd[j]=d[j+1]=d[j+2]=v;d[j+3]=255;}x.putImageData(i,0,0);'
            'id=requestAnimationFrame(F);}F();'
            'var m=document.body.dataset.mode;'
            'var ck=setInterval(function(){'
            'if(document.body.dataset.mode!==m||'
            '!document.getElementById("noise-canvas")){'
            'cancelAnimationFrame(id);clearInterval(ck);}});'
            '})();'
        )
        page = page.replace("{{NOISE_SCRIPT}}", canvas_el + noise_js + '</script>')
    else:
        page = page.replace("{{NOISE_SCRIPT}}", "")

    return page
