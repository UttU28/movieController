"use client";

import { useEffect } from "react";

// Desktop testing: drive a web-app remote from the keyboard too.
export default function useKeyboardRemote(action, keys) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.ctrlKey || e.metaKey || e.altKey) return;
      const name = keys[e.key];
      if (!name) return;
      e.preventDefault();
      action(name, { droppable: e.repeat });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [action, keys]);
}
