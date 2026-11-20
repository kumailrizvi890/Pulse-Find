import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WeeklyPace, type PaceDay } from "../../components/dashboard/Charts";
import { SwipeDeck, type DeckJob } from "../../app/jobs/SwipeDeck";

// Loop pass 67: three audit fixes from the Nov 19 ~8:20pm PT desktop audit.
//
// 1. The 30-day pace chart labelled every fifth bar with the weekday
//    ("Thu"), hiding the date, so a reader could not tell which day a
//    bar was. Compact mode now labels every fifth bar with the date
//    ("Nov 13"); the 7-day view still shows the weekday and the date.
// 2. The swipe deck buttons were icon-only, so a first-time visitor
//    could not tell Pass from Save. Each circle now carries a small
//    visible label underneath, with the circles in fixed 58px slots so
//    the labels share one baseline and the row stays the same width.
// 3. Three one-line fold-in nits: the About sun icon path regains its
//    round line cap, a leads-sheet test comment re-indents to 4 spaces,
//    and the signed-in connect Other snippet goes back to the literal
//    newline-escape form from the pass 55 package pin. The demo connect
//    Claude Code snippet had the same job in the other direction: it ended
//    with a lone backslash plus a real newline, which JavaScript reads as
//    a line continuation, so the demo page rendered a one-line command.
//    It now uses the same literal escape form and renders two lines.

const srcRoot = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(srcRoot, p), "utf8");

const charts = read("components/dashboard/Charts.tsx");
const deck = read("app/jobs/SwipeDeck.tsx");
const about = read("components/landing/AboutLanding.tsx");
const leadsSheetTest = read("lib/__tests__/leads-sheet.test.ts");
const signedIn = read("app/app/connect/ConnectAgent.tsx");
const demo = read("app/demo/connect/DemoConnectAgent.tsx");

// Real metrics.ts semantics: label is the weekday short name, sub is
// the date. Nov 1 2026 is a Sunday, so the weekday cycles from there.
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
  label: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i % 7],
  sub: `Nov ${i + 1}`,
  value: i % 3 === 0 ? 1 : 0,
}));

const JOB: DeckJob = {
  id: "feed-0",
  company: "Anduril Industries",
  title: "2027 Mission Operations Engineer Intern",
  location: "Seattle, WA",
  remote: false,
  url: "https://example.com/careers/0",
  track: "Internship",
  tech: true,
  posted_at: "2026-11-18T00:00:00Z",
};

const noop = () => {};

describe("30-day pace labels show dates", () => {
  it("labels every fifth compact bar with the date, first and last included", () => {
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
    // all dates, and no date-sub spans below them.
    expect(html.match(/text-\[11px\]/g)?.length ?? 0).toBe(7);
    expect(html.match(/text-\[10px\]/g)?.length ?? 0).toBe(0);
    for (const d of ["Nov 1", "Nov 6", "Nov 11", "Nov 16", "Nov 21", "Nov 26", "Nov 30"]) {
      expect(html).toContain(`>${d}<`);
    }
    // No weekday names leak into the compact labels.
    for (const w of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
      expect(html).not.toContain(`>${w}<`);
    }
  });

  it("still shows the weekday and the date on the 7-day view", () => {
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
    expect(html.match(/text-\[11px\]/g)?.length ?? 0).toBe(7);
    expect(html.match(/text-\[10px\]/g)?.length ?? 0).toBe(7);
    for (const w of ["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu"]) {
      expect(html).toContain(`>${w}<`);
    }
    for (const d of ["Nov 13", "Nov 14", "Nov 15", "Nov 16", "Nov 17", "Nov 18", "Nov 19"]) {
      expect(html).toContain(`>${d}<`);
    }
  });

  it("picks the date label from the compact flag in source", () => {
    expect(charts).toContain("{compact ? d.sub : d.label}");
  });
});

