/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_DEVICE_IP: process.env.NEXT_PUBLIC_DEVICE_IP || 'localhost',
  },
};

export default nextConfig;
