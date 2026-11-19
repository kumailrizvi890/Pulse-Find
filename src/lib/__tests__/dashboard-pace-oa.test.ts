import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { followUp, funnel, hasOA, reachedInterview, reachedOA, summarize, weekly } from "../metrics";
import { demoApplications } from "../demo-data";
import { emptyApplication, type Application } from "../types";

// Dashboard Weekly Pace + OA/Interview counts (Nov 16, 2026).
//
// What was wrong, all verified live + in code, long-standing logic rather
// than a regression:
//
// 1. Weekly Pace rendered but was all zeros on Monday Nov 16 (0 applied
//    this week, 91 last week). It had no loading state and no empty state,
//    so empty read as broken. The weekly goal (25 in Settings, 8 in the
//    demo) was never shown on the dashboard at all — no "0 / 25", no
//    progress bar. The 12-week WeeklyBars chart and weekly() existed but
//    were never rendered anywhere.
//
//    UPDATE (pace-range package, Nov 16): the pace window is now TRAILING
//    — the last 7 days instead of the calendar week — with a segmented
//    control for Last 7 days / Last 30 days / Last 12 months. The empty
//    state and goal line below now say "in the last 7 days" instead of
//    "this week". Everything else in this file is unchanged.
//
// 2. There were no dedicated OA/Interview sections — only funnel bars and
//    one stats tile. The "Interviews" tile read 0 because summarize()
//    summed interviews_done (0 on all 191 live rows), while 3 applications
//    sit at interview stage. The funnel's "Screening" step read 13 vs the
//    tracker's OA Received 10, because reachedOA folds interview-stage
//    applications in. The dashboard said "Screening"/"assessments"; the
//    tracker says "OA".
//
// The demo below is pinned to Monday 2026-11-16 (demoApplications takes an
// explicit date) so the counts are deterministic: 22 applications, 1 this
// week, 5 last week, 6 OAs, 6 at interview stage, funnel [22, 9, 6, 1].

const MONDAY = "2026-11-16";
const DEMO = demoApplications(MONDAY);

function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

const overview = read("components/dashboard/Overview.tsx");
const dashboard = read("components/dashboard/Dashboard.tsx");
const metricsSrc = read("lib/metrics.ts");
const exportSrc = read("lib/export.ts");

function app(over: Partial<Application> = {}): Application {
  return { ...emptyApplication(MONDAY), id: Math.random().toString(36).slice(2), company: "Acme", ...over };
}

describe("OA counting (hasOA)", () => {
  it("counts an application with oa_received, even at a later stage", () => {
    expect(hasOA(app({ status: "Interviewing", oa_received: true }))).toBe(true);
    expect(hasOA(app({ status: "Rejected", oa_received: true }))).toBe(true);
  });

  it("counts an OA status even when the flag is off", () => {
    expect(hasOA(app({ status: "OA Received", oa_received: false }))).toBe(true);
    expect(hasOA(app({ status: "OA Completed", oa_received: false }))).toBe(true);
  });

  it("does NOT count an interview-stage application with no OA", () => {
    // This is the distinction from reachedOA, which folds interview apps
    // in and is why the funnel read 13 while the tracker said 10 OAs.
    expect(hasOA(app({ status: "Interview Invited", oa_received: false }))).toBe(false);
    expect(hasOA(app({ status: "Recruiter Screen", oa_received: false, interviews_done: 1 }))).toBe(false);
    expect(hasOA(app({ status: "Applied", oa_received: false }))).toBe(false);
  });

  it("keeps reachedOA folding interview apps in (funnel semantics unchanged)", () => {
    expect(reachedOA(app({ status: "Interview Invited", oa_received: false }))).toBe(true);
    expect(reachedOA(app({ status: "Recruiter Screen", oa_received: false, interviews_done: 1 }))).toBe(true);
  });
});

