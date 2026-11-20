import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ago, calendarDaysBetween, postedAgo } from "../dates";

const root = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const jobsBoard = read("src/app/jobs/JobsBoard.tsx");
const jobDetails = read("src/app/jobs/JobDetails.tsx");
const swipeDeck = read("src/app/jobs/SwipeDeck.tsx");
const newOpenings = read("src/components/dashboard/NewOpenings.tsx");
const dates = read("src/lib/dates.ts");

// Pass-71 follow-up to pass 70: pass 70 gave /jobs a calendar-day
// ago() + refreshLabel, but JobDetails, SwipeDeck and NewOpenings each
// still had their own ago() counting elapsed 24h periods, so a post
// from yesterday evening read "today" in the details panel, the deck
// and the dashboard's newest openings after midnight. All three now
// use the one shared helper in src/lib/dates.ts, which JobsBoard also
// imports instead of defining its own copy.
//
// Same package, second fix: the Saved tab rendered inside the same
// 430px deck column as the swipe deck, so at desktop width every
// saved title and location truncated. The saved list now uses the
// full main width with two columns on desktop; the deck stays 430px
// and phones stay single-column.
describe("shared ago() counts whole calendar days", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // The reported case: posted yesterday evening, seen after midnight.
    vi.setSystemTime(new Date(2026, 10, 20, 2, 37, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads yesterday evening as 1d ago, not today", () => {
    expect(ago(new Date(2026, 10, 19, 22, 17, 0).toISOString())).toBe("1d ago");
  });

  it("still reads an earlier post today as today", () => {
    expect(ago(new Date(2026, 10, 20, 1, 5, 0).toISOString())).toBe("today");
  });

  it("keeps Nd ago past yesterday and rolls months over", () => {
    expect(ago(new Date(2026, 10, 18, 9, 0, 0).toISOString())).toBe("2d ago");
    expect(ago(new Date(2026, 10, 15, 9, 0, 0).toISOString())).toBe("5d ago");
    expect(ago(new Date(2026, 9, 15, 9, 0, 0).toISOString())).toBe("1mo ago");
  });

  it("returns empty for a missing timestamp", () => {
    expect(ago(null)).toBe("");
    expect(ago("")).toBe("");
  });

  it("counts a DST day as one calendar day", () => {
    // Nov 1 2026 is the fall-back day in US Pacific time: 25 hours
    // long, still one calendar day.
    expect(calendarDaysBetween(new Date(2026, 10, 1, 0, 30, 0), new Date(2026, 10, 2, 0, 30, 0))).toBe(1);
  });
});

describe("postedAgo() keeps the deck and details wording", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 20, 2, 37, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads yesterday evening as Posted yesterday, not Posted today", () => {
    expect(postedAgo(new Date(2026, 10, 19, 22, 17, 0).toISOString())).toBe("Posted yesterday");
  });

  it("still reads an earlier post today as Posted today", () => {
    expect(postedAgo(new Date(2026, 10, 20, 1, 5, 0).toISOString())).toBe("Posted today");
  });

  it("keeps Posted Nd ago past yesterday", () => {
    expect(postedAgo(new Date(2026, 10, 18, 9, 0, 0).toISOString())).toBe("Posted 2d ago");
  });

  it("keeps the old wording past a month: Posted 45d ago, not 1mo ago", () => {
    // Deliberate: the deck/details wording never had a month rollover,
    // so it stays "Posted 45d ago" while the bare ago() says "1mo ago".
    expect(postedAgo(new Date(2026, 10, 6, 9, 0, 0).toISOString())).toBe("Posted 14d ago");
    expect(postedAgo(new Date(2026, 9, 6, 9, 0, 0).toISOString())).toBe("Posted 45d ago");
  });

  it("returns null for a missing timestamp, so the panel reads Not listed", () => {
    expect(postedAgo(null)).toBe(null);
  });
});

describe("every view now uses the one shared helper", () => {
  it("no view keeps its own ago() definition", () => {
    for (const [name, src] of [
      ["JobsBoard", jobsBoard],
      ["JobDetails", jobDetails],
      ["SwipeDeck", swipeDeck],
      ["NewOpenings", newOpenings],
    ] as const) {
      expect(src, name).not.toContain("function ago(");
      expect(src, name).not.toContain("function calendarDaysBetween(");
    }
    expect(dates).toContain("export function ago(iso: string | null)");
    expect(dates).toContain("export function postedAgo(iso: string | null)");
    expect(dates).toContain("export function calendarDaysBetween(from: Date, to: Date)");
  });

  it("each view imports its wording from @/lib/dates", () => {
    expect(jobsBoard).toContain('import { ago, calendarDaysBetween } from "@/lib/dates"');
    expect(jobDetails).toContain('import { postedAgo } from "@/lib/dates"');
    expect(jobDetails).toContain("{postedAgo(job.posted_at) ?? \"Not listed\"}");
    expect(swipeDeck).toContain('import { postedAgo } from "@/lib/dates"');
    expect(swipeDeck).toContain("{postedAgo(top.posted_at)}");
    expect(newOpenings).toContain('import { ago } from "@/lib/dates"');
    expect(newOpenings).toContain("{ago(j.posted_at)}");
  });

  it("no elapsed-24h math is left in the four views", () => {
    for (const [name, src] of [
      ["JobsBoard", jobsBoard],
      ["JobDetails", jobDetails],
      ["SwipeDeck", swipeDeck],
      ["NewOpenings", newOpenings],
    ] as const) {
      expect(src, name).not.toContain("Math.floor((Date.now() - new Date(iso).getTime())");
    }
  });
});

describe("saved tab uses the full width on desktop", () => {
  // The saved branch only: slice from the branch to the list view so
  // the swipe deck's own 430px cap cannot satisfy these pins.
  const saved = jobsBoard.slice(
    jobsBoard.indexOf('view === "saved"'),
    jobsBoard.indexOf(") : visible.length === 0"),
  );

  it("saved list is full width with two columns on desktop", () => {
    expect(saved).not.toContain("max-w-[430px]");
    expect(saved).toContain("lg:grid-cols-2");
    expect(saved).toContain("{savedList.map((j) => (");
  });

  it("swipe deck and tabs stay 430px", () => {
    expect(jobsBoard).toContain('className="mx-auto flex w-full max-w-[430px] flex-col items-center gap-2"');
    expect(jobsBoard).toContain("lg:grid-cols-[minmax(0,430px)_minmax(0,336px)]");
  });

  it("saved rows keep their heading, badge, sign-up link, empty state and Show more", () => {
    expect(saved).toContain("Saved, ready to apply");
    expect(saved).toContain("{savedList.length} saved");
    expect(saved).toContain('href="/login?mode=signup&next=/jobs"');
    expect(saved).toContain("Nothing saved yet. Swipe right on a role to keep it here.");
    expect(saved).toContain("<SavedJobTitle");
    expect(jobsBoard).toContain("const SAVED_TITLE_LIMIT = 40;");
  });
});
