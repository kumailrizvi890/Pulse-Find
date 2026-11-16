import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOAD_TIMEOUT_MESSAGE, LOAD_TIMEOUT_MS, withLoadTimeout } from "../load-timeout";

// Dashboard load timeout (Nov 16, 2026).
//
// Seen live Nov 16 ~3:04am on Kumail's phone: the signed-in dashboard
// showed grey pulsing skeleton blocks for up to ~a minute on first load
// before the numbers came in; a reload resolved in under 15s, and /demo
// loads instantly. Dashboard.tsx had no load timeout, so a hung
// store.load() showed the skeleton forever instead of the error panel
// with "Try again". The fix races the load against a 15s timer and reuses
// the existing error panel — no new error UI.
//
// These tests run under fake timers so the 15s boundary is exact, and
// they pin the three behaviours that matter: a healthy load never trips
// the timeout, a hung load flips to the timeout error at 15s, and a load
// that settles late can never overwrite the timeout or leak an unhandled
// rejection.

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("LOAD_TIMEOUT_MS", () => {
  it("is 15 seconds", () => {
    expect(LOAD_TIMEOUT_MS).toBe(15_000);
  });

  it("carries a plain user-facing message, not a code or stack", () => {
    expect(LOAD_TIMEOUT_MESSAGE).toContain("taking longer than usual");
    expect(LOAD_TIMEOUT_MESSAGE).not.toContain("Error");
    expect(LOAD_TIMEOUT_MESSAGE).not.toContain("15");
  });
});

describe("withLoadTimeout — healthy loads never trip it", () => {
  it("resolves with the load's value when the load is fast", async () => {
    const p = withLoadTimeout(Promise.resolve("ok"));
    await expect(p).resolves.toBe("ok");
  });

  it("clears the timer once the load settles, so nothing fires later", async () => {
    const p = withLoadTimeout(Promise.resolve("ok"));
    await expect(p).resolves.toBe("ok");
    expect(vi.getTimerCount()).toBe(0);
    // Advancing far past the timeout must not flip the settled load.
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(p).resolves.toBe("ok");
  });

  it("resolves a load that finishes at 10s and clears its timer", async () => {
    const load = deferred<string>();
    const p = withLoadTimeout(load.promise);
    await vi.advanceTimersByTimeAsync(10_000);
    load.resolve("in time");
    await expect(p).resolves.toBe("in time");
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(p).resolves.toBe("in time");
  });

  it("keeps a fast load error instead of the timeout error", async () => {
    const p = withLoadTimeout(Promise.reject(new Error("boom")));
    await expect(p).rejects.toThrow("boom");
    await expect(p).rejects.not.toThrow(LOAD_TIMEOUT_MESSAGE);
  });
});

describe("withLoadTimeout — hung loads flip at 15s", () => {
  it("is still pending at 14,999ms and rejects with the timeout at 15,000ms", async () => {
    let outcome = "pending";
    const p = withLoadTimeout(new Promise<string>(() => {}));
    // Attach the outcome handler immediately, the way Dashboard attaches
    // .then/.catch to the race in the same expression: a rejected promise
    // with no handler yet would read as unhandled in the gap before the
    // test's assertions run.
    p.then(
      () => {
        outcome = "resolved";
      },
      (e: Error) => {
        outcome = e.message;
      },
    );
    await vi.advanceTimersByTimeAsync(14_999);
    expect(outcome).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    expect(outcome).toBe(LOAD_TIMEOUT_MESSAGE);
    await expect(p).rejects.toThrow(LOAD_TIMEOUT_MESSAGE);
  });

  it("respects a custom timeout", async () => {
    const p = withLoadTimeout(new Promise<string>(() => {}), 100);
    p.catch(() => {});
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).rejects.toThrow(LOAD_TIMEOUT_MESSAGE);
  });
});

describe("withLoadTimeout — a late settle can never overwrite the timeout", () => {
  it("ignores a load that resolves after the timeout fired", async () => {
    const load = deferred<string>();
    const p = withLoadTimeout(load.promise);
    p.catch(() => {});
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS);
    await expect(p).rejects.toThrow(LOAD_TIMEOUT_MESSAGE);
    load.resolve("too late");
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).rejects.toThrow(LOAD_TIMEOUT_MESSAGE);
  });

  it("swallows a late rejection after the timeout — no unhandled rejection", async () => {
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", listener);
    try {
      const load = deferred<string>();
      const p = withLoadTimeout(load.promise);
      p.catch(() => {});
      await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS);
      await expect(p).rejects.toThrow(LOAD_TIMEOUT_MESSAGE);
      load.reject(new Error("late boom"));
      await vi.advanceTimersByTimeAsync(1000);
      await expect(p).rejects.toThrow(LOAD_TIMEOUT_MESSAGE);
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", listener);
    }
  });
});

describe("Dashboard.tsx wires the load through the timeout", () => {
  const dashboard = readFileSync(
    join(__dirname, "..", "..", "components", "dashboard", "Dashboard.tsx"),
    "utf8",
  );

  it("imports the helper and the 15s constant", () => {
    expect(dashboard).toContain('import { LOAD_TIMEOUT_MS, withLoadTimeout } from "@/lib/load-timeout";');
  });

  it("races store.load() against the timeout in the load effect", () => {
    expect(dashboard).toContain("withLoadTimeout(store.load(), LOAD_TIMEOUT_MS)");
  });

  it("reuses the existing error panel — no new error UI", () => {
    expect(dashboard).toContain('Panel title="Your tracker didn\'t load"');
    expect(dashboard).toContain("Try again");
    // The timeout flows through the same .catch as any load error: exactly
    // one place flips the dashboard into the error state.
    expect(dashboard.split('setState("error")').length - 1).toBe(1);
  });

  it("keeps the unmount guard and the retry path that resets the timer", () => {
    expect(dashboard).toContain("let alive = true;");
    expect(dashboard).toContain("if (!alive) return;");
    expect(dashboard).toContain("setAttempt((n) => n + 1)");
  });
});
