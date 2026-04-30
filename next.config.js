/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'ws', 'bufferutil', 'utf-8-validate'],
  },
};

module.exports = nextConfig;
