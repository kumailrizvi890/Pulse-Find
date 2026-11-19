import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { demoApplications } from "@/lib/demo-data";
import { actionQueue, daysBetween, followUp, rollingWeekPace, summarize, todayISO } from "@/lib/metrics";

const srcRoot = join(__dirname, "..", "..");
const repoRoot = join(srcRoot, "..");
const read = (p: string) => readFileSync(join(srcRoot, p), "utf8");

const css = read("app/globals.css");
const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { dependencies: Record<string, string> };
const reveal = read("components/landing/Reveal.tsx");
const marquee = read("components/landing/Marquee.tsx");
const showcase = read("components/landing/Showcase.tsx");
const terminal = read("components/landing/TerminalDemo.tsx");

// Nov 19 2026: the old landing (hero, marquee, showcase, bento, MCP
// section, stats band, video) was replaced by the About page + Get
// the app section. The page-content pins for those sections are gone
// with them — what stays here is the demo seed data the demo and
// dashboard still render, the old landing components' own behavior
// (they remain in the repo, unused, flagged for cleanup), and the
// new landing's pins (see about-landing.test.ts for the page itself).

describe("demo numbers the demo still renders (fictional seed data)", () => {
  it("pins the totals the demo shows", () => {
    const today = todayISO();
    const apps = demoApplications(today);
    const sum = summarize(apps, today, 21);
    expect(sum.total).toBe(22);
    expect(sum.oas).toBe(9);
    expect(sum.interviews).toBe(6);
    expect(sum.actions).toBe(5);
    expect(sum.ghosted).toBe(5);
    expect(sum.offers).toBe(1);
  });

  it("pins the waiting queue and ghosted order the demo shows", () => {
    const today = todayISO();
    const apps = demoApplications(today);
    expect(actionQueue(apps).slice(0, 3).map((a) => a.company)).toEqual([
      "Copperline",
      "Northwind Labs",
      "Oakline Coffee",
    ]);
    const ghosted = apps
      .filter((a) => followUp(a, today, 21) === "ghosted")
      .sort((a, b) => (b.last_contact ?? "").localeCompare(a.last_contact ?? ""));
    expect(ghosted.slice(0, 3).map((a) => a.company)).toEqual([
      "Pinecrest Games",
      "Meridian Retail",
      "Harbor & Pike",
    ]);
    expect(ghosted.map((a) => daysBetween(a.last_contact!, today))).toEqual([24, 26, 30, 40, 61]);
  });

  it("pins the rolling 7-day pace the demo shows", () => {
    // The seed dates are relative to today, so the rolling window is
    // always the same six applications: applied 0-6 days ago, with the
    // 5-days-ago slot empty. The previous 7 days hold the three applied
    // 9, 11 and 12 days ago, so the change reads +100%. Seeded on a
    // Monday so the expectation holds on every run, whatever day CI
    // runs on — the old calendar-week version changed shape with the
    // weekday and went red the morning UTC rolled to Tuesday Nov 17.
    const today = "2026-11-16"; // a Monday
    const pace = rollingWeekPace(demoApplications(today), today);
    expect(pace.days.map((d) => d.value)).toEqual([1, 0, 1, 1, 1, 1, 1]);
    expect(pace.total).toBe(6);
    expect(pace.change).toBe(100);
    expect(pace.days[0].sub).toBe("Nov 10");
  });

  it("reads the same rolling window one day later, when the calendar week would have changed", () => {
    // Tuesday Nov 17: the Mon-Sun week gains its second application and
    // the old test read [1, 1, 0, 0, 0, 0, 0]. The rolling window ends
    // on today either way, so the shape, total and change are identical.
    const today = "2026-11-17"; // a Tuesday
    const pace = rollingWeekPace(demoApplications(today), today);
    expect(pace.days.map((d) => d.value)).toEqual([1, 0, 1, 1, 1, 1, 1]);
    expect(pace.total).toBe(6);
    expect(pace.change).toBe(100);
    expect(pace.days[0].sub).toBe("Nov 11");
  });

  it("rollingWeekPace is the single source for the demo pace", () => {
    // The same rolling shape through the helper the demo and the
    // Showcase both call — including a Sunday seed, the weekday the
    // old calendar week turned over on. The change is against the
    // previous 7 days (6 vs 3, up 100%, the "up 100%" the demo shows).
    const monday = rollingWeekPace(demoApplications("2026-11-16"), "2026-11-16");
    expect(monday.days.map((d) => d.value)).toEqual([1, 0, 1, 1, 1, 1, 1]);
    expect(monday.total).toBe(6);
    expect(monday.change).toBe(100);
    const tuesday = rollingWeekPace(demoApplications("2026-11-17"), "2026-11-17");
    expect(tuesday.days.map((d) => d.value)).toEqual([1, 0, 1, 1, 1, 1, 1]);
    expect(tuesday.total).toBe(6);
    expect(tuesday.change).toBe(100);
    const sunday = rollingWeekPace(demoApplications("2026-11-15"), "2026-11-15");
    expect(sunday.days.map((d) => d.value)).toEqual([1, 0, 1, 1, 1, 1, 1]);
    expect(sunday.total).toBe(6);
    expect(sunday.change).toBe(100);
    expect(sunday.days[0].sub).toBe("Nov 9");
  });
});

