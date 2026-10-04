"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pointerSocketUrl } from "./api";
import { isDev } from "./devMode";

// WebSocket to the backend's /ws/pointer for low-latency trackpad input.
// Reconnects on its own; messages sent while disconnected are dropped (a lost
// mouse nudge is better than a burst of stale ones on reconnect).
export default function usePointerSocket() {
  const [status, setStatus] = useState("connecting");
  const ws = useRef(null);

  useEffect(() => {
    let closed = false;
    let retry = null;
    let delay = 500;

    const connect = () => {
      if (isDev()) {
        setStatus("closed"); // developer mode: no socket to the backend
        return;
      }
      setStatus("connecting");
      const sock = new WebSocket(pointerSocketUrl());
      ws.current = sock;
      sock.onopen = () => {
        delay = 500;
        setStatus("open");
      };
      sock.onclose = () => {
        if (closed) return;
        setStatus("closed");
        retry = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 5000);
      };
      sock.onerror = () => sock.close();
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      ws.current?.close();
    };
  }, []);

  const send = useCallback((msg) => {
    const sock = ws.current;
    if (sock && sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify(msg));
  }, []);

  return { status, send };
}
