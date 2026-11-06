import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Agents connect to one stable URL on this site; it forwards to the Supabase edge function.
  async rewrites() {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return base ? [{ source: "/api/mcp", destination: `${base.replace(/\/$/, "")}/functions/v1/mcp` }] : [];
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
