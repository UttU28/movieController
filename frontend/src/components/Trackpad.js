"use client";

import { useEffect, useRef } from "react";

const TAP_MS = 250;
const TAP_SLOP = 8;
const SCROLL_GAIN = 4;

// Touch trackpad. Movement is summed and flushed once per animation frame, so
// the backend gets at most ~60 small moves a second however fast touch events
// arrive.
export default function Trackpad({ send, sensitivity }) {
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const pending = useRef({ dx: 0, dy: 0, scroll: 0 });
  const sens = useRef(sensitivity);
  sens.current = sensitivity;

  useEffect(() => {
    let frame;
    const flush = () => {
      const p = pending.current;
      if (p.dx || p.dy) {
        send({ t: "m", dx: Math.round(p.dx), dy: Math.round(p.dy) });
        p.dx -= Math.round(p.dx);
        p.dy -= Math.round(p.dy);
      }
      if (Math.abs(p.scroll) >= 1) {
        send({ t: "s", dy: Math.round(p.scroll) });
        p.scroll -= Math.round(p.scroll);
      }
      frame = requestAnimationFrame(flush);
    };
    frame = requestAnimationFrame(flush);
    return () => cancelAnimationFrame(frame);
  }, [send]);

  const onDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const now = performance.now();
    if (pointers.current.size === 1) {
      gesture.current = { fingers: 1, start: now, travel: 0 };
    } else if (gesture.current) {
      gesture.current.fingers = Math.max(gesture.current.fingers, pointers.current.size);
    }
  };

  const onMove = (e) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !gesture.current) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;
    gesture.current.travel += Math.hypot(dx, dy);

    if (pointers.current.size >= 2) {
      // Two fingers: scroll, content follows the fingers. Each finger reports
      // its own move, so halve to get the average.
      pending.current.scroll += (dy * SCROLL_GAIN) / pointers.current.size;
    } else if (gesture.current.fingers === 1) {
      // Light acceleration: slow swipes are precise, fast ones cover the screen.
      const speed = Math.hypot(dx, dy);
      const gain = sens.current * (1 + Math.min(speed / 12, 1.5));
      pending.current.dx += dx * gain;
      pending.current.dy += dy * gain;
    }
  };

  const onUp = (e) => {
    if (!pointers.current.delete(e.pointerId)) return;
    if (pointers.current.size > 0 || !gesture.current) return;
    const g = gesture.current;
    gesture.current = null;
    const quick = performance.now() - g.start < TAP_MS * (g.fingers > 1 ? 1.4 : 1);
    if (quick && g.travel < TAP_SLOP * g.fingers) {
      send({ t: "c", b: g.fingers > 1 ? "right" : "left" });
    }
  };

  return (
    <div
      className="trackpad"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="trackpad-hint">
        Drag to move · tap to click
        <br />2 fingers: scroll · 2-finger tap: right click
      </span>
    </div>
  );
}

export function ScrollStrip({ send }) {
  const last = useRef(null);

  return (
    <div
      className="scroll-strip"
      aria-label="Scroll"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        last.current = e.clientY;
      }}
      onPointerMove={(e) => {
        if (last.current === null) return;
        const dy = e.clientY - last.current;
        last.current = e.clientY;
        if (dy) send({ t: "s", dy: Math.round(dy * SCROLL_GAIN * 1.5) });
      }}
      onPointerUp={() => {
        last.current = null;
      }}
      onPointerCancel={() => {
        last.current = null;
      }}
    >
      <span>scroll</span>
    </div>
  );
}
