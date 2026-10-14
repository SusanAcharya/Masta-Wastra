import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // A stray lockfile in the home folder confuses root detection.
    root: __dirname,
  },
};

export default nextConfig;