describe("demo counts (Monday 2026-11-16)", () => {
  it("has 6 OAs and 6 at interview stage out of 22 applications", () => {
    expect(DEMO).toHaveLength(22);
    expect(DEMO.filter(hasOA).map((a) => a.company).sort()).toEqual([
      "Atlas Robotics",
      "Copperline",
      "Fernhill Capital",
      "Northwind Labs",
      "Saltmarsh Security",
      "Verdant Energy",
    ]);
    expect(DEMO.filter(reachedInterview).map((a) => a.company).sort()).toEqual([
      "Atlas Robotics",
      "Copperline",
      "Fernhill Capital",
      "Kestrel Fintech",
      "Oakline Coffee",
      "Tidewater Cloud",
    ]);
  });

  it("summarizes interviews as the stage count and OAs as the cumulative count", () => {
    const s = summarize(DEMO, MONDAY, 21);
    expect(s.total).toBe(22);
    expect(s.thisWeek).toBe(1); // Westfield Labs, applied today
    expect(s.interviews).toBe(6); // stage count, not interviews_done (which sums to 8)
    expect(s.oas).toBe(9); // reachedOA: the 6 OAs plus 3 interview apps with no OA
  });

  it("funnels the demo as [22, 9, 6, 1] and labels the second step OA", () => {
    expect(funnel(DEMO).map((f) => f.value)).toEqual([22, 9, 6, 1]);
    expect(funnel(DEMO).map((f) => f.label)).toEqual(["Applied", "OA", "Interview", "Offer"]);
  });

  it("buckets 22 applications over 12 weeks with 1 in the current week", () => {
    const w = weekly(DEMO, MONDAY);
    expect(w).toHaveLength(12);
    expect(w.reduce((s, b) => s + b.tech + b.other, 0)).toBe(22);
    expect(w[11].start).toBe("2026-11-16");
    expect(w[11].tech + w[11].other).toBe(1);
  });

  it("has 1 application this week and 5 last week", () => {
    const thisWeek = DEMO.filter((a) => a.date_applied && a.date_applied >= "2026-11-16").length;
    const lastWeek = DEMO.filter((a) => a.date_applied && a.date_applied >= "2026-11-09" && a.date_applied < "2026-11-16").length;
    expect(thisWeek).toBe(1);
    expect(lastWeek).toBe(5);
  });

  it("marks no demo interview as ghosted and one as closed", () => {
    const interviews = DEMO.filter(reachedInterview);
    expect(interviews.filter((a) => followUp(a, MONDAY, 21) === "ghosted")).toHaveLength(0);
    // Kestrel Fintech was rejected after its recruiter screen; its status
    // pill already says Rejected, so the card gives it no Active marker.
    expect(interviews.filter((a) => a.status === "Rejected")).toHaveLength(1);
    // The other five are still moving — including Oakline Coffee, whose
    // offer still needs an accept/decline decision, so it stays Active.
    const finished = ["Rejected", "Withdrawn", "Accepted"];
    expect(
      interviews.filter((a) => followUp(a, MONDAY, 21) !== "ghosted" && !finished.includes(a.status)),
    ).toHaveLength(5);
  });

  it("marks a quiet interview-stage application ghosted", () => {
    const quiet = app({ status: "Interview Invited", last_contact: "2026-09-09" });
    expect(followUp(quiet, MONDAY, 21)).toBe("ghosted");
    const fresh = app({ status: "Interview Invited", last_contact: "2026-11-15" });
    expect(followUp(fresh, MONDAY, 21)).not.toBe("ghosted");
  });
});

