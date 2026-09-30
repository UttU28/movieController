"use client";

import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass, faXmark } from "@fortawesome/free-solid-svg-icons";
import { MarqueeTitle } from "./NowShowing";
import { buzz } from "./RemoteButton";

// The strip at the top of a media page: what's selected / playing, and a
// search button. Search opens right in the strip, in place of the title.
// While something plays, `progress` (0-100) runs along its bottom edge and
// `time` sits next to the status.
export default function TitleBar({ eyebrow, title, sub, time, progress, placeholder = "Search", onSearch, children }) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const input = useRef(null);

  useEffect(() => {
    if (searching) input.current?.focus();
  }, [searching]);

  const close = () => {
    setSearching(false);
    setQuery("");
  };

  const submit = (e) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    buzz();
    onSearch(q);
    close();
  };

  return (
    <section className="card titlebar">
      <div className="titlebar-row">
        {searching ? (
          <form className="titlebar-search" onSubmit={submit}>
            <input
              ref={input}
              type="search"
              enterKeyHint="search"
              placeholder={placeholder}
              aria-label={placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
        ) : (
          <div className="titlebar-text">
            <div className="titlebar-top">
              <span className="eyebrow">{eyebrow}</span>
              {time && <span className="titlebar-time">{time}</span>}
            </div>
            <MarqueeTitle text={title} />
            {sub && <div className="selected-sub">{sub}</div>}
          </div>
        )}
        <button
          type="button"
          className="titlebar-btn"
          aria-label={searching ? "Close search" : "Search"}
          onClick={() => {
            buzz();
            if (searching) close();
            else setSearching(true);
          }}
        >
          <FontAwesomeIcon icon={searching ? faXmark : faMagnifyingGlass} />
        </button>
      </div>
      {children}
      {progress != null && (
        <span className="titlebar-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </span>
      )}
    </section>
  );
}
