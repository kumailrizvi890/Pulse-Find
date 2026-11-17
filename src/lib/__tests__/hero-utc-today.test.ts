import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { demoApplications } from "@/lib/demo-data";
import {
  actionQueue,
  calendarWeekPace,
  daysBetween,
  followUp,
  funnel,
  summarize,
} from "@/lib/metrics";

const srcRoot = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(srcRoot, p), "utf8");

const hero = read("components/HeroPreview.tsx");
const home = read("app/page.tsx");
const dashboard = read("components/dashboard/Dashboard.tsx");
const demoDashboard = read("app/demo/DemoDashboard.tsx");

/**
 * The HeroPreview and demo-header UTC-today follow-up. The landing hero
 * preview and the marquee looked like the same server-UTC bug the
 * ChatBeat and the Showcase pace chart had, but they are not: every
 * value they render is relative to the seed's own today, so seeding
 * from the server's UTC day or the visitor's local day gives the same
 * numbers. The demo header is different: its date chip and greeting
 * are absolute, rendered from the clock, so the server paints the UTC
 * date and part of day and React throws the server tree away and
 * re-renders on the client whenever they disagree, which for a PT
 * visitor is most of the day. The header now renders a blank line
 * until mount and the visitor's own date and greeting after it.
 * These tests pin both halves so neither regresses silently.
 */
describe("hero preview values do not depend on which day seeds them", () => {
  const rendered = (today: string) => {
    const apps = demoApplications(today);
    const sum = summarize(apps, today, 21);
    const queue = actionQueue(apps)
      .slice(0, 3)
      .map((a) => {
        const d = a.action_due ? daysBetween(today, a.action_due) : null;
        return { company: a.company, tag: d === null ? "No date" : d <= 0 ? "Today" : `${d}d left` };
      });
    const ghosted = apps
      .filter((a) => followUp(a, today, 21) === "ghosted")
      .sort((a, b) => (b.last_contact ?? "").localeCompare(a.last_contact ?? ""))
      .slice(0, 3)
      .map((a) => ({ company: a.company, quiet: daysBetween(a.last_contact!, today) }));
    return {
      counts: [sum.total, sum.oas, sum.interviews, sum.actions, sum.ghosted, sum.offers],
      queue,
      ghosted,
      funnel: funnel(apps).map((f) => f.value),
    };
  };

  it("reads the same seeded from the server UTC day or the visitor PT day", () => {
    // Tue Nov 17 UTC is still Mon Nov 16 in PT: the server seeds one
    // day ahead of the visitor, and every rendered value is identical.
    expect(rendered("2026-11-17")).toEqual(rendered("2026-11-16"));
  });

  it("reads the same across the Sunday to Monday week boundary", () => {
    // Sun Nov 15 PT against Mon Nov 16 UTC: different Mon-Sun weeks,
    // same hero preview, same marquee counts.
    expect(rendered("2026-11-16")).toEqual(rendered("2026-11-15"));
  });

  it("renders no absolute date, so there is nothing for the days to disagree on", () => {
    expect(hero).not.toContain("fmtDate");
    expect(hero).not.toContain("toLocaleDateString");
    expect(hero).not.toContain("weekday");
    expect(hero).toContain("daysBetween(today, a.action_due)");
    expect(hero).not.toContain("thisWeek");
    expect(home).toContain(
      "<StatsBand total={demoSum.total} oas={demoSum.oas} interviews={demoSum.interviews} actions={demoSum.actions} />",
    );
  });

  it("pins the one value that does move, and that the landing never shows it", () => {
    // thisWeek counts applications dated in the week containing today,
    // so it reads 1 on Monday and 2 on Tuesday. It is not rendered
    // anywhere on the landing page, which is why the preview stays put.
    expect(summarize(demoApplications("2026-11-16"), "2026-11-16", 21).thisWeek).toBe(1);
    expect(summarize(demoApplications("2026-11-17"), "2026-11-17", 21).thisWeek).toBe(2);
    expect(home).not.toContain("thisWeek");
  });
});

describe("showcase pace follows the visitor week across the boundary", () => {
  it("reads the Nov 9-15 week for a Sunday visitor, not the server Monday week", () => {
    const pace = calendarWeekPace(demoApplications("2026-11-15"), "2026-11-15");
    expect(pace.days.map((d) => d.value)).toEqual([1, 0, 1, 1, 1, 1, 1]);
    expect(pace.total).toBe(6);
    expect(pace.days[0].sub).toBe("Nov 9");
  });
});

describe("demo header date and greeting come from the visitor clock", () => {
  it("pins why the server and visitor clocks disagree", () => {
    // One instant, two clocks: 20:30 UTC is 12:30 in Los Angeles, so
    // the server's part of day (evening) is not the visitor's
    // (afternoon), and after midnight UTC the dates differ too. The
    // hours are read through explicit time zones, so this holds
    // whatever time zone the test runner itself runs in.
    const at = new Date("2026-11-17T20:30:00Z");
    const hour = (tz: string) =>
      Number(at.toLocaleString("en-US", { timeZone: tz, hour: "numeric", hour12: false }));
    expect(hour("UTC")).toBe(20);
    expect(hour("America/Los_Angeles")).toBe(12);
  });

  it("renders the header date and greeting only after mount", () => {
    // Both strings are the only time-dependent text the dashboard
    // renders during SSR. Gating them on mount keeps the server and
    // client first renders identical, so hydration no longer fails and
    // the tree is no longer regenerated on the client.
    expect(dashboard.startsWith('"use client"')).toBe(true);
    expect(dashboard).toContain("const [mounted, setMounted] = useState(false);");
    expect(dashboard).toContain("window.setTimeout(() => setMounted(true), 0)");
    expect(dashboard).toContain('{mounted\n              ? new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })');
    expect(dashboard).toContain('{mounted ? greeting(settings.display_name) : "\\u00A0"}');
    expect(dashboard).toContain('h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"');
  });

  it("seeds the demo data in the browser, from the visitor day", () => {
    expect(demoDashboard).toContain("useMemo(() => demoStore(), [])");
  });
});
