import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WeeklyBars } from "../../components/dashboard/Charts";
import { DemoConnectAgent } from "../../app/demo/connect/DemoConnectAgent";
import { JobDetails } from "../../app/jobs/JobDetails";
import type { DeckJob } from "../../app/jobs/SwipeDeck";
import NotFound from "../../app/not-found";
import { demoApplications, demoEvents } from "../demo-data";
import { demoContacts, demoPipelineStore } from "../pipeline";
import { answerGeneralQuestion, type GeneralChatContext } from "../task-chat";
import type { Application } from "../types";
import type { WeekBucket } from "../metrics";

// Loop pass 68: two findings from the Nov 19 ~9:32pm PT live audit on
// production d0924b5, both verified in code at d0924b5.
//
// 1. The 12-month pace chart was unreadable: the Y axis scaled to the
//    monthly goal (32) while the biggest month held 11 applications,
//    so the bars sat tiny under a 0-40 axis; bar tooltips said "Week
//    of ..." on a per-month chart; and the X axis labelled only every
//    3rd month. The axis now scales to the data, the goal line clamps
//    to the top edge when it sits above the data, month tooltips read
//    "Nov: 11 tech, 0 other", and month labels run every 2nd month.
//    The 12-week chart is unchanged when the goal fits the data.
// 2. The dashboard Networking Follow-ups cards truncated the next
//    step, the person and company, and the note to one line each, so
//    at desktop width they read mid-word ("Week 2 value touch:
//    one...", "Marcus Webb · Atlas Robot..."). All three lines now
//    clamp to two lines with the full text on hover. The due-date line
//    and the "Open" link are unchanged. The networking page itself
//    already shows next steps in full and is untouched.
// 3. Ask Pulse contradicted the dashboard on interviews: its filter
//    excluded offer-stage rows and listed a rejected row with no
//    closed marker, so it said 5 at interview stage while the
//    dashboard said 6 reached, 5 active. Both interview paths now use
//    reachedInterview, active first, finished rows marked (Closed).
// 4. A mistyped URL landed on a bare 404 with no nav and no way back.
//    There is now a real not-found page with the public TopBar and
//    SiteFooter and a link home. No /about route was created.
// 5. The Job Details panel truncated its own title mid-word while the
//    card beside it showed the full title. The title now wraps; the
//    company line stays truncated.
// 6. Connect step 2 changed format by tab (a terminal command for
//    Claude Code, a JSON config for Cursor, VS Code and Claude
//    Desktop) with nothing saying so. One short line under the
//    command now says the format changes by tab, on both connect
//    pages. Step 4 is untouched.

const srcRoot = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(srcRoot, p), "utf8");

const charts = read("components/dashboard/Charts.tsx");
const overview = read("components/dashboard/Overview.tsx");
const taskChat = read("lib/task-chat.ts");
const notFoundSrc = read("app/not-found.tsx");
const detailsSrc = read("app/jobs/JobDetails.tsx");
const demoConnect = read("app/demo/connect/DemoConnectAgent.tsx");
const signedInConnect = read("app/app/connect/ConnectAgent.tsx");

const FORMAT_NOTE =
  "Claude Code shows a terminal command; Cursor, VS Code and Claude Desktop show a JSON config; Other shows the connection details.";

// Live shape: Nov 11 tech, Oct 7 + 2, Sep 1 + 1, the rest small.
// Data max is 11; with goal 32 the old code forced a 0-40 axis.
const MONTHS: WeekBucket[] = [
  { start: "2025-12-01", tech: 0, other: 0 },
  { start: "2026-01-01", tech: 2, other: 0 },
  { start: "2026-02-01", tech: 1, other: 1 },
  { start: "2026-03-01", tech: 3, other: 0 },
  { start: "2026-04-01", tech: 0, other: 1 },
  { start: "2026-05-01", tech: 4, other: 0 },
  { start: "2026-06-01", tech: 2, other: 1 },
  { start: "2026-07-01", tech: 5, other: 0 },
  { start: "2026-08-01", tech: 1, other: 0 },
  { start: "2026-09-01", tech: 1, other: 1 },
  { start: "2026-10-01", tech: 7, other: 2 },
  { start: "2026-11-01", tech: 11, other: 0 },
];

// 12 weeks, data max 6, goal 8: the goal fits, so the line must sit at
// its real position, exactly as the old code drew it (niceMax 10).
const WEEKS: WeekBucket[] = [
  "2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21",
  "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19",
  "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16",
].map((start, i) => ({
  start,
  tech: [6, 4, 2, 0, 1, 3, 0, 2, 1, 0, 5, 2][i],
  other: 0,
}));

// The goal line is the dashed line; the top tick line shares its y
// when the goal clamps, so find the dashed tag first, then its y1.
function goalLineY(html: string): number {
  const tag = html.match(/<line[^>]*stroke-dasharray="5 4"[^>]*>/);
  expect(tag).not.toBeNull();
  const y = tag![0].match(/y1="([\d.]+)"/);
  expect(y).not.toBeNull();
  return Number(y![1]);
}

