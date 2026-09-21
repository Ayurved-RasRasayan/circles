/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  experimental: {
    // Required for @cloudflare/next-on-pages
    runtime: 'edge',
  },
}

module.exports = nextConfig
