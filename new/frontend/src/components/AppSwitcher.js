"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAmazon, faYoutube } from "@fortawesome/free-brands-svg-icons";
import { faLaptop, faN } from "@fortawesome/free-solid-svg-icons";
import { buzz } from "./RemoteButton";

export const APPS = [
  { id: "laptop", label: "Laptop", icon: faLaptop },
  { id: "youtube", label: "YouTube", icon: faYoutube },
  { id: "prime", label: "Prime", icon: faAmazon },
  { id: "netflix", label: "Netflix", icon: faN },
];

export default function AppSwitcher({ app, onChange }) {
  return (
    <nav className="switcher" aria-label="Choose what to control">
      {APPS.map((a) => (
        <button
          key={a.id}
          type="button"
          className={`switch-tab${a.id === app ? " on" : ""}`}
          data-app={a.id}
          aria-pressed={a.id === app}
          onClick={() => {
            if (a.id === app) return;
            buzz();
            onChange(a.id);
          }}
        >
          <FontAwesomeIcon icon={a.icon} />
          <span>{a.label}</span>
        </button>
      ))}
    </nav>
  );
}