describe("12-month pace chart scales to the data", () => {
  it("month tooltips read like a month, never Week of", () => {
    const html = renderToStaticMarkup(
      createElement(WeeklyBars, { weeks: MONTHS, goal: 32, unit: "month" }),
    );
    expect(html).toContain("Nov: 11 tech, 0 other");
    expect(html).toContain("Oct: 7 tech, 2 other");
    expect(html).not.toContain("Week of");
  });

  it("week tooltips still say Week of", () => {
    const html = renderToStaticMarkup(
      createElement(WeeklyBars, { weeks: WEEKS, goal: 8 }),
    );
    expect(html).toContain("Week of Aug 31: 6 tech, 0 other");
  });

  it("clamps the goal line to the top edge when the goal sits above the data", () => {
    const html = renderToStaticMarkup(
      createElement(WeeklyBars, { weeks: MONTHS, goal: 32, unit: "month" }),
    );
    // T is 22: the top edge of the chart area.
    expect(goalLineY(html)).toBe(22);
    expect(html).toContain(">Goal 32<");
  });

  it("draws the goal line at its real position when the goal fits", () => {
    const html = renderToStaticMarkup(
      createElement(WeeklyBars, { weeks: WEEKS, goal: 8 }),
    );
    // niceMax 10, so y(8) is 22 + 162 * 0.2 = 54.4, as before.
    expect(goalLineY(html)).toBeCloseTo(54.4, 1);
    expect(html).toContain(">Goal 8<");
  });

  it("labels every 2nd month", () => {
    const html = renderToStaticMarkup(
      createElement(WeeklyBars, { weeks: MONTHS, goal: 32, unit: "month" }),
    );
    for (const label of ["Jan", "Mar", "May", "Jul", "Sep", "This month"]) {
      expect(html).toContain(`>${label}<`);
    }
    for (const label of ["Dec", "Feb", "Apr", "Jun", "Aug", "Oct"]) {
      expect(html).not.toContain(`>${label}<`);
    }
  });

  it("tops the axis at the data, not the goal", () => {
    const html = renderToStaticMarkup(
      createElement(WeeklyBars, { weeks: MONTHS, goal: 32, unit: "month" }),
    );
    // Data max 11 gives niceMax 15; the old goal-driven axis topped at 40.
    expect(html).toContain(">15<");
    expect(html).not.toContain(">40<");
  });

  it("scales the axis from the data and clamps the goal line in source", () => {
    expect(charts).toContain("const dataMax = Math.max(...weeks.map((w) => w.tech + w.other), 1);");
    expect(charts).toContain("const goalY = goal <= niceMax ? y(goal) : T;");
    expect(charts).toContain('unit === "month" ? 2 : W < 420 ? 4 : 3');
    expect(charts).toContain("`${label(w.start)}: ${w.tech} tech, ${w.other} other`");
  });
});

describe("networking follow-up cards show two lines, not one truncated line", () => {
  it("shows the full next step, never clipped mid-word", () => {
    // The next step is the card's title: it wraps in full now (Nov 24
    // 2026), after the two-line clamp cut it mid-word at desktop width
    // ("Week 2 value touch: one strength + one fi…"). The hover title
    // stays, for the full text in one line.
    expect(overview).toContain("text-sm font-semibold break-words");
    expect(overview).toContain("title={nextStep}");
    expect(overview).toContain("const nextStep = c.next_step.trim()");
    expect(overview).not.toContain("line-clamp-2 text-sm font-semibold");
    expect(overview).not.toContain("block truncate text-sm font-semibold");
  });

  it("clamps the person and company line to two lines with the full text on hover", () => {
    expect(overview).toContain("line-clamp-2 text-xs text-muted");
    expect(overview).toContain("title={personLine}");
    expect(overview).toContain("const personLine = c.company");
    expect(overview).not.toContain("block truncate text-xs text-muted");
  });

  it("clamps the note to two lines with the full text on hover", () => {
    expect(overview).toContain("line-clamp-2 text-xs text-faint");
    expect(overview).toContain("title={c.notes}");
    expect(overview).not.toContain("block truncate text-xs text-faint");
  });

  it("keeps the due-date line and the Open link unchanged", () => {
    expect(overview).toContain("{dueText}");
    expect(overview).toContain("Open →");
    expect(overview).toContain("mt-1 block text-xs");
  });
});

// Demo-seed context for the Ask Pulse interview checks, mirroring the
// task-chat-ask-pulse demo fixture.
async function demoCtx(): Promise<GeneralChatContext> {
  const today = "2026-11-19";
  const apps = demoApplications(today);
  return {
    apps,
    events: demoEvents(apps),
    contacts: demoContacts(today),
    leads: await demoPipelineStore(today).loadLeads(),
    today,
    origin: "https://pulsefind-app.vercel.app",
    ghostDays: 21,
    weeklyGoal: 25,
    trackerPath: "/demo",
  };
}

function mkApp(over: Partial<Application> & { id: string; company: string }): Application {
  return {
    role: "Software Engineer Intern",
    track: "Internship",
    status: "Applied",
    date_applied: "2026-11-10",
    last_contact: "2026-11-14",
    oa_received: false,
    interviews_done: 0,
    latest_update: "",
    link: "",
    notes: "",
    action_needed: "",
    action_due: null,
    ...over,
  };
}