describe("proof marquee", () => {
  it("loops two copies of the items and stops under reduced motion", () => {
    expect(marquee).toContain("landing-marquee-track");
    expect(marquee).toContain("aria-hidden={copy === 1}");
    expect(css).toContain("@keyframes landing-marquee");
    expect(css).toContain(".landing-marquee-track { animation: none; }");
  });
});

describe("showcase widgets (live demo data, not screenshots)", () => {
  it("shows the three cards with a real pace chart and due tags", () => {
    expect(showcase).toContain("What&apos;s next");
    expect(showcase).toContain("Who went quiet");
    expect(showcase).toContain("This week&apos;s pace");
    expect(showcase).toContain("days={pace.days}");
    expect(showcase).toContain('totalLabel="Total in the last 7 days"');
    expect(showcase).toContain('prevLabel="previous 7 days"');
    expect(showcase).toContain('ariaLabel="Applications per day, last 7 days"');
    expect(showcase).toContain("Open the demo →");
  });

  it("tilts only on fine pointers and never under reduced motion", () => {
    expect(showcase).toContain('window.matchMedia("(pointer: fine)")');
    expect(showcase).toContain('window.matchMedia("(prefers-reduced-motion: reduce)")');
    expect(showcase).toContain("perspective(900px)");
  });
});

describe("MCP terminal (typed, not a static block)", () => {
  it("types the same transcript as the old static block, with a replay button", () => {
    expect(terminal).toContain("claude mcp add --transport http pulse-find");
    expect(terminal).toContain("Northwind Labs · OA received · due Nov 11");
    expect(terminal).toContain("Atlas Robotics · new application");
    expect(terminal).toContain("likely a fake job offer, nothing added");
    expect(terminal).toContain('aria-label="Replay the terminal demo"');
    expect(terminal).toContain("landing-caret");
  });

  it("renders the whole transcript at once under reduced motion", () => {
    expect(terminal).toContain('window.matchMedia("(prefers-reduced-motion: reduce)")');
    expect(terminal).toContain("setShown(LINES.length)");
  });
});

describe("demo tour video", () => {
  it("ships the tour clip and poster as real files, small enough for the page", () => {
    // The clip no longer plays anywhere on the landing (Nov 19 2026:
    // the video section left with the old hero), but the files stay
    // in public/ until the cleanup pass removes them.
    expect(existsSync(join(repoRoot, "public/landing/demo-tour.mp4"))).toBe(true);
    expect(existsSync(join(repoRoot, "public/landing/demo-tour-poster.jpg"))).toBe(true);
    expect(statSync(join(repoRoot, "public/landing/demo-tour.mp4")).size).toBeLessThan(3 * 1024 * 1024);
  });
});

describe("no new animation dependencies, no real data on the public page", () => {
  it("adds no animation library to the bundle", () => {
    for (const dep of ["gsap", "lenis", "framer-motion", "motion"]) {
      expect(pkg.dependencies[dep]).toBeUndefined();
    }
  });

});

describe("scroll reveals (restraint-first, reduced-motion safe)", () => {
  it("reveals on scroll and settles to natural styles (no lingering transform)", () => {
    expect(reveal).toContain("IntersectionObserver");
    expect(reveal).toContain("is-settled");
    expect(reveal).toContain("setState(\"settled\")");
    expect(css).toContain(".landing-reveal.is-settled");
    expect(css).toContain("transform: none;");
  });

  it("defines the landing keyframes and pauses the loops under reduced motion", () => {
    for (const name of ["landing-marquee", "landing-swipe-nudge", "landing-sheet-pulse", "landing-caret-blink"]) {
      expect(css).toContain(`@keyframes ${name}`);
    }
    expect(css).toContain(".landing-swipe-nudge { animation: none; }");
    expect(css).toContain(".landing-sheet-pulse { animation: none; }");
    expect(css).toContain(".landing-caret { animation: none; opacity: 1; }");
  });
});
