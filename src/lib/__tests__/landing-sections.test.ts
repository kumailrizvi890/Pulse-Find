import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { demoApplications } from "@/lib/demo-data";
import { actionQueue, daysBetween, followUp, rollingWeekPace, summarize, todayISO } from "@/lib/metrics";

const srcRoot = join(__dirname, "..", "..");
const repoRoot = join(srcRoot, "..");
const read = (p: string) => readFileSync(join(srcRoot, p), "utf8");

const home = read("app/page.tsx");
const css = read("app/globals.css");
const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { dependencies: Record<string, string> };
const reveal = read("components/landing/Reveal.tsx");
const marquee = read("components/landing/Marquee.tsx");
const showcase = read("components/landing/Showcase.tsx");
const bento = read("components/landing/Bento.tsx");
const terminal = read("components/landing/TerminalDemo.tsx");
const stats = read("components/landing/StatsBand.tsx");

describe("hero (four CTAs, demo launches the tour)", () => {
  it("keeps the viewport-height hero section with the backdrop, preview and pulse line", () => {
    expect(home).toContain("min-h-[calc(100dvh-69px)]");
    expect(home).toContain("<HeroBackdrop />");
    expect(home).toContain("<HeroPreview />");
    expect(home).toContain('<PulseTrace className="h-10 w-full" />');
    expect(home).toContain("Know what&apos;s waiting");
  });

  it("keeps all seven capability bullets and the four hero CTAs", () => {
    for (const line of [
      "Reads your email to track every application and reply",
      "Flags the companies that haven't replied in 21 days",
      "Sets a weekly application goal and shows how far along you are",
      "Connects to Claude, Cursor and Copilot through MCP",
      "Keeps your real application data private, visible only to you",
    ]) {
      expect(home).toContain(line);
    }
    // Demo launches the guided tour; jobs, self-host (README local setup)
    // and Connect your agents are the visible secondaries.
    expect(home).toContain('href="/demo?tour=dashboard"');
    expect(home).toContain('href="/jobs"');
    expect(home).toContain('href="https://github.com/kumailrizvi890/Pulse-Find#run-it-locally"');
    expect(home).toContain('href="/#mcp"');
  });
});

