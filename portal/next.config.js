/** @type {import('next').NextConfig} */
const nextConfig = {
  // @simdpg/system-kit is imported via its "./behavior" subpath only (config
  // types, presets, field registry) — the express-facing half never reaches a
  // bundle.
  transpilePackages: ["@simdpg/api-clients", "@simdpg/system-kit"],
  // better-sqlite3 is a native module; keep it out of the server bundle so Next
  // loads it from node_modules at runtime instead of trying to trace/bundle it.
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
};

module.exports = nextConfig;
