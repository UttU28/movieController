import os from "node:os";

// Allow the phone (any LAN address of this machine) to use the dev server.
const lanAddresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i.address);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The supervisor builds an update into a second folder while the running
  // server keeps serving from the first, then switches (see NEXT_DIST_DIR in
  // scripts/remote-supervisor.ps1).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  allowedDevOrigins: lanAddresses,
  // Hide the Next.js dev badge (the "N" in the corner).
  devIndicators: false,
};

export default nextConfig;