describe("demo numbers the sections render (fictional seed data)", () => {
  it("pins the totals the marquee, stats band and widgets show", () => {
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

  it("pins the waiting queue and ghosted order the showcase shows", () => {
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

  it("pins the rolling 7-day pace the showcase chart shows", () => {
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

  it("rollingWeekPace is the single source for the showcase pace", () => {
    // The same rolling shape through the helper the landing page and
    // the Showcase both call — including a Sunday seed, the weekday the
    // old calendar week turned over on. The change is against the
    // previous 7 days (6 vs 3, up 100%, the "up 100%" the landing shows).
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
  it("renders under the hero from the demo totals", () => {
    expect(home).toContain("<Marquee items={marqueeItems} />");
    expect(home).toContain("applications tracked");
    expect(home).toContain("gone quiet, flagged");
    expect(home).toContain("offer on the table");
  });

  it("loops two copies of the items and stops under reduced motion", () => {
    expect(marquee).toContain("landing-marquee-track");
    expect(marquee).toContain("aria-hidden={copy === 1}");
    expect(css).toContain("@keyframes landing-marquee");
    expect(css).toContain(".landing-marquee-track { animation: none; }");
  });
});

describe("showcase widgets (live demo data, not screenshots)", () => {
  it("passes the queue, ghosted list and pace into the showcase", () => {
    expect(home).toContain("<Showcase");
    expect(home).toContain("queue={showcaseQueue}");
    expect(home).toContain("ghosted={showcaseGhosted}");
    expect(home).toContain("paceDays={paceDays}");
    expect(home).toContain("goal={8}");
  });

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

  it("labels the pace window as the rolling last 7 days and recomputes it in the browser", () => {
    // The dashboard counts a trailing 7 days and the landing now counts
    // the same rolling window, so the card says so outright instead of
    // letting the two totals look contradictory.
    expect(showcase).toContain("Last 7 days, compared with the 7 days before.");
    // The server renders on UTC, so a server-rendered "today" is already
    // tomorrow for a visitor west of UTC once midnight UTC passes. The
    // Showcase recomputes the window in the browser after mount, the same
    // pattern as ChatBeat, from the same shared helper the page uses.
    expect(showcase).toContain("rollingWeekPace(demoApplications(today), today)");
    expect(showcase).toContain("todayISO()");
    expect(home).toContain("rollingWeekPace(demoApps, today)");
  });

  it("tilts only on fine pointers and never under reduced motion", () => {
    expect(showcase).toContain('window.matchMedia("(pointer: fine)")');
    expect(showcase).toContain('window.matchMedia("(prefers-reduced-motion: reduce)")');
    expect(showcase).toContain("perspective(900px)");
  });
});

describe("bento (six cells, one line each)", () => {
  it("renders all six cells with a mini-visual and no paragraph", () => {
    expect(home).toContain("<Bento steps={demoSteps} />");
    for (const headline of [
      "Your pipeline, live",
      "Swipe the openings",
      "Spreadsheets, in and out",
      "Your agent keeps it current",
      "Private by default",
      "Try it now",
    ]) {
      expect(bento).toContain(headline);
    }
    expect(bento).toContain("<Funnel steps={steps} />");
    expect(bento).toContain('href="/privacy"');
    expect(bento).toContain('href="/demo"');
  });
});

describe("MCP terminal (typed, not a static block)", () => {
  it("keeps the MCP section and its links, with one short line", () => {
    expect(home).toContain('id="mcp"');
    expect(home).toContain("<TerminalDemo />");
    expect(home).toContain("Your agent reads your email and updates the tracker. Pulse Find never sees your inbox.");
    expect(home).toContain('href="/demo/connect"');
    expect(home).toContain("SELF_HOST.md");
  });

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

describe("stats band (the close)", () => {
  it("counts up the demo totals and ends on the two conversion CTAs", () => {
    expect(home).toContain("<StatsBand total={demoSum.total} oas={demoSum.oas} interviews={demoSum.interviews} actions={demoSum.actions} />");
    expect(stats).toContain("Your search, this organized.");
    expect(stats).toContain("requestAnimationFrame");
    expect(stats).toContain('href="/demo"');
    expect(stats).toContain('href="/login?mode=signup"');
  });
});

describe("demo tour video", () => {
  it("embeds the recorded tour muted, looping and inline with a poster", () => {
    expect(home).toContain('src="/landing/demo-tour.mp4"');
    expect(home).toContain('poster="/landing/demo-tour-poster.jpg"');
    expect(home).toContain("Watch it work");
    expect(home).toContain("Recorded from the live demo with sample data.");
    const video = home.slice(home.indexOf("<video"), home.indexOf("</video>") === -1 ? home.indexOf("/>", home.indexOf("<video")) : home.indexOf("</video>"));
    expect(video).toContain("autoPlay");
    expect(video).toContain("muted");
    expect(video).toContain("loop");
    expect(video).toContain("playsInline");
  });

  it("ships the tour clip and poster as real files, small enough for the page", () => {
    expect(existsSync(join(repoRoot, "public/landing/demo-tour.mp4"))).toBe(true);
    expect(existsSync(join(repoRoot, "public/landing/demo-tour-poster.jpg"))).toBe(true);
    expect(statSync(join(repoRoot, "public/landing/demo-tour.mp4")).size).toBeLessThan(3 * 1024 * 1024);
  });
});

describe("the text walls are gone", () => {
  it("drops the old paragraphs and the Feature helper", () => {
    for (const gone of [
      "Pulled straight from the career pages of 50+ companies every 6 hours, so there are no reposts or stale listings",
      "Sign up once and the tracker, the job finder and your AI agent all work on the same private data",
      "Import a CSV from Excel, Google Sheets or Notion",
      "Your applications are tied to your account and the database enforces it",
      "Connect Claude, Cursor, Copilot or any MCP client with an access token",
      "Online assessments with expiry dates, interviews to schedule, portals left half-finished",
    ]) {
      expect(home).not.toContain(gone);
    }
    expect(home).not.toContain("function Feature(");
  });
});

describe("no new animation dependencies, no real data on the public page", () => {
  it("adds no animation library to the bundle", () => {
    for (const dep of ["gsap", "lenis", "framer-motion", "motion"]) {
      expect(pkg.dependencies[dep]).toBeUndefined();
    }
  });

  it("keeps the landing sections on demo data only — no Supabase in them", () => {
    for (const src of [reveal, marquee, showcase, bento, terminal, stats]) {
      expect(src).not.toContain("supabase");
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
