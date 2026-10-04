"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChrome } from "@fortawesome/free-brands-svg-icons";
import {
  faArrowRightToBracket,
  faFlask,
  faHourglassHalf,
  faPlug,
  faTriangleExclamation,
  faWindowRestore,
} from "@fortawesome/free-solid-svg-icons";
import { isDev } from "../lib/devMode";

// Whether a web app's remote can be used, and the card to show when it can't:
// backend down, Chrome closed, or Chrome showing another app's tab.
export function isReady(connected, state) {
  return connected && state?.browser === "running" && !["otherTab", "noTab"].includes(state?.pageType);
}

// Icon, headline and one line of detail for whatever is in the way.
function describe(connected, state, appName) {
  if (!connected) return { icon: faPlug, tone: "bad", title: "Backend offline", text: "Can't reach it on port 9282. Is it running?" };
  if (state?.pageType === "otherTab") return { icon: faWindowRestore, title: "Another tab is showing", text: `Chrome isn't on ${appName} right now.` };
  if (state?.pageType === "noTab") return { icon: faWindowRestore, title: `${appName} isn't open`, text: "Open it in Chrome to start." };
  if (state?.browser === "busy") return { icon: faHourglassHalf, title: `${appName} is busy`, text: "Hang on a moment." };
  if (state?.browser === "error") return { icon: faTriangleExclamation, tone: "bad", title: "Lost Chrome", text: state?.error || "The connection to Chrome dropped." };
  return { icon: faChrome, title: "Chrome isn't running", text: `Start it to control ${appName}.` };
}

export default function ChromeStatus({ connected, state, appName, onShow }) {
  const dev = isDev();
  const info = dev
    ? { icon: faFlask, tone: "dev", title: "Developer mode", text: `Previewing ${appName}. Buttons buzz, nothing is sent.` }
    : describe(connected, state, appName);

  return (
    <section className={`card status-card${info.tone ? ` ${info.tone}` : ""}`}>
      <div className="status-row">
        <span className="status-icon">
          <FontAwesomeIcon icon={info.icon} />
        </span>
        <div className="status-text">
          <strong>{info.title}</strong>
          <span>{info.text}</span>
        </div>
      </div>
      {!dev && connected && (
        <button type="button" className="launch" onClick={onShow}>
          <FontAwesomeIcon icon={faArrowRightToBracket} /> Show {appName} in Chrome
        </button>
      )}
    </section>
  );
}
