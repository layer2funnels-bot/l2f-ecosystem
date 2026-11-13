import type { NextConfig } from "next";

// Private internal tool: no indexing, no framing, and never leak share-link tokens in the Referer header.
const securityHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // one address for every app: live, Funnel Mapper is office.example.com/fmp (NEXT_PUBLIC_BASE_PATH=/fmp, wrangler.production.jsonc)
  ...(process.env.NEXT_PUBLIC_BASE_PATH ? { basePath: process.env.NEXT_PUBLIC_BASE_PATH } : {}),
  // Tidy Up's layout engine only runs in the browser; the server gets a stub (keeps the server bundle within Cloudflare's free limit)
  turbopack: { resolveAlias: { "elkjs/lib/elk.bundled.js": { browser: "elkjs/lib/elk.bundled.js", default: "./lib/elk-server-stub.ts" } } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
