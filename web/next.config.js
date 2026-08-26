/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { dev }) => {
    if (dev) {
      // Low-memory dev machine: webpack's persistent filesystem cache gzips
      // its pack file on write/read, which throws ERR_MEMORY_ALLOCATION_FAILED
      // when free RAM is too low. In-memory cache avoids that gzip step.
      config.cache = { type: "memory" };
    }
    return config;
  },
};

module.exports = nextConfig;
