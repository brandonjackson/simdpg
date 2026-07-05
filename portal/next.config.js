/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@simdpg/api-clients"],
  // better-sqlite3 is a native module; keep it out of the server bundle so Next
  // loads it from node_modules at runtime instead of trying to trace/bundle it.
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
};

module.exports = nextConfig;
