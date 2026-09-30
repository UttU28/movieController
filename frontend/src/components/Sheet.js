"use client";

import { buzz } from "./RemoteButton";

// A dropdown panel under the title bar (search results, a title's episodes,
// subtitle tracks...). It floats over the swipe pad; Hide or a tap anywhere
// outside closes it. Render it inside `.titlebar-wrap`.
export default function Sheet({ open, title, onClose, children }) {
  if (!open) return null;
  const close = () => {
    buzz();
    onClose();
  };
  return (
    <>
      <button type="button" className="sheet-backdrop" aria-label={`Hide ${title}`} onClick={close} />
      <div className="results-sheet" role="dialog" aria-label={title}>
        <div className="sheet-head">
          <span className="eyebrow">{title}</span>
          <button type="button" className="pill-btn" onClick={close}>
            Hide
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

// A small pill in the title bar that opens / closes a sheet.
export function SheetToggle({ open, onToggle, openLabel, closedLabel }) {
  return (
    <button
      type="button"
      className={`pill-btn${open ? " on" : ""}`}
      aria-expanded={open}
      onClick={() => {
        buzz();
        onToggle();
      }}
    >
      {open ? openLabel : closedLabel}
    </button>
  );
}
