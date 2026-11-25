import { describe, expect, it } from "vitest";

import {
  AUTH_ATTEMPT_LIMIT,
  AUTH_ATTEMPT_WINDOW_SECONDS,
  MCP_IP_LIMIT,
  MCP_TOKEN_LIMIT,
  checkCount,
  rateLimitKey,
  retryAfterSeconds,
  windowStartMs,
} from "../rate-limit";

describe("rate-limit window math", () => {
  it("aligns windows to the clock, not to the first request", () => {
    // 10:00:30 in a 60s window starts at 10:00:00.
    const now = Date.UTC(2026, 10, 25, 10, 0, 30);
    expect(windowStartMs(now, 60)).toBe(Date.UTC(2026, 10, 25, 10, 0, 0));
    // A 10-minute window starting 10:00 holds 10:09:59 too.
    expect(windowStartMs(Date.UTC(2026, 10, 25, 10, 9, 59), 600)).toBe(Date.UTC(2026, 10, 25, 10, 0, 0));
    expect(windowStartMs(Date.UTC(2026, 10, 25, 10, 10, 0), 600)).toBe(Date.UTC(2026, 10, 25, 10, 10, 0));
  });

  it("reports the seconds left until the window rolls over", () => {
    const now = Date.UTC(2026, 10, 25, 10, 0, 30);
    expect(retryAfterSeconds(now, 60)).toBe(30);
    expect(retryAfterSeconds(Date.UTC(2026, 10, 25, 10, 9, 59), 600)).toBe(1);
    expect(retryAfterSeconds(Date.UTC(2026, 10, 25, 10, 10, 0), 600)).toBe(600);
  });

  it("keys are stable inside a window and change when it rolls over", () => {
    const a = rateLimitKey("mcp:token", "abc", Date.UTC(2026, 10, 25, 10, 0, 10), 60);
    const b = rateLimitKey("mcp:token", "abc", Date.UTC(2026, 10, 25, 10, 0, 50), 60);
    const c = rateLimitKey("mcp:token", "abc", Date.UTC(2026, 10, 25, 10, 1, 5), 60);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toContain("mcp:token:abc:");
  });

  it("allows counts at the limit and blocks above it", () => {
    const now = Date.UTC(2026, 10, 25, 10, 0, 30);
    expect(checkCount(MCP_TOKEN_LIMIT, MCP_TOKEN_LIMIT, now, 60)).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(checkCount(MCP_TOKEN_LIMIT + 1, MCP_TOKEN_LIMIT, now, 60)).toEqual({ allowed: false, retryAfterSeconds: 30 });
    expect(checkCount(MCP_IP_LIMIT + 1, MCP_IP_LIMIT, now, 60).allowed).toBe(false);
    expect(checkCount(AUTH_ATTEMPT_LIMIT, AUTH_ATTEMPT_LIMIT, now, AUTH_ATTEMPT_WINDOW_SECONDS).allowed).toBe(true);
    expect(checkCount(AUTH_ATTEMPT_LIMIT + 1, AUTH_ATTEMPT_LIMIT, now, AUTH_ATTEMPT_WINDOW_SECONDS)).toEqual({
      allowed: false,
      retryAfterSeconds: 570,
    });
  });

  it("keeps the documented limits", () => {
    expect(MCP_TOKEN_LIMIT).toBe(60);
    expect(MCP_IP_LIMIT).toBe(300);
    expect(AUTH_ATTEMPT_LIMIT).toBe(10);
    expect(AUTH_ATTEMPT_WINDOW_SECONDS).toBe(600);
  });
});
