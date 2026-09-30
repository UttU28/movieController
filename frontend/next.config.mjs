/** @type {import('next').NextConfig} */
const nextConfig = {
  // Phone on the same Wi-Fi loads the dev server at this LAN address.
  allowedDevOrigins: ["10.0.0.11"],
};

export default nextConfig;
