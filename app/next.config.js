/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep API responses fresh enough but allow CDN caching for static assets.
  experimental: {
    serverActions: { allowedOrigins: ["*"] },
  },
  // /review was renamed to /outreach-review — keep old links/bookmarks/cached
  // nav working instead of 404ing.
  async redirects() {
    return [{ source: "/review", destination: "/outreach-review", permanent: true }];
  },
};

module.exports = nextConfig;
