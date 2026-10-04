"use client";

import { SECTIONS } from "../lib/appMeta";
import StreamingPanel from "./StreamingPanel";

const PAGE_LABELS = {
  home: "Home",
  browse: "Browse",
  detail: "Title",
  search: "Search results",
  mystuff: "My Stuff",
  player: "Watching",
};

export default function PrimePanel() {
  return <StreamingPanel app="prime" appName="Prime Video" audioLabel="Prime" pageLabels={PAGE_LABELS} sections={SECTIONS.prime} />;
}
