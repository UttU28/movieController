"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export const buzz = () => {
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(12);
};

export default function RemoteButton({ icon, text, label, onPress, active = false, accent = false, disabled = false }) {
  return (
    <button
      type="button"
      className={`rbtn${active ? " active" : ""}${accent ? " accent" : ""}`}
      disabled={disabled}
      onClick={() => {
        buzz();
        onPress();
      }}
    >
      {icon ? <FontAwesomeIcon icon={icon} /> : <b className="rbtn-text">{text}</b>}
      {label && <span>{label}</span>}
    </button>
  );
}
