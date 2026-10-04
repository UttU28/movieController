"use client";

// Which remote layout the phone shows: the button-rich "full" one or the
// minimal "simple" one (now playing + next, joystick, trackpad strip).
// Chosen on the power screen and saved on the phone, like dev mode.
const KEY = "remote.style";

const listeners = new Set();
let style = "full";

if (typeof window !== "undefined") {
  try {
    if (localStorage.getItem(KEY) === "simple") style = "simple";
  } catch {}
}

export function getStyle() {
  return style;
}

export function setStyle(next) {
  style = next === "simple" ? "simple" : "full";
  try {
    if (style === "simple") localStorage.setItem(KEY, "simple");
    else localStorage.setItem(KEY, "full");
  } catch {}
  listeners.forEach((fn) => fn(style));
}

// Subscribe to switches; returns an unsubscribe.
export function watchStyle(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
