"use client";

import { SECTIONS } from "../lib/appMeta";
import StreamingPanel from "./StreamingPanel";

const PAGE_LABELS = {
  profiles: "Who's watching?",
  home: "Home",
  browse: "Browse",
  detail: "Title",
  search: "Search results",
  mylist: "My List",
  player: "Watching",
};

export default function NetflixPanel() {
  return <StreamingPanel app="netflix" appName="Netflix" audioLabel="NF" pageLabels={PAGE_LABELS} sections={SECTIONS.netflix} />;
}
