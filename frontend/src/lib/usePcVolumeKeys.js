"use client";

import { useEffect, useRef } from "react";
import { sendAction } from "./api";
import { isDev } from "./devMode";

const UP = new Set(["AudioVolumeUp", "VolumeUp", "MediaVolumeUp"]);
const DOWN = new Set(["AudioVolumeDown", "VolumeDown", "MediaVolumeDown"]);

function isVolumeUp(e) {
  return UP.has(e.key) || e.code === "VolumeUp" || e.code === "AudioVolumeUp" || e.keyCode === 175;
}

function isVolumeDown(e) {
  return DOWN.has(e.key) || e.code === "VolumeDown" || e.code === "AudioVolumeDown" || e.keyCode === 174;
}

// Phone volume rocker → laptop volume (same commands as the dock PC − / PC +).
// Android Chrome only delivers those keys if the page looks like it's playing
// media; a silent oscillator after the first tap makes that true. iOS Safari
// never exposes the rocker to the page.
export default function usePcVolumeKeys() {
  const last = useRef(0);

  useEffect(() => {
    const bump = (dir) => {
      const now = Date.now();
      if (now - last.current < 90) return;
      if (isDev()) return; // developer mode: the rocker stays local
      last.current = now;
      sendAction("laptop", dir === "up" ? "volumeUp" : "volumeDown").catch(() => {});
    };

    const onKey = (e) => {
      if (e.target.closest?.("input, textarea, [contenteditable]")) return;
      if (isVolumeUp(e)) {
        e.preventDefault();
        bump("up");
      } else if (isVolumeDown(e)) {
        e.preventDefault();
        bump("down");
      }
    };

    window.addEventListener("keydown", onKey, { capture: true });

    const ms = navigator.mediaSession;
    if (ms) {
      try {
        ms.setActionHandler("volumeup", () => bump("up"));
      } catch {}
      try {
        ms.setActionHandler("volumedown", () => bump("down"));
      } catch {}
    }

    let ctx = null;
    let osc = null;
    const armAudio = () => {
      if (ctx) {
        ctx.resume().catch(() => {});
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      const gain = ctx.createGain();
      gain.gain.value = 0.00008;
      osc = ctx.createOscillator();
      osc.frequency.value = 20;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      if (ms) {
        ms.playbackState = "playing";
        try {
          ms.metadata = new MediaMetadata({ title: "PC Remote", artist: "Volume" });
        } catch {}
      }
    };

    window.addEventListener("pointerdown", armAudio);
    const onVis = () => {
      if (!ctx) return;
      if (document.visibilityState === "visible") ctx.resume().catch(() => {});
      else ctx.suspend().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("pointerdown", armAudio);
      document.removeEventListener("visibilitychange", onVis);
      try {
        ms?.setActionHandler("volumeup", null);
      } catch {}
      try {
        ms?.setActionHandler("volumedown", null);
      } catch {}
      try {
        osc?.stop();
      } catch {}
      ctx?.close().catch(() => {});
    };
  }, []);
}
