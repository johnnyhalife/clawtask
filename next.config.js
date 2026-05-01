/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'ws', 'bufferutil', 'utf-8-validate'],
  },
};

module.exports = nextConfig;
