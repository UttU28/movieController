"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, sendAction } from "./api";

// Browsing the Jellyfin library from the phone. `view` is one of
//   { kind: "home" } | { kind: "folder", id, name } | { kind: "item", id, name } | { kind: "search", query }
// and the hook loads whatever that view needs. Views stack like pages.
export default function useJellyfinLibrary() {
  const [stack, setStack] = useState([{ kind: "home" }]);
  // Results are tagged with the view they belong to, so a new view never
  // renders with the previous view's data while it loads.
  const [loaded, setLoaded] = useState({ view: null, data: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const view = stack[stack.length - 1];

  const load = useCallback(async (v, start = 0) => {
    const id = ++request.current;
    setLoading(true);
    setError("");
    try {
      let res;
      if (v.kind === "home") res = await sendAction("jellyfin", "library");
      else if (v.kind === "folder") res = await sendAction("jellyfin", "browse", { id: v.id, start });
      else if (v.kind === "item") res = await sendAction("jellyfin", "item", v.id);
      else res = await sendAction("jellyfin", "search", v.query);
      if (id !== request.current) return;
      setLoaded((prev) => {
        // "Load more" appends to the current folder listing.
        if (v.kind === "folder" && start > 0 && prev.view === v && prev.data?.items) {
          return { view: v, data: { ...res.result, items: [...prev.data.items, ...res.result.items] } };
        }
        return { view: v, data: res.result };
      });
    } catch (err) {
      if (id === request.current) setError(errorMessage(err));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(view);
  }, [view, load]);

  const data = loaded.view === view ? loaded.data : null;

  const open = useCallback((v) => setStack((s) => [...s, v]), []);
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const reset = useCallback((v = { kind: "home" }) => setStack([v]), []);
  const more = useCallback(() => {
    if (view.kind === "folder" && data?.items) load(view, data.items.length);
  }, [view, data, load]);
  const reload = useCallback(() => load(view), [view, load]);

  return { view, depth: stack.length, data, loading, error, open, back, reset, more, reload };
}
