"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

// Which look this phone wears: "classic" (flat tiles) or "neo" (neumorphism).
// Per-phone, kept in localStorage; the backend doesn't care how a phone looks.
// null means the phone hasn't chosen yet — the power screen asks.
const KEY = "remote-style";

let current; // undefined = un-read, null = no choice yet, else "classic" | "neo"
const subs = new Set();

function notify() {
  for (const fn of subs) fn();
}

function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

function apply(value) {
  try {
    document.body.dataset.style = value || "classic";
  } catch {}
}

function getSnapshot() {
  if (current === undefined) {
    let v = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw === "neo" || raw === "classic") v = raw;
    } catch {}
    current = v;
  }
  return current;
}

export function setRemoteStyle(value) {
  try {
    localStorage.setItem(KEY, value);
  } catch {}
  current = value;
  apply(value);
  notify();
}

// [style, setStyle]; style is null until the phone has chosen. The body
// attribute follows the value, so the whole page restyles live.
export function useRemoteStyle() {
  const value = useSyncExternalStore(subscribe, getSnapshot, () => null);
  useEffect(() => {
    apply(value);
  }, [value]);
  const set = useCallback((v) => setRemoteStyle(v), []);
  return [value, set];
}
