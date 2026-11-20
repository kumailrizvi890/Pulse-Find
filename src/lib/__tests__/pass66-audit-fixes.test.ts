import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WeeklyBars, WeeklyPace, type PaceDay } from "../../components/dashboard/Charts";
import { SwipeDeck } from "../../app/jobs/SwipeDeck";
import { demoApplications } from "../demo-data";
import type { WeekBucket } from "../metrics";
import { demoContacts } from "../pipeline";

// Loop pass 66: four audit fixes from the Nov 19 ~6:25pm PT desktop audit.
//
// 1. The 30-day pace chart was unreadable: a value number above every
//    bar plus a zigzag trend line, 30 columns in a ~560px panel. Long
//    windows (more than 14 days) now drop both and keep the hover title
//    and the compact labels; the 7-day view is unchanged. The 12-month
//    chart's last label read "This mo"; it now reads "This month".
// 2. Searching /jobs for something with zero matches said "Deck
//    cleared" with "6 reviewed · 0 left of 0" / 100%, as if the deck
//    were finished. A zero-match deck now says "No openings match",
//    the progress line reads "0 openings match", and the recovery
//    button clears the search and filters instead of re-reviewing the
//    same empty filter.
// 3. The landing footer said the tour was "up top"; the header has no
//    tour button. The copy now points at the Replay the tour button
//    right below it.
// 4. The add-person and add-application placeholders mirrored real
//    seeded records (Priya Nair's status and next step, the Northwind
//    Labs tracker row), so the forms looked prefilled. All five are
//    now clearly generic examples that match no seeded record.

const srcRoot = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(srcRoot, p), "utf8");

const charts = read("components/dashboard/Charts.tsx");
const board = read("app/jobs/JobsBoard.tsx");
const deckSrc = read("app/jobs/SwipeDeck.tsx");
const about = read("components/landing/AboutLanding.tsx");
const networking = read("components/pipeline/NetworkingSection.tsx");
const drawer = read("components/dashboard/ApplicationDrawer.tsx");

const WEEK: PaceDay[] = [
  { label: "Fri", sub: "Nov 13", value: 1 },
  { label: "Sat", sub: "Nov 14", value: 0 },
  { label: "Sun", sub: "Nov 15", value: 1 },
  { label: "Mon", sub: "Nov 16", value: 1 },
  { label: "Tue", sub: "Nov 17", value: 1 },
  { label: "Wed", sub: "Nov 18", value: 1 },
  { label: "Thu", sub: "Nov 19", value: 1 },
];

const MONTH: PaceDay[] = Array.from({ length: 30 }, (_, i) => ({
  // Real metrics.ts semantics: label is the weekday short name, sub is
  // the date. Nov 1 2026 is a Sunday, so the weekday cycles from there.
  label: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i % 7],
  sub: `Nov ${i + 1}`,
  value: i % 3 === 0 ? 1 : 0,
}));

const MONTHS: WeekBucket[] = [
  "2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01",
  "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01",
  "2026-10-01", "2026-11-01",
].map((start, i) => ({ start, tech: i % 4, other: i % 2 }));

const noop = () => {};

describe("30-day pace chart stays readable", () => {
  it("renders no per-bar value numbers over 30 days", () => {
    const html = renderToStaticMarkup(
      createElement(WeeklyPace, {
        days: MONTH,
        total: 10,
        change: -20,
        totalLabel: "Total in the last 30 days",
        prevLabel: "prior 30 days",
        compact: true,
        ariaLabel: "Applications per day, last 30 days",
      }),
    );
    expect(html.match(/text-xs font-semibold tabular-nums/g)?.length ?? 0).toBe(0);
  });

  it("renders no zigzag trend line over 30 days, but keeps each value on hover", () => {
    const html = renderToStaticMarkup(
      createElement(WeeklyPace, {
        days: MONTH,
        total: 10,
        change: -20,
        totalLabel: "Total in the last 30 days",
        prevLabel: "prior 30 days",
        compact: true,
        ariaLabel: "Applications per day, last 30 days",
      }),
    );
    expect(html).not.toContain("<polyline");
    expect(html).toContain('title="Sun: 1"');
    expect(html).toContain('title="Mon: 0"');
  });

  it("labels every fifth bar with the date in compact mode", () => {
    const html = renderToStaticMarkup(
      createElement(WeeklyPace, {
        days: MONTH,
        total: 10,
        change: -20,
        totalLabel: "Total in the last 30 days",
        prevLabel: "prior 30 days",
        compact: true,
        ariaLabel: "Applications per day, last 30 days",
      }),
    );
    // Seven label spans (bars 0, 5, 10, 15, 20, 25 and the last bar),
    // all dates, and no date-sub spans: compact mode shows the date
    // as the label instead of the weekday.
    expect(html.match(/text-\[11px\]/g)?.length ?? 0).toBe(7);
    expect(html.match(/text-\[10px\]/g)?.length ?? 0).toBe(0);
    for (const d of ["Nov 1", "Nov 6", "Nov 11", "Nov 16", "Nov 21", "Nov 26", "Nov 30"]) {
      expect(html).toContain(`>${d}<`);
    }
    for (const w of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
      expect(html).not.toContain(`>${w}<`);
    }
    expect(html).toContain("Total in the last 30 days: 10");
  });

  it("keeps the per-bar numbers and the trend line on the 7-day view", () => {
    const html = renderToStaticMarkup(
      createElement(WeeklyPace, {
        days: WEEK,
        total: 6,
        change: 100,
        totalLabel: "Total in the last 7 days",
        prevLabel: "prior 7 days",
        ariaLabel: "Applications per day, last 7 days",
      }),
    );
    expect(html.match(/text-xs font-semibold tabular-nums/g)?.length ?? 0).toBe(7);
    expect(html).toContain("<polyline");
    expect(html).toContain("Nov 13");
  });

  it("labels the current month in full on the 12-month chart", () => {
    const html = renderToStaticMarkup(
      createElement(WeeklyBars, { weeks: MONTHS, goal: 25, unit: "month" }),
    );
    expect(html).toContain(">This month<");
    // "This month" contains "This mo", so the negative pin needs the
    // closing bracket to mean the truncated label.
    expect(html).not.toContain(">This mo<");
  });

  it("drives the long-range mode off the day count, not the caller", () => {
    expect(charts).toContain("days.length > 14");
    expect(charts).toContain("!longRange");
  });
});

