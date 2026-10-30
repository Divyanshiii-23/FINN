import type { NextConfig } from "next";

// Caching is explicit and per-source (lib/sources/http.ts: fetch revalidate + in-process TTL), so the
// classic model is used rather than Cache Components — every page here is request-time by design.
const nextConfig: NextConfig = {
  cacheComponents: false,
  serverExternalPackages: ["unpdf"],
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
