"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAmazon, faYoutube } from "@fortawesome/free-brands-svg-icons";
import { faClapperboard, faN, faV } from "@fortawesome/free-solid-svg-icons";
import { buzz } from "./RemoteButton";

export const APPS = [
  { id: "youtube", label: "YouTube", icon: faYoutube },
  { id: "prime", label: "Prime", icon: faAmazon },
  { id: "netflix", label: "Netflix", icon: faN },
  { id: "viki", label: "Viki", icon: faV },
  { id: "jellyfin", label: "Jellyfin", icon: faClapperboard },
];

// The highlight travels across the tabs in between, so a jump of two apps
// takes longer than a jump to the neighbour.
const STEP_MS = 150;
const BASE_MS = 170;
export const slideMs = (steps) => BASE_MS + STEP_MS * Math.max(1, Math.abs(steps));

export default function AppSwitcher({ app, onChange }) {
  const nav = useRef(null);
  const tabs = useRef(new Map());
  const [pill, setPill] = useState(null);
  // While the highlight is moving: where it came from, so the tabs it crosses
  // light up on the way past.
  const [from, setFrom] = useState(null);
  const index = APPS.findIndex((a) => a.id === app);

  const place = useCallback(() => {
    const el = tabs.current.get(app);
    const box = nav.current;
    if (!el || !box) return;
    setPill({ x: el.offsetLeft, w: el.offsetWidth, h: el.offsetHeight, y: el.offsetTop });
  }, [app]);

  useLayoutEffect(place, [place]);

  useEffect(() => {
    const box = nav.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(place);
    obs.observe(box);
    return () => obs.disconnect();
  }, [place]);

  // Clear the trail once the highlight has arrived.
  const fromIndex = from === null ? -1 : from;
  useEffect(() => {
    if (fromIndex < 0) return;
    const timer = setTimeout(() => setFrom(null), slideMs(index - fromIndex));
    return () => clearTimeout(timer);
  }, [fromIndex, index]);

  const crossing = (i) => {
    if (fromIndex < 0) return false;
    const [lo, hi] = fromIndex < index ? [fromIndex, index] : [index, fromIndex];
    return i > lo && i < hi;
  };

  const duration = slideMs(fromIndex < 0 ? 1 : index - fromIndex);

  return (
    <nav className="switcher" aria-label="Choose what to control" ref={nav}>
      {pill && (
        <span
          className="switch-pill"
          data-app={app}
          aria-hidden="true"
          style={{
            width: pill.w,
            height: pill.h,
            transform: `translate3d(${pill.x}px, ${pill.y}px, 0)`,
            transitionDuration: `${duration}ms`,
          }}
        />
      )}
      {APPS.map((a, i) => (
        <button
          key={a.id}
          ref={(el) => {
            if (el) tabs.current.set(a.id, el);
            else tabs.current.delete(a.id);
          }}
          type="button"
          className={`switch-tab${a.id === app ? " on" : ""}${i === fromIndex ? " leaving" : ""}${
            crossing(i) ? " crossing" : ""
          }`}
          data-app={a.id}
          aria-pressed={a.id === app}
          onClick={() => {
            if (a.id === app) return;
            buzz();
            setFrom(index);
            onChange(a.id);
          }}
        >
          <FontAwesomeIcon icon={a.icon} />
          <span>{a.label}</span>
        </button>
      ))}
    </nav>
  );
}
