/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep API responses fresh enough but allow CDN caching for static assets.
  experimental: {
    serverActions: { allowedOrigins: ["*"] },
  },
};

module.exports = nextConfig;
