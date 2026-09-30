"use client";

import { useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronLeft, faChevronRight, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import { buzz } from "./RemoteButton";

const HOLD_DELAY_MS = 400;
const REPEAT_MS = 180;

const ARROWS = [
  { dir: "up", icon: faChevronUp },
  { dir: "right", icon: faChevronRight },
  { dir: "down", icon: faChevronDown },
  { dir: "left", icon: faChevronLeft },
];

// Circular D-pad. Holding an arrow repeats it, like a TV remote.
export default function DPad({ onMove, onSelect, okLabel = "OK" }) {
  const timers = useRef({ delay: null, repeat: null });

  const stop = () => {
    clearTimeout(timers.current.delay);
    clearInterval(timers.current.repeat);
  };

  useEffect(() => stop, []);

  const start = (dir) => (e) => {
    e.preventDefault();
    stop();
    buzz();
    onMove(dir);
    timers.current.delay = setTimeout(() => {
      timers.current.repeat = setInterval(() => onMove(dir, { droppable: true }), REPEAT_MS);
    }, HOLD_DELAY_MS);
  };

  return (
    <div className="dpad">
      {ARROWS.map(({ dir, icon }) => (
        <button
          key={dir}
          type="button"
          aria-label={dir}
          className={`dpad-arrow dpad-${dir}`}
          onPointerDown={start(dir)}
          onPointerUp={stop}
          onPointerLeave={stop}
          onPointerCancel={stop}
          onContextMenu={(e) => e.preventDefault()}
        >
          <FontAwesomeIcon icon={icon} />
        </button>
      ))}
      <button
        type="button"
        className="dpad-ok"
        onClick={() => {
          buzz();
          onSelect();
        }}
      >
        {okLabel}
      </button>
    </div>
  );
}
