import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { refreshLabel } from "../../app/jobs/JobsBoard";

const root = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const jobsBoard = read("src/app/jobs/JobsBoard.tsx");
const footer = read("src/components/SiteFooter.tsx");
const dashboard = read("src/components/dashboard/Dashboard.tsx");
const metrics = read("src/lib/metrics.ts");

// Pass-70 audit fixes, three small ones.
//
// (A) /jobs "Last refresh" showed a future-looking time: ago() counted
// elapsed 24h periods, so a refresh from yesterday evening (Nov 19
// 10:17 pm) viewed after midnight (Nov 20 2:37 am) read "today at
// 10:17 pm". Both ago() and refreshLabel() now compare local calendar
// dates: same date is "today", yesterday gets its own "yesterday at
// ..." wording, older refreshes keep the "Nd ago" wording. The time
// rendering itself (toLocaleTimeString in the visitor timezone) is
// untouched.
// (B) The landing footer's "Agents" link pointed at /app/connect, which
// redirects a signed-out visitor to /login. The footer is public nav,
// so it now points at the public Connect page, /demo/connect.
// (C) The dashboard "All applications" table sorts waiting items first
// and then by most recent contact, with nothing on screen saying so.
// One caption line now states the order; the sort itself is untouched.

describe("last refresh uses calendar dates, not elapsed 24h periods", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // The reported case: refresh Nov 19 10:17 pm, seen Nov 20 2:37 am.
    vi.setSystemTime(new Date(2026, 10, 20, 2, 37, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads yesterday evening as yesterday, not today", () => {
    expect(refreshLabel(new Date(2026, 10, 19, 22, 17, 0).toISOString())).toBe("yesterday at 10:17 pm");
  });

  it("still reads an earlier refresh today as today", () => {
    expect(refreshLabel(new Date(2026, 10, 20, 1, 5, 0).toISOString())).toBe("today at 1:05 am");
  });

  it("keeps the ago wording past yesterday", () => {
    expect(refreshLabel(new Date(2026, 10, 18, 9, 0, 0).toISOString())).toBe("2d ago");
    expect(refreshLabel(new Date(2026, 10, 15, 9, 0, 0).toISOString())).toBe("5d ago");
  });
});

describe("the calendar fix reaches posted dates too", () => {
  it("ago() counts whole calendar days in local time", () => {
    expect(jobsBoard).toContain("function calendarDaysBetween(from: Date, to: Date)");
    expect(jobsBoard).toContain("new Date(d.getFullYear(), d.getMonth(), d.getDate())");
    expect(jobsBoard).toContain("calendarDaysBetween(new Date(iso), new Date())");
    expect(jobsBoard).not.toContain("Math.floor((Date.now() - new Date(iso).getTime())");
  });

  it("the list rows still render posted dates through ago()", () => {
    expect(jobsBoard).toContain("{ago(j.posted_at)}");
  });
});

describe("footer Agents link is a public page, not a sign-in wall", () => {
  it("points at /demo/connect and says why", () => {
    expect(footer).toContain('href="/demo/connect"');
    expect(footer).toContain("public Connect page");
    expect(footer).not.toContain('href="/app/connect"');
  });
});

describe("dashboard table sort gets one line of explanation", () => {
  it("captions the order without changing it", () => {
    expect(dashboard).toContain("Waiting items first, then most recent contact.");
    expect(dashboard).toContain('className="mb-3 text-xs text-faint">{sortNote}</p>');
    // The sort itself is untouched: waiting items first, then most
    // recent contact, exactly as sortForTable has always done it.
    expect(metrics).toContain("Default table order: things waiting on you first, then most recent contact.");
    expect(dashboard).toContain("sortForTable(applyFilter(apps, filter, today, settings.ghost_days, query, status))");
  });
});
