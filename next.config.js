/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: { root: __dirname },
  output: 'standalone',
  reactStrictMode: true,
  serverExternalPackages: ['better-sqlite3', 'ws', 'bufferutil', 'utf-8-validate'],
};

module.exports = nextConfig;
