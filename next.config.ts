import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      ...["/admin/:path*", "/portal/:path*", "/students/:path*", "/attendance/:path*", "/meals/:path*", "/finance/:path*", "/payments/:path*"].map((source) => ({
        source,
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" }],
      })),
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
