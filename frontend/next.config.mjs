import os from "node:os";

// Allow the phone (any LAN address of this machine) to use the dev server.
const lanAddresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i.address);

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: lanAddresses,
};

export default nextConfig;