function smallCtx(apps: Application[]): GeneralChatContext {
  return {
    apps,
    events: [],
    contacts: [],
    leads: [],
    today: "2026-11-19",
    origin: "https://pulsefind-app.vercel.app",
    ghostDays: 21,
    weeklyGoal: 8,
    trackerPath: "/demo",
  };
}

describe("Ask Pulse interviews agree with the dashboard", () => {
  it("answers the demo-seed interview count like the dashboard", async () => {
    const a = answerGeneralQuestion("How many interviews do I have?", await demoCtx());
    expect(a.text).toContain("6 applications reached interview stage, 5 still active");
    expect(a.text).toContain("Oakline Coffee");
    expect(a.text).toContain("And 1 more in your tracker.");
    // Kestrel is the sixth row: the only finished one, with the oldest
    // last contact, so it is the "1 more", not one of the five listed.
    expect(a.text).not.toContain("Kestrel");
  });

  it("marks finished interview rows closed", () => {
    const a = answerGeneralQuestion(
      "What interviews are coming up?",
      smallCtx([
        mkApp({
          id: "k1",
          company: "Kestrel Fintech",
          role: "Full Stack Developer (New Grad)",
          track: "New Grad",
          status: "Rejected",
          interviews_done: 1,
          last_contact: "2026-10-28",
          latest_update: "Rejected after recruiter screen",
        }),
        mkApp({
          id: "c1",
          company: "Copperline",
          role: "Associate AI Engineer (New Grad)",
          track: "New Grad",
          status: "Interview Invited",
          last_contact: "2026-11-18",
          latest_update: "Recruiter asked for availability next week",
        }),
      ]),
    );
    expect(a.text).toContain("2 applications reached interview stage, 1 still active");
    expect(a.text).toContain("Kestrel Fintech");
    expect(a.text).toContain("Rejected (Closed)");
    expect((a.text.match(/\(Closed\)/g) ?? []).length).toBe(1);
  });

  it("answers yes to an interview question about Oakline", async () => {
    const a = answerGeneralQuestion("Do I have an interview with Oakline Coffee?", await demoCtx());
    expect(a.text).toContain("Interviews at Oakline Coffee");
    expect(a.text).toContain("Offer");
  });

  it("uses reachedInterview in both interview paths", () => {
    expect(taskChat).toContain("reachedInterview,");
    expect(taskChat).toContain(".filter((a) => reachedInterview(a))");
    expect(taskChat).toContain('" (Closed)"');
    expect(taskChat).not.toContain('a.status !== "Offer" && a.status !== "Accepted"');
    expect(taskChat).not.toContain("INTERVIEW_STAGE");
  });
});

describe("unknown routes get a real not-found page", () => {
  it("renders a plain message and a link home", () => {
    const html = renderToStaticMarkup(createElement(NotFound));
    expect(html).toContain("doesn");
    expect(html).toContain("exist");
    expect(html).toContain("Back to Pulse Find");
    expect(html).toContain('href="/"');
  });

  it("shares the TopBar and SiteFooter with the landing page", () => {
    expect(notFoundSrc).toContain("TopBar");
    expect(notFoundSrc).toContain("SiteFooter");
    expect(notFoundSrc).toContain('href="/"');
    expect(notFoundSrc).toContain("Back to Pulse Find");
    expect(notFoundSrc).toContain("navButton");
    // The dashboard btn object lives in a client module, so it is
    // undefined in this server component; the link uses navButton.
    expect(notFoundSrc).not.toContain("dashboard/ui");
  });
});

const LONG_JOB: DeckJob = {
  id: "j1",
  company: "Example Corp",
  title: "2027 Summer Intern, PhD, Agentic AI",
  location: "Seattle, WA",
  remote: false,
  url: "https://example.com/jobs/1",
  track: "Internship",
  tech: true,
  posted_at: null,
};

describe("job details title wraps instead of truncating", () => {
  it("shows the full title text", () => {
    const html = renderToStaticMarkup(createElement(JobDetails, { job: LONG_JOB }));
    expect(html).toContain("2027 Summer Intern, PhD, Agentic AI");
  });

  it("drops truncate from the title line but keeps it on the company line", () => {
    expect(detailsSrc).toContain('className="font-display text-lg font-extrabold leading-tight tracking-tight"');
    expect(detailsSrc).toContain("title={job.title}");
    expect(detailsSrc).not.toContain("truncate font-display text-lg");
    expect(detailsSrc).toContain('className="truncate text-sm font-semibold text-muted"');
  });
});

describe("connect step 2 says the format changes by tab", () => {
  it("shows the format note on the demo connect page", () => {
    const html = renderToStaticMarkup(createElement(DemoConnectAgent));
    expect(html).toContain(FORMAT_NOTE);
  });

  it("shows the same note on the signed-in connect page", () => {
    expect(demoConnect).toContain(FORMAT_NOTE);
    expect(signedInConnect).toContain(FORMAT_NOTE);
  });
});