describe("empty jobs search does not claim the deck is cleared", () => {
  it("says No openings match and offers to clear the filters", () => {
    const html = renderToStaticMarkup(
      createElement(SwipeDeck, {
        queue: [],
        loading: false,
        onDecide: noop,
        onUndo: noop,
        canUndo: false,
        emptyText: "No openings match. Try turning off a filter.",
        emptyTitle: "No openings match",
        onClearFilters: noop,
        onDetails: noop,
        onReviewAgain: noop,
        canReviewAgain: true,
      }),
    );
    expect(html).toContain("No openings match");
    expect(html).toContain("Clear search and filters");
    expect(html).not.toContain("Deck cleared");
    expect(html).not.toContain("Review again");
  });

  it("keeps Deck cleared and Review again for a genuinely cleared deck", () => {
    const html = renderToStaticMarkup(
      createElement(SwipeDeck, {
        queue: [],
        loading: false,
        onDecide: noop,
        onUndo: noop,
        canUndo: false,
        emptyText: "You've reviewed everything that matches. Change a filter for more.",
        onDetails: noop,
        onReviewAgain: noop,
        canReviewAgain: true,
      }),
    );
    expect(html).toContain("Deck cleared");
    expect(html).toContain("Review again");
    expect(html).not.toContain("Clear search and filters");
  });

  it("passes the no-match title and the clear-filters handler from the board", () => {
    expect(deckSrc).toContain("emptyTitle?: string");
    expect(deckSrc).toContain('emptyTitle = "Deck cleared"');
    expect(deckSrc).toContain("onClearFilters?: () => void");
    expect(deckSrc).toContain("Clear search and filters");
    expect(board).toContain('emptyTitle={jobs.length === 0 ? "No openings match" : undefined}');
    expect(board).toContain("onClearFilters={jobs.length === 0 ? clearFilters : undefined}");
  });

  it("clearFilters resets the search box and every filter", () => {
    const body = board.slice(
      board.indexOf("function clearFilters()"),
      board.indexOf("  // any filter change starts from page 0"),
    );
    expect(body).toContain('setQ("")');
    expect(body).toContain('setTrack("all")');
    expect(body).toContain("setTechOnly(false)");
    expect(body).toContain("setRemoteOnly(false)");
    expect(body).toContain("setPage(0)");
    expect(body).toContain('setState("loading")');
  });

  it("reads 0 openings match when the total is zero, never 100%", () => {
    expect(board).toContain('total === 0 ? "0 openings match"');
    expect(board).toContain("{reviewed} reviewed (saved, hidden or applied) · {leftToReview} left of {total}");
  });
});

describe("landing footer tour copy points at the replay button", () => {
  it("says the Replay the tour button below runs the walkthrough", () => {
    expect(about).toContain("Replay the tour");
    expect(about).toContain("button below runs the guided walkthrough");
    expect(about).not.toContain("tour up top");
  });
});

describe("add-form placeholders are generic, never seeded records", () => {
  it("add-person placeholders match no seeded contact's status or next step", () => {
    expect(networking).toContain('placeholder="Met at a career fair"');
    expect(networking).toContain('placeholder="Ask for feedback on the portfolio"');
    expect(networking).not.toContain("Week 2 value touch");
    expect(networking).not.toContain("thanked");
    expect(networking).not.toContain("addDays");
    const contacts = demoContacts("2026-11-19");
    expect(contacts.some((c) => c.status === "Met at a career fair")).toBe(false);
    expect(contacts.some((c) => c.next_step === "Ask for feedback on the portfolio")).toBe(false);
  });

  it("add-application placeholders match no seeded tracker row", () => {
    expect(drawer).toContain('placeholder="Example Corp"');
    expect(drawer).toContain('placeholder="Data Engineer Intern"');
    expect(drawer).toContain('placeholder="Waiting to hear back after applying"');
    expect(drawer).not.toContain("Northwind Labs");
    expect(drawer).not.toContain("Software Engineer Intern");
    expect(drawer).not.toContain("Recruiter replied, phone screen next week");
    const apps = demoApplications("2026-11-19");
    expect(apps.some((a) => a.company === "Example Corp")).toBe(false);
    expect(apps.some((a) => a.role === "Data Engineer Intern")).toBe(false);
    expect(apps.some((a) => a.latest_update === "Waiting to hear back after applying")).toBe(false);
  });
});
