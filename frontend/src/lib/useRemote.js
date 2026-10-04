"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, getState, sendAction, sendSearch, showApp } from "./api";
import { isDev } from "./devMode";

const POLL_MS = 1000;
const MAX_PENDING = 3;

// Remote state + an ordered command queue for one app. Every response carries
// a fresh snapshot of the app's page; a sequence number makes sure a slow poll
// can never overwrite a newer snapshot from a command. `poll: false` (laptop)
// skips the status polling and just runs commands.
export default function useRemote(app, { poll = true } = {}) {
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(!poll);
  const [error, setError] = useState("");
  const seq = useRef(0);
  const applied = useRef(0);
  const queue = useRef(Promise.resolve());
  const pending = useRef(0);
  // Bumped when a command fails: presses queued behind it are dropped rather
  // than all firing at once when the page recovers.
  const generation = useRef(0);

  const apply = useCallback((id, snapshot) => {
    if (id < applied.current || !snapshot) return;
    applied.current = id;
    setState(snapshot);
  }, []);

  const refresh = useCallback(async () => {
    if (!app) return; // no app picked yet
    if (isDev()) return; // developer mode: no backend traffic
    const id = ++seq.current;
    try {
      apply(id, await getState(app));
      setConnected(true);
    } catch (err) {
      setConnected(false);
    }
  }, [app, apply]);

  useEffect(() => {
    if (!poll || !app) return undefined;
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && pending.current === 0) refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [poll, refresh]);

  // Commands run strictly in order. `droppable` ones (held D-pad repeats) are
  // skipped when the queue is backed up so the focus doesn't run away.
  const run = useCallback(
    (fn, { droppable = false } = {}) => {
      if (droppable && pending.current >= MAX_PENDING) return Promise.resolve();
      if (isDev()) return Promise.resolve(); // developer mode: presses are local no-ops
      pending.current += 1;
      const gen = generation.current;
      const job = queue.current.then(async () => {
        if (gen !== generation.current) {
          pending.current -= 1;
          return;
        }
        const id = ++seq.current;
        try {
          const res = await fn();
          apply(id, res.state);
          setConnected(true);
          setError("");
        } catch (err) {
          generation.current += 1;
          setError(errorMessage(err));
        } finally {
          pending.current -= 1;
        }
      });
      queue.current = job;
      return job;
    },
    [apply]
  );

  const action = useCallback(
    (name, opts = {}) => run(() => sendAction(app, name, opts.value), opts),
    [app, run]
  );
  const search = useCallback((q) => run(() => sendSearch(app, q)), [app, run]);
  const show = useCallback(() => run(() => showApp(app)), [app, run]);

  return { state, connected, error, action, search, show };
}
