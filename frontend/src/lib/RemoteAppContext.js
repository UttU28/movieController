"use client";

import { createContext, useContext } from "react";

// The page owns one useRemote(app) and shares it here, so the header preview,
// the simple remote and the bubble's extra buttons all read the same snapshot
// and queue commands in the same order.
const RemoteAppContext = createContext(null);

export function RemoteAppProvider({ value, children }) {
  return <RemoteAppContext.Provider value={value}>{children}</RemoteAppContext.Provider>;
}

export function useAppRemote() {
  const value = useContext(RemoteAppContext);
  if (!value) throw new Error("useAppRemote must be used inside RemoteAppProvider");
  return value;
}
