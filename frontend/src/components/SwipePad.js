"use client";

import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronLeft, faChevronRight, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import { buzz } from "./RemoteButton";

const STEP_PX = 52; // swipe distance per move
const TAP_MS = 280;
const TAP_SLOP = 10;
const EDGE_PX = 56; // taps this close to an edge are arrow presses
const HOLD_MS = 420;
const REPEAT_MS = 170;

// Which edge band (if any) a point in the pad falls in.
function edgeAt(rect, x, y) {
  const left = x - rect.left;
  const top = y - rect.top;
  const right = rect.right - x;
  const bottom = rect.bottom - y;
  const nearest = Math.min(left, top, right, bottom);
  if (nearest > EDGE_PX) return null;
  if (nearest === top) return "up";
  if (nearest === bottom) return "down";
  return nearest === left ? "left" : "right";
}

// A TV-style touch surface: swipe to move (long swipes move several steps),
// tap the middle for OK, tap an edge for one step, hold an edge to repeat.
export default function SwipePad({ onMove, onSelect }) {
  const [flash, setFlash] = useState(null);
  const g = useRef(null);
  const timers = useRef({ hold: null, repeat: null, flash: null });

  useEffect(() => {
    const t = timers.current;
    return () => {
      clearTimeout(t.hold);
      clearInterval(t.repeat);
      clearTimeout(t.flash);
    };
  }, []);

  const show = (dir) => {
    setFlash(dir);
    clearTimeout(timers.current.flash);
    timers.current.flash = setTimeout(() => setFlash(null), 160);
  };

  const move = (dir, opts) => {
    buzz();
    show(dir);
    onMove(dir, opts);
  };

  const stopRepeat = () => {
    clearTimeout(timers.current.hold);
    clearInterval(timers.current.repeat);
  };

  const onDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const edge = edgeAt(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY);
    g.current = { x: e.clientX, y: e.clientY, ax: 0, ay: 0, travel: 0, start: performance.now(), edge, moved: false, held: false };
    stopRepeat();
    if (edge) {
      timers.current.hold = setTimeout(() => {
        if (!g.current || g.current.moved) return;
        g.current.held = true;
        move(edge);
        timers.current.repeat = setInterval(() => move(edge, { droppable: true }), REPEAT_MS);
      }, HOLD_MS);
    }
  };

  const onPointerMove = (e) => {
    const s = g.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    s.x = e.clientX;
    s.y = e.clientY;
    s.travel += Math.hypot(dx, dy);
    s.ax += dx;
    s.ay += dy;
    if (s.travel > TAP_SLOP && !s.moved) {
      s.moved = true;
      stopRepeat();
    }
    // One move per STEP_PX along the dominant axis.
    while (Math.max(Math.abs(s.ax), Math.abs(s.ay)) >= STEP_PX) {
      if (Math.abs(s.ax) >= Math.abs(s.ay)) {
        move(s.ax > 0 ? "right" : "left", { droppable: true });
        s.ax -= Math.sign(s.ax) * STEP_PX;
        s.ay = 0;
      } else {
        move(s.ay > 0 ? "down" : "up", { droppable: true });
        s.ay -= Math.sign(s.ay) * STEP_PX;
        s.ax = 0;
      }
    }
  };

  const onUp = () => {
    const s = g.current;
    g.current = null;
    stopRepeat();
    if (!s || s.held) return;
    const quick = performance.now() - s.start < TAP_MS * 2;
    if (!s.moved && quick) {
      if (s.edge) {
        move(s.edge);
      } else {
        buzz();
        show("ok");
        onSelect();
      }
    }
  };

  return (
    <section className="swipepad">
      <div
        className="swipepad-surface"
        role="application"
        aria-label="Swipe to move, tap to select"
        onPointerDown={onDown}
        onPointerMove={onPointerMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <FontAwesomeIcon icon={faChevronUp} className={`pad-arrow up${flash === "up" ? " lit" : ""}`} />
        <FontAwesomeIcon icon={faChevronDown} className={`pad-arrow down${flash === "down" ? " lit" : ""}`} />
        <FontAwesomeIcon icon={faChevronLeft} className={`pad-arrow left${flash === "left" ? " lit" : ""}`} />
        <FontAwesomeIcon icon={faChevronRight} className={`pad-arrow right${flash === "right" ? " lit" : ""}`} />
        <span className={`pad-ok${flash === "ok" ? " lit" : ""}`}>OK</span>
      </div>
    </section>
  );
}
