import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addDays, monthly } from "../metrics";
import { demoApplications } from "../demo-data";

const MONDAY = "2026-11-16";
const DEMO = demoApplications(MONDAY);

function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

const overview = read("components/dashboard/Overview.tsx");
const charts = read("components/dashboard/Charts.tsx");

function inWindow(a: { date_applied: string | null }, start: string, end: string): boolean {
  return !!a.date_applied && a.date_applied >= start && a.date_applied <= end;
}

describe("monthly()", () => {
  it("buckets the last 12 calendar months ending with the current one, oldest first", () => {
    const m = monthly(DEMO, MONDAY);
    expect(m).toHaveLength(12);
    expect(m[0].start).toBe("2025-12-01");
    expect(m[11].start).toBe("2026-11-01");
  });

  it("holds Nov 10, Oct 10, Sep 2 in the demo and nothing anywhere else", () => {
    const m = monthly(DEMO, MONDAY);
    expect(m.reduce((s, b) => s + b.tech + b.other, 0)).toBe(22);
    expect(m[11]).toMatchObject({ start: "2026-11-01", tech: 10, other: 0 });
    expect(m[10]).toMatchObject({ start: "2026-10-01", tech: 8, other: 2 });
    expect(m[9]).toMatchObject({ start: "2026-09-01", tech: 1, other: 1 });
    expect(m.slice(0, 9).reduce((s, b) => s + b.tech + b.other, 0)).toBe(0);
  });

  it("takes a shorter month count when asked", () => {
    const m = monthly(DEMO, MONDAY, 3);
    expect(m.map((b) => b.start)).toEqual(["2026-09-01", "2026-10-01", "2026-11-01"]);
    expect(m.map((b) => b.tech + b.other)).toEqual([2, 10, 10]);
  });
});

describe("trailing windows (demo, Monday 2026-11-16)", () => {
  it("holds 6 applications in the last 7 days", () => {
    const start = addDays(MONDAY, -6);
    const found = DEMO.filter((a) => inWindow(a, start, MONDAY)).map((a) => a.company).sort();
    expect(found).toEqual([
      "Brightwater Health",
      "Cobalt Systems",
      "Lumen Mobile",
      "Orchard AI",
      "Quarry Analytics",
      "Westfield Labs",
    ]);
  });

  it("holds 3 in the 7 days before that", () => {
    const start = addDays(MONDAY, -13);
    const end = addDays(MONDAY, -7);
    const found = DEMO.filter((a) => inWindow(a, start, end)).map((a) => a.company).sort();
    expect(found).toEqual(["Glassbridge", "Northwind Labs", "Tidewater Cloud"]);
  });

  it("holds 15 in the last 30 days", () => {
    const start = addDays(MONDAY, -29);
    const found = DEMO.filter((a) => inWindow(a, start, MONDAY)).map((a) => a.company).sort();
    expect(found).toEqual([
      "Atlas Robotics",
      "Brightwater Health",
      "Cobalt Systems",
      "Copperline",
      "Glassbridge",
      "Lumen Mobile",
      "Meridian Retail",
      "Northwind Labs",
      "Oakline Coffee",
      "Orchard AI",
      "Pinecrest Games",
      "Quarry Analytics",
      "Tidewater Cloud",
      "Verdant Energy",
      "Westfield Labs",
    ]);
  });

  it("holds 6 in the 30 days before that", () => {
    const start = addDays(MONDAY, -59);
    const end = addDays(MONDAY, -30);
    const found = DEMO.filter((a) => inWindow(a, start, end)).map((a) => a.company).sort();
    expect(found).toEqual([
      "Fernhill Capital",
      "Harbor & Pike",
      "Kestrel Fintech",
      "Ridgeview Bank",
      "Sable Studio",
      "Saltmarsh Security",
    ]);
  });

  it("holds all 22 in the last 12 months", () => {
    expect(monthly(DEMO, MONDAY).reduce((s, b) => s + b.tech + b.other, 0)).toBe(22);
  });

  it("rises 100% over the prior 7 days and 150% over the prior 30", () => {
    expect(Math.round(((6 - 3) / 3) * 100)).toBe(100);
    expect(Math.round(((15 - 6) / 6) * 100)).toBe(150);
  });
});

describe("Pace range control (Overview source)", () => {
  it("has a segmented control with all three ranges", () => {
    expect(overview).toContain('aria-label="Pace range"');
    expect(overview).toContain("Last 7 days");
    expect(overview).toContain("Last 30 days");
    expect(overview).toContain("Last 12 months");
    expect(overview).toContain("aria-pressed={range === r}");
  });

  it("defaults to the last 7 days", () => {
    expect(overview).toContain('useState<PaceRange>("7d")');
  });

  it("builds the daily chart from a trailing window, not the calendar week", () => {
    expect(overview).toContain("addDays(monday, daysSinceMonday - (rangeDays - 1))");
    expect(overview).toContain("Array.from({ length: rangeDays }");
    expect(overview).not.toContain("Array.from({ length: 7 }");
    expect(overview).toContain("addDays(start, -rangeDays)");
  });

  it("renders the monthly chart for the yearly view", () => {
    expect(overview).toContain("monthly(apps, today)");
    expect(overview).toContain('<WeeklyBars weeks={months} goal={Math.max(rangeGoal, 1)} unit="month" />');
    expect(overview).toContain("No applications in the last 12 months.");
  });

  it("compares the longer ranges against four weeks of the weekly goal", () => {
    expect(overview).toContain("weeklyGoal * 4");
    expect(overview).toContain("monthly goal");
  });

  it("keeps the explicit empty state, reworded to the trailing window", () => {
    expect(overview).toContain("No applications in the last 7 days");
    expect(overview).toContain("days before that.");
    expect(overview).toContain("No applications in the last 30 days");
    expect(overview).not.toContain("No applications yet this week");
  });

  it("keeps the 12-week chart under the daily ranges only", () => {
    expect(overview).toContain("Last 12 weeks");
    expect(overview).toContain('range !== "12m"');
  });
});

describe("Charts range support", () => {
  it("WeeklyPace takes the window labels and a compact mode", () => {
    expect(charts).toContain("totalLabel?: string");
    expect(charts).toContain("prevLabel?: string");
    expect(charts).toContain("compact?: boolean");
    expect(charts).toContain("ariaLabel?: string");
  });

  it("compact hides the per-day date and labels only every fifth bar", () => {
    expect(charts).toContain("i % 5 === 0");
    expect(charts).toContain("{!compact && (");
  });

  it("WeeklyBars takes a unit and labels the current month 'This mo'", () => {
    expect(charts).toContain('unit?: "week" | "month"');
    expect(charts).toContain('"This mo"');
    expect(charts).toContain("Applications per ${unit}");
  });
});
