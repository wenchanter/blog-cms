import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/**
 * Baseline hardening headers.
 *
 * These used to live in `proxy.ts`. Next.js 16 runs Proxy on the Node.js
 * runtime and refuses a `runtime` override, while `@opennextjs/cloudflare`
 * only supports edge middleware — so a Proxy file cannot be deployed to
 * Workers at all. Serving the headers from the config reaches every route
 * without needing a request-time hook.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const productionHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...securityHeaders,
          ...(process.env.NODE_ENV === "production" ? productionHeaders : []),
        ],
      },
    ];
  },
};

export default nextConfig;

initOpenNextCloudflareForDev();
