import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

// Content-Security-Policy, alongside the headers above. Next.js needs
// script-src 'unsafe-inline' without nonces; the three.js hero runs
// workers from blob: URLs, and the app talks to Supabase over https and
// wss plus Vercel Analytics. When the Supabase URL is not set (the demo
// runs with no env vars), fall back to the Supabase wildcard origins.
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const supabaseOrigins = supabaseUrl
  ? `${supabaseUrl} ${supabaseUrl.replace(/^https:\/\//, "wss://")}`
  : `https://*.supabase.co wss://*.supabase.co`;
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigins} https://vitals.vercel-insights.com`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");
securityHeaders.push({ key: "Content-Security-Policy", value: contentSecurityPolicy });

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