describe("swipe deck buttons carry visible labels", () => {
  it("shows Pass, Details, Undo and Save under the circles", () => {
    const html = renderToStaticMarkup(
      createElement(SwipeDeck, {
        queue: [JOB],
        loading: false,
        onDecide: noop,
        onUndo: noop,
        canUndo: true,
        emptyText: "Nothing left to review.",
        onDetails: noop,
      }),
    );
    for (const label of ["Pass", "Details", "Undo", "Save"]) {
      expect(html).toContain(`>${label}<`);
    }
    // The aria-labels stay: the visible text is a caption, not a rename.
    for (const label of ["Pass", "Details", "Undo", "Save"]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
  });

  it("keeps the button row the same width, circles in 58px slots", () => {
    expect(deck).toContain('className="mt-6 flex items-start gap-5"');
    expect(deck).toContain("h-[58px] w-[58px]");
    expect(deck).toContain("h-[46px] w-[46px] -translate-y-1.5");
    expect(deck).toContain('className="flex h-[58px] items-center justify-center"');
  });
});

describe("signed-in connect snippets keep their exact rendered text", () => {
  it("keeps the Claude Code snippet on one source line, rendering the two-line command", () => {
    const claudeLine = signedIn.split("\n").find((l) => l.includes("claude mcp add"));
    expect(claudeLine).toBeDefined();
    expect(claudeLine).toContain("--header");
    // The line carries the literal backslash-n escape, not a real newline.
    expect(signedIn).toMatch(/claude mcp add --transport http pulse-find \$\{url\} \\\\\\n  --header/);
    // The escape form renders as a trailing backslash plus a newline.
    const url = "https://pulsefind-app.vercel.app/mcp";
    const auth = "Bearer pf_test";
    const rendered = `claude mcp add --transport http pulse-find ${url} \\\n  --header "Authorization: ${auth}"`;
    expect(rendered).toBe(
      "claude mcp add --transport http pulse-find https://pulsefind-app.vercel.app/mcp \\\n  --header \"Authorization: Bearer pf_test\"",
    );
  });

  it("keeps the Other snippet on one source line with literal newline escapes", () => {
    const otherLine = signedIn.split("\n").find((l) => l.includes("Streamable HTTP"));
    expect(otherLine).toBeDefined();
    expect(otherLine).toContain("URL:");
    expect(otherLine).toContain("Header:");
    expect(signedIn).toMatch(/return `URL:        \$\{url\}\\nTransport:  Streamable HTTP\\nHeader:     Authorization: \$\{auth\}`;/);
    // The escape form renders as the exact three-line snippet.
    const url = "https://pulsefind-app.vercel.app/mcp";
    const auth = "Bearer pf_test";
    const rendered = `URL:        ${url}\nTransport:  Streamable HTTP\nHeader:     Authorization: ${auth}`;
    expect(rendered).toBe(
      "URL:        https://pulsefind-app.vercel.app/mcp\nTransport:  Streamable HTTP\nHeader:     Authorization: Bearer pf_test",
    );
  });
});


describe("demo connect snippet renders the same two-line command", () => {
  it("keeps the demo Claude Code snippet on one source line, rendering the two-line command", () => {
    const claudeLine = demo.split("\n").find((l) => l.includes("claude mcp add"));
    expect(claudeLine).toBeDefined();
    expect(claudeLine).toContain("--header");
    // The line carries the literal backslash-n escape, not a real newline.
    expect(demo).toMatch(/claude mcp add --transport http pulse-find \$\{url\} \\\\\\n  --header/);
    // The escape form renders as a trailing backslash plus a newline.
    const url = "https://pulsefind-app.vercel.app/mcp";
    const auth = "Bearer <redacted>";
    const rendered = `claude mcp add --transport http pulse-find ${url} \\\n  --header "Authorization: ${auth}"`;
    expect(rendered).toBe(
      "claude mcp add --transport http pulse-find https://pulsefind-app.vercel.app/mcp \\\n  --header \"Authorization: Bearer <redacted>\"",
    );
  });
});

describe("pass 67 fold-in nits", () => {
  it("gives the About sun icon path a round line cap", () => {
    const sunLine = about.split("\n").find((l) => l.includes("M12 3v3"));
    expect(sunLine).toBeDefined();
    expect(sunLine).toContain('strokeLinecap="round"');
  });

  it("keeps the TruncatedCellText comment at four spaces", () => {
    const line = leadsSheetTest.split("\n").find((l) => l.includes("Values render through TruncatedCellText now"));
    expect(line).toBeDefined();
    expect(line?.startsWith("    //")).toBe(true);
    expect(line?.startsWith("        //")).toBe(false);
  });
});
