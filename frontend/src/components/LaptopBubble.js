"use client";

import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLaptop } from "@fortawesome/free-solid-svg-icons";
import { buzz } from "./RemoteButton";

const POS_KEY = "remote.laptopBubble";
const SIZE = 50;
const MARGIN = 10;
const DRAG_SLOP = 6;

function clampY(y) {
  return Math.min(Math.max(y, 90), window.innerHeight - SIZE - 120);
}

// Floating laptop button. Drag it anywhere (it snaps to the nearest side and
// remembers where you left it); tap it to open the laptop drawer, and tap it
// again (it stays above the drawer) to close it.
export default function LaptopBubble({ onTap, active = false }) {
  const [pos, setPos] = useState(null); // { side: "left" | "right", y }
  const [drag, setDrag] = useState(null); // live { x, y } while dragging
  const g = useRef(null);
  // A mouse drag can end with a click; that one mustn't toggle the drawer.
  // (Touch drags don't produce one, so this only covers a brief moment.)
  const suppressUntil = useRef(0);

  useEffect(() => {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(POS_KEY) || "null");
    } catch {}
    setPos(saved && saved.side ? { side: saved.side, y: clampY(saved.y) } : { side: "right", y: clampY(window.innerHeight * 0.52) });
    const onResize = () => setPos((p) => (p ? { ...p, y: clampY(p.y) } : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!pos) return null;

  const restX = pos.side === "left" ? MARGIN : window.innerWidth - SIZE - MARGIN;

  const onDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    g.current = { sx: e.clientX, sy: e.clientY, ox: restX, oy: pos.y, moved: false };
  };

  const onMove = (e) => {
    const s = g.current;
    if (!s) return;
    const dx = e.clientX - s.sx;
    const dy = e.clientY - s.sy;
    if (!s.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
    s.moved = true;
    setDrag({ x: s.ox + dx, y: s.oy + dy });
  };

  const onUp = (e) => {
    const s = g.current;
    g.current = null;
    if (!s) return;
    // Taps open the drawer from onClick (below). Opening here instead would
    // let this tap's click land on the drawer's backdrop and shut it again.
    if (!s.moved) return;
    suppressUntil.current = performance.now() + 350;
    // Snap to whichever side is nearer.
    const x = s.ox + (e.clientX - s.sx);
    const next = { side: x + SIZE / 2 < window.innerWidth / 2 ? "left" : "right", y: clampY(s.oy + (e.clientY - s.sy)) };
    setDrag(null);
    setPos(next);
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(next));
    } catch {}
  };

  const x = drag ? drag.x : restX;
  const y = drag ? drag.y : pos.y;

  return (
    <button
      type="button"
      className={`laptop-bubble${drag ? " dragging" : ""}${active ? " active" : ""}`}
      aria-label={active ? "Close laptop control" : "Laptop control"}
      aria-expanded={active}
      style={{ transform: `translate3d(${x}px, ${y}px, 0)` }}
      onClick={() => {
        if (performance.now() < suppressUntil.current) return;
        buzz();
        onTap();
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => {
        g.current = null;
        setDrag(null);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <FontAwesomeIcon icon={faLaptop} />
    </button>
  );
}
