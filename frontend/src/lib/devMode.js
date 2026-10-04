"use client";

// Developer mode: an on-phone switch that lets you try the remote without the
// backend. While it's on nothing is sent anywhere — the power screen opens
// straight into the panels, tabs switch freely (no "backend says power on /
// lastApp" lock), and every button press is a local no-op. The switch is
// saved in localStorage so a page reload keeps it.
const KEY = "mc-dev-mode";

const listeners = new Set();
let dev = false;

if (typeof window !== "undefined") {
  try {
    dev = localStorage.getItem(KEY) === "1";
  } catch {}
}

export function isDev() {
  return dev;
}

export function setDev(on) {
  dev = !!on;
  try {
    if (dev) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {}
  listeners.forEach((fn) => fn(dev));
}

// Subscribe to switches; returns an unsubscribe.
export function watchDev(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