describe("Pace section", () => {
  it("shows an explicit empty state when nothing was applied in the last 7 days", () => {
    // Pace-range update: the window is trailing now, so the copy says
    // "in the last 7 days" (with the 7 days before that for context),
    // not "yet this week".
    expect(overview).toContain("pace.total === 0");
    expect(overview).toContain("No applications in the last 7 days");
    expect(overview).toContain("pace.prevTotal");
    expect(overview).toContain("days before that.");
  });

  it("shows the weekly goal as 'N / goal in the last 7 days' with a progress bar", () => {
    // The range wording is a ternary in source, so pin the two halves.
    expect(overview).toContain("{pace.total} / {rangeGoal}");
    expect(overview).toContain('"in the last 7 days"');
    expect(overview).toContain('role="progressbar"');
    expect(overview).toContain("Goal reached");
    expect(overview).toContain("to go");
  });

  it("renders the 12-week chart with the goal line", () => {
    expect(overview).toContain("WeeklyBars");
    expect(overview).toContain("weekly(apps, today)");
    expect(overview).toContain("Last 12 weeks");
    expect(overview).toContain("<WeeklyBars weeks={weeks} goal=");
  });

  it("receives the goal and the ghosted threshold as props", () => {
    expect(overview).toContain("weeklyGoal: number;");
    expect(overview).toContain("ghostDays: number;");
  });
});

describe("OA and Interview sections", () => {
  it("adds a dedicated OAs card driven by hasOA", () => {
    expect(overview).toContain('title="OAs"');
    expect(overview).toContain("apps.filter(hasOA)");
    expect(overview).toContain("No assessments yet.");
  });

  it("adds a dedicated Interviews card driven by reachedInterview", () => {
    expect(overview).toContain('title="Interviews"');
    expect(overview).toContain(".filter(reachedInterview)");
    expect(overview).toContain("No interviews yet.");
  });

  it("says the Interviews count reached the stage, not that it sits at it", () => {
    // The count is cumulative: it includes interview-stage applications
    // with no OA and rejected ones (demo Kestrel Fintech was rejected
    // after its recruiter screen), so "N at interview stage" overstates
    // it. The counting is unchanged, only the hint wording.
    expect(overview).toContain(
      "`${interviewList.length} reached interview stage · ${activeInterviews} active`",
    );
    expect(overview).not.toContain("at interview stage");
    expect(DEMO.filter(reachedInterview).map((a) => a.company)).toContain("Kestrel Fintech");
  });

  it("distinguishes ghosted interviews from active ones", () => {
    expect(overview).toContain('tone="danger">Ghosted</Tag>');
    expect(overview).toContain(">Active</span>");
    expect(overview).toContain('followUp(a, today, ghostDays) === "ghosted"');
  });

  it("opens the application when a listed company is tapped", () => {
    expect(overview).toContain("onClick={() => onOpen(a)}");
  });

  it("calls the step OA, not Screening or Assessment", () => {
    expect(overview).toContain('label: "OA"');
    expect(overview).not.toContain('"Screening"');
    expect(metricsSrc).toContain('{ label: "OA", value: apps.filter(reachedOA).length }');
    expect(metricsSrc).not.toContain('label: "Assessment"');
  });
});

describe("stats row", () => {
  it("shows the interview-stage count with an active-interview sub-line", () => {
    // Dashboard-numbers fix (Nov 18, 2026): the old sub showed an OA
    // count under Interviews, which was a copy error. The sub is now
    // the active-interview count — interview-stage applications that
    // have not finished (Rejected / Withdrawn / Accepted). Demo: 5 of 6.
    expect(overview).toContain(
      '<OverviewStat label="Interviews" value={`${sum.interviews}`} sub={`${activeInterviews} active`} />',
    );
    expect(overview).not.toContain("`${oaList.length} OAs`");
    expect(overview).toContain("activeInterviews");
  });
});

describe("wiring", () => {
  it("passes the goal and ghosted threshold from Settings into Overview", () => {
    expect(dashboard).toContain("weeklyGoal={settings.weekly_goal} ghostDays={settings.ghost_days}");
  });

  it("relabeled the export's interview line to match the new meaning", () => {
    expect(exportSrc).toContain('["At interview stage", sum.interviews]');
    expect(exportSrc).not.toContain("Interviews completed");
  });
});
