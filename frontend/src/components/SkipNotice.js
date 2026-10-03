"use client";

import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleExclamation, faForwardFast } from "@fortawesome/free-solid-svg-icons";

const SHOW_MS = 3500;
// When the panel opens, events older than this are treated as already seen;
// after that, every new event is announced, however late it arrives (the
// phone doesn't hear from the backend while a slow command runs).
const FRESH_SECONDS = 8;

const WHAT = { ad: "ad", intro: "intro", recap: "recap", credits: "credits" };

function message(e) {
  const what = WHAT[e.kind] ? `the ${WHAT[e.kind]}` : `"${e.label}"`;
  return e.ok ? `Skipped ${what}` : `Couldn't skip ${what}. Tap Skip.`;
}

// A short notice whenever the backend skipped something by itself (an ad,
// an intro...), or tried and couldn't. `skips` is state.skips from /state.
export default function SkipNotice({ skips }) {
  const seen = useRef(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (!skips) return;
    if (seen.current === null) {
      seen.current = new Set(skips.filter((e) => e.age >= FRESH_SECONDS).map((e) => e.id));
    }
    const fresh = skips.filter((e) => !seen.current.has(e.id));
    fresh.forEach((e) => seen.current.add(e.id));
    const latest = fresh.pop();
    if (latest) setNotice(latest);
  }, [skips]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), SHOW_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  if (!notice) return null;
  return (
    <div key={notice.id} className={`skip-notice${notice.ok ? "" : " failed"}`} role="status">
      <FontAwesomeIcon icon={notice.ok ? faForwardFast : faCircleExclamation} />
      {message(notice)}
    </div>
  );
}
