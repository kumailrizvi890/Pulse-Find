// Pure rate-limit math shared by the Next.js auth-attempt route.
// The Deno edge functions cannot import this file, so they duplicate
// the tiny key/limit constants inline and call the same Postgres
// check_rate_limit() function (see supabase/migrations/
// 20261125000000_weeks1_3_backend.sql), which owns the counter itself.

// Fixed windows, in seconds.
export const MCP_TOKEN_WINDOW_SECONDS = 60;
export const MCP_TOKEN_LIMIT = 60;
export const MCP_IP_WINDOW_SECONDS = 60;
export const MCP_IP_LIMIT = 300;
export const AUTH_ATTEMPT_WINDOW_SECONDS = 10 * 60;
export const AUTH_ATTEMPT_LIMIT = 10;

/** Start (ms since epoch) of the fixed window containing `nowMs`. */
export function windowStartMs(nowMs: number, windowSeconds: number): number {
  return Math.floor(nowMs / (windowSeconds * 1000)) * windowSeconds * 1000;
}

/** Seconds until the window containing `nowMs` ends (at least 1). */
export function retryAfterSeconds(nowMs: number, windowSeconds: number): number {
  const endsAt = windowStartMs(nowMs, windowSeconds) + windowSeconds * 1000;
  return Math.max(1, Math.ceil((endsAt - nowMs) / 1000));
}

/** Counter key for one fixed window, e.g. "mcp:token:<id>". */
export function rateLimitKey(prefix: string, id: string, nowMs: number, windowSeconds: number): string {
  return `${prefix}:${id}:${windowStartMs(nowMs, windowSeconds)}`;
}

/**
 * Pure verdict for a counter value: allowed while the count is at or
 * under the limit, otherwise the seconds until the window rolls over.
 */
export function checkCount(
  count: number,
  limit: number,
  nowMs: number,
  windowSeconds: number,
): { allowed: boolean; retryAfterSeconds: number } {
  if (count <= limit) return { allowed: true, retryAfterSeconds: 0 };
  return { allowed: false, retryAfterSeconds: retryAfterSeconds(nowMs, windowSeconds) };
}
