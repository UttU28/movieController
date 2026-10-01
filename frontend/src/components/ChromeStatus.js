"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRightToBracket } from "@fortawesome/free-solid-svg-icons";

// Whether a web app's remote can be used, and the card to show when it can't:
// backend down, Chrome closed, or Chrome showing another app's tab.
export function isReady(connected, state) {
  return connected && state?.browser === "running" && !["otherTab", "noTab"].includes(state?.pageType);
}

export default function ChromeStatus({ connected, state, appName, onShow }) {
  let message = "Chrome isn't running yet.";
  if (!connected) message = "Can't reach the backend. Is it running on port 9282?";
  else if (state?.pageType === "otherTab") message = `Chrome is showing another tab, not ${appName}.`;
  else if (state?.pageType === "noTab") message = `${appName} isn't open in Chrome.`;
  else if (state?.browser === "busy") message = `${appName} is busy. Hang on a moment.`;
  else if (state?.browser === "error") message = state?.error || "Lost the connection to Chrome.";

  return (
    <section className="card empty">
      <p>{message}</p>
      {connected && (
        <button type="button" className="launch" onClick={onShow}>
          <FontAwesomeIcon icon={faArrowRightToBracket} /> Show {appName} in Chrome
        </button>
      )}
    </section>
  );
}
