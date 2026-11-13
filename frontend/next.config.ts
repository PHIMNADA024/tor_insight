import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Headers for every response, pages and static files alike. The
 * Content-Security-Policy is set per request in src/proxy.ts, since it
 * carries a fresh nonce.
 */
const securityHeaders = [
  // Browsers ignore HSTS over plain http, so it only takes effect once served
  // over https. Left out in development so localhost isn't pinned to https.
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // For browsers without CSP frame-ancestors support.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
