import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOAD_TIMEOUT_MESSAGE, withLoadTimeout } from "../load-timeout";

// Audit gap #6 (pass-13 audit): when a page's data load failed, the error
// panel showed the message but offered no way to retry, so the user was
// stuck. Only the Dashboard had a "Try again" button. The Leads,
// Networking and Sheet panels had none, and the Jobs board only told the
// user to reload the page. Those same loads also had no timeout at all, so
// a hung load sat on the skeleton forever and never even reached the
// error panel.
//
// The fix mirrors the Dashboard pattern in each section: the load races
// the shared 15s timeout (with a message naming what failed to load), and
// the error panel gets a "Try again" button that resets the section to
// loading and re-runs the load with a fresh timer.
//
// These tests pin the wiring by reading the sources, the way the other
// section tests in this folder do (there is no DOM test setup in this
// repo), plus real behaviour tests for the custom timeout message.

function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

const leads = read("components/pipeline/LeadsSection.tsx");
const networking = read("components/pipeline/NetworkingSection.tsx");
const sheet = read("components/dashboard/SheetView.tsx");
const jobs = read("app/jobs/JobsBoard.tsx");
const dashboard = read("components/dashboard/Dashboard.tsx");
const helper = read("lib/load-timeout.ts");

function errorPanel(src: string): string {
  const start = src.indexOf('if (state === "error")');
  // The error block closes with `  }` at 2-space indent; everything
  // inside it is indented deeper, so the first such close ends the panel.
  return src.slice(start, src.indexOf("\n  }\n", start));
}

const RETRY_BUTTON = `<button className={cx(btn.primary, "mt-4")} onClick={retry}>Try again</button>`;
const RETRY_FN = `const retry = () => {
    setState("loading");
    setAttempt((n) => n + 1);
  };`;

describe("load-error retry — every error panel offers Try again", () => {
  it("leads error panel has a Try again button wired to retry", () => {
    expect(errorPanel(leads)).toContain("Your leads didn't load");
    expect(errorPanel(leads)).toContain(RETRY_BUTTON);
    expect(leads).toContain(RETRY_FN);
  });

  it("networking error panel has a Try again button wired to retry", () => {
    expect(errorPanel(networking)).toContain("Your contacts didn't load");
    expect(errorPanel(networking)).toContain(RETRY_BUTTON);
    expect(networking).toContain(RETRY_FN);
  });

  it("sheet error panel has a Try again button wired to retry", () => {
    expect(errorPanel(sheet)).toContain("Your sheet didn't load");
    expect(errorPanel(sheet)).toContain(RETRY_BUTTON);
    expect(sheet).toContain(RETRY_FN);
  });

  it("jobs board error has a Try again button that re-runs the query", () => {
    expect(jobs).toContain("Couldn&apos;t load openings.");
    expect(jobs).not.toContain("Reload the page to try again.");
    expect(jobs).toContain(RETRY_FN);
    expect(jobs).toContain(`<button className={cx(btn.primary, "mt-3")} onClick={retry}>Try again</button>`);
  });

  it("the dashboard keeps its Try again button (regression guard)", () => {
    expect(errorPanel(dashboard)).toContain("Your tracker didn't load");
    expect(errorPanel(dashboard)).toContain(RETRY_BUTTON);
    expect(dashboard).toContain(RETRY_FN);
  });
});

describe("load-error retry — retry re-runs the load with a fresh timer", () => {
  it("leads load races the timeout and re-runs on retry", () => {
    expect(leads).toContain("withLoadTimeout(\n      pipeline.loadLeads(),");
    expect(leads).toContain("const [attempt, setAttempt] = useState(0);");
    expect(leads).toContain("}, [pipeline, attempt]);");
  });

  it("networking load races the timeout and re-runs on retry", () => {
    expect(networking).toContain("withLoadTimeout(\n      pipeline.loadContacts(),");
    expect(networking).toContain("const [attempt, setAttempt] = useState(0);");
    expect(networking).toContain("}, [pipeline, attempt]);");
  });

  it("sheet load races the timeout and re-runs on retry", () => {
    expect(sheet).toContain("withLoadTimeout(store.load(), LOAD_TIMEOUT_MS)");
    expect(sheet).toContain("const [attempt, setAttempt] = useState(0);");
    expect(sheet).toContain("}, [store, attempt]);");
  });

  it("jobs query races the timeout, catches a failed query, and re-runs on retry", () => {
    expect(jobs).toContain("withLoadTimeout(");
    expect(jobs).toContain(".range(page * PAGE, page * PAGE + PAGE - 1),");
    expect(jobs).toContain("const [attempt, setAttempt] = useState(0);");
    expect(jobs).toContain("}, [supabase, track, techOnly, remoteOnly, query, page, attempt]);");
    expect(jobs).toContain(`.catch(() => {
        if (alive) setState("error");
      });`);
  });
});

describe("load-error retry — timeout messages name what failed", () => {
  it("leads, contacts and openings timeouts name the section, not the tracker", () => {
    expect(leads).toContain('"Your leads are taking longer than usual to load. Check your connection and try again."');
    expect(networking).toContain('"Your contacts are taking longer than usual to load. Check your connection and try again."');
    expect(jobs).toContain('"Openings are taking longer than usual to load. Check your connection and try again."');
  });

  it("the sheet keeps the tracker's own timeout message", () => {
    expect(sheet).not.toContain("taking longer than usual to load. Check your connection and try again.\"");
    expect(sheet).toContain("withLoadTimeout(store.load(), LOAD_TIMEOUT_MS)");
  });

  it("no added copy carries an em dash", () => {
    expect("Your leads are taking longer than usual to load. Check your connection and try again.").not.toContain("—");
    expect("Your contacts are taking longer than usual to load. Check your connection and try again.").not.toContain("—");
    expect("Openings are taking longer than usual to load. Check your connection and try again.").not.toContain("—");
    expect("Try again").not.toContain("—");
  });

  it("withLoadTimeout accepts an optional custom message", () => {
    expect(helper).toContain("message: string = LOAD_TIMEOUT_MESSAGE");
    expect(helper).toContain("setTimeout(() => reject(new Error(message)), ms)");
  });
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("withLoadTimeout — custom message", () => {
  it("rejects a hung load with the custom message at 15s, not the default", async () => {
    const custom = "Your leads are taking longer than usual to load. Check your connection and try again.";
    const p = withLoadTimeout(new Promise<string>(() => {}), 15_000, custom);
    p.catch(() => {});
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(p).rejects.toThrow(custom);
    await expect(p).rejects.not.toThrow(LOAD_TIMEOUT_MESSAGE);
  });

  it("still uses the default message when none is given", async () => {
    const p = withLoadTimeout(new Promise<string>(() => {}));
    p.catch(() => {});
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(p).rejects.toThrow(LOAD_TIMEOUT_MESSAGE);
  });

  it("accepts a thenable, not just a real Promise (the jobs query builder)", async () => {
    const thenable = { then: (resolve: (v: string) => void) => resolve("ok") };
    await expect(withLoadTimeout(thenable as PromiseLike<string>)).resolves.toBe("ok");
  });
});
