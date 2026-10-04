"use client";

import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPowerOff, faUpRightAndDownLeftFromCenter } from "@fortawesome/free-solid-svg-icons";
import AppSwitcher from "./AppSwitcher";
import LaptopPanel from "../panels/LaptopPanel";
import RemoteExtras from "./RemoteExtras";
import { buzz } from "./RemoteButton";

const CLOSE_DISTANCE = 110; // px pulled down that closes it
const CLOSE_SPEED = 0.6; // px/ms: a quick flick closes it too
const ANIM_MS = 260;

// The hub: a sheet that slides up from the bottom with the app tabs on top.
// Full remote: the laptop drawer controls below them. Simple remote: the
// media buttons the main screen doesn't show, plus quick keys/shortcuts
// (its trackpad is on the main screen). Drag the top bar down to dismiss;
// "More" opens the full laptop page in both styles.
export default function LaptopDrawer({ app, style, onChoose, onPowerOff, onClose, onMore, closeSignal = 0 }) {
  const simple = style === "simple";
  const [shown, setShown] = useState(false);
  const [pull, setPull] = useState(0);
  const drag = useRef(null);
  const openedAt = useRef(0);

  // Slide in on the next frame so the transition runs.
  useEffect(() => {
    openedAt.current = performance.now();
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const close = () => {
    setPull(0);
    setShown(false);
    setTimeout(onClose, ANIM_MS);
  };

  // The bubble (still showing above the drawer) closes it with the same slide.
  const firstSignal = useRef(closeSignal);
  useEffect(() => {
    if (closeSignal !== firstSignal.current) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeSignal]);

  const onDown = (e) => {
    if (e.target.closest("button")) return; // let "More" be a normal tap
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, t: performance.now() };
  };
  const onMove = (e) => {
    if (!drag.current) return;
    setPull(Math.max(0, e.clientY - drag.current.y));
  };
  const onUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const dy = Math.max(0, e.clientY - d.y);
    const speed = dy / Math.max(1, performance.now() - d.t);
    if (dy > CLOSE_DISTANCE || (dy > 30 && speed > CLOSE_SPEED)) {
      buzz();
      close();
    } else {
      setPull(0);
    }
  };

  const dragging = drag.current !== null && pull > 0;

  return (
    <div className={`drawer-layer${shown ? " shown" : ""}`}>
      <button
        type="button"
        className="drawer-backdrop"
        aria-label="Close laptop control"
        onClick={() => {
          // Ignore the tail end of the tap that opened the drawer.
          if (performance.now() - openedAt.current > 400) close();
        }}
      />
      <section
        className={`drawer${dragging ? " dragging" : ""}`}
        role="dialog"
        aria-label="Laptop control"
        style={shown ? { transform: `translateY(${pull}px)` } : undefined}
      >
        <header
          className="drawer-head"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => {
            drag.current = null;
            setPull(0);
          }}
        >
          <span className="grip" aria-hidden="true" />
          <div className="drawer-title">
            <span>{simple ? "Remote" : "Laptop"}</span>
          </div>
          <button
            type="button"
            className="pill-btn"
            onClick={() => {
              buzz();
              onMore();
            }}
          >
            More <FontAwesomeIcon icon={faUpRightAndDownLeftFromCenter} />
          </button>
        </header>
        <div className="drawer-body">
          <div className="hub-switcher">
            <AppSwitcher
              app={app}
              onChange={(next) => {
                onChoose(next);
                close();
              }}
            />
            <button
              type="button"
              className="hub-power"
              aria-label="Turn the remote off"
              onClick={() => {
                buzz();
                onPowerOff();
              }}
            >
              <FontAwesomeIcon icon={faPowerOff} />
            </button>
          </div>
          {simple ? <RemoteExtras app={app} /> : <LaptopPanel variant="drawer" />}
        </div>
      </section>
    </div>
  );
}
