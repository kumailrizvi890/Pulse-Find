import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { funnel, hasOA, reachedInterview, reachedOA } from "../metrics";
import { demoApplications } from "../demo-data";

// Dashboard numbers you can trust (Nov 18, 2026, loop pass 41).
//
// A live desktop audit found dashboard numbers that did not reconcile on
// the page, all long-standing labelling/counting slips rather than
// regressions:
//
// 1. The "Application Funnel" panel hint read "Week of Nov 16 – Nov 22"
//    but the funnel counts are ALL-TIME — funnel() counts every
//    application. The hint now says "All time".
// 2. Nothing explained that each funnel step counts every application
//    that reached it, including ones that moved past it — which is why
//    the funnel OA (9) sat above the OAs panel (6): reachedOA folds
//    interview-stage applications in, and why Kestrel Fintech still
//    counts at Interview after being rejected (interviews_done 1).
// 3. The Interviews stat card's sub-line showed an OA count
//    ("6 OAs") under Interviews — a copy error. It now shows the
//    active-interview count ("5 active" on the demo data).
// 4. The OAs panel capped at 5 rows and hid the 6th entry behind an
//    "And 1 more" line; it now shows 6, matching the Interviews panel.
// 5. "Reviewed so far" on /jobs counted marks only on the loaded page
//    and divided by reviewed + loaded-queue, so with 2 pre-existing
//    saves it read 5% and jumped +3 per save while the text said
//    "264 left to review" of 266 total. It now counts every decision
//    and divides by the whole feed's total.
//
// The demo below is pinned to Monday 2026-11-16 (demoApplications takes
// an explicit date) so the counts are deterministic: 22 applications,
// funnel [22, 9, 6, 1], 6 OAs, 6 at interview stage, 5 active.

const MONDAY = "2026-11-16";
const DEMO = demoApplications(MONDAY);

function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

const overview = read("components/dashboard/Overview.tsx");
const jobsBoard = read("app/jobs/JobsBoard.tsx");
const networking = read("components/pipeline/NetworkingSection.tsx");
const sheet = read("components/dashboard/SheetView.tsx");

describe("funnel labelling", () => {
  it("labels the funnel all time, not a week", () => {
    expect(overview).toContain('hint="All time"');
    expect(overview).not.toContain("Week of ${fmtDate(monday)}");
  });

  it("explains the cumulative counting under the funnel", () => {
    expect(overview).toContain(
      "Each step counts every application that reached it, including ones that moved past it.",
    );
  });

  it("keeps the funnel itself cumulative (counting unchanged, only labelling)", () => {
    expect(funnel(DEMO).map((f) => f.value)).toEqual([22, 9, 6, 1]);
    expect(funnel(DEMO).map((f) => f.label)).toEqual(["Applied", "OA", "Interview", "Offer"]);
  });
});

describe("demo OA vs funnel OA reconciliation", () => {
  it("has 6 real OAs and 9 reached-OA, the gap being interview apps with no OA", () => {
    expect(DEMO.filter(hasOA)).toHaveLength(6);
    expect(DEMO.filter(reachedOA)).toHaveLength(9);
    const interviewNoOA = DEMO.filter((a) => reachedInterview(a) && !hasOA(a));
    expect(interviewNoOA).toHaveLength(3);
    expect(interviewNoOA.map((a) => a.company).sort()).toEqual([
      "Kestrel Fintech",
      "Oakline Coffee",
      "Tidewater Cloud",
    ]);
    expect(DEMO.filter(reachedOA).length - DEMO.filter(hasOA).length).toBe(3);
  });
});

describe("Interviews stat", () => {
  it("subs the active-interview count, not an OA count", () => {
    expect(overview).toContain('sub={`${activeInterviews} active`}');
    expect(overview).not.toContain("`${oaList.length} OAs`");
    expect(overview).toContain("activeInterviews");
  });

  it("counts 5 active interviews on the demo data (Kestrel is finished)", () => {
    const finished = ["Rejected", "Withdrawn", "Accepted"];
    const active = DEMO.filter(reachedInterview).filter((a) => !finished.includes(a.status));
    expect(DEMO.filter(reachedInterview)).toHaveLength(6);
    expect(active).toHaveLength(5);
    expect(active.map((a) => a.company)).not.toContain("Kestrel Fintech");
  });
});

describe("OAs panel", () => {
  it("lists 6 rows, matching the Interviews panel", () => {
    expect(overview).toContain("oaList.slice(0, 6)");
    expect(overview).toContain("oaList.length > 6");
    expect(overview).toContain("oaList.length - 6");
    expect(overview).not.toContain("oaList.slice(0, 5)");
  });
});

describe("jobs progress", () => {
  it("counts every decision and divides by the whole feed total, clamped at 100", () => {
    expect(jobsBoard).toContain("Object.keys(marks).length");
    expect(jobsBoard).toContain("total === null ? 0 : Math.min(100, Math.round((reviewed / total) * 100))");
    expect(jobsBoard).not.toContain("reviewed / (reviewed + queue.length)");
    // The "left to review" text is unchanged and total-based, so
    // reviewed + left = total once reviewed counts every decision.
    expect(jobsBoard).toContain("left to review");
    // Review-again still keys off the same reviewed count.
    expect(jobsBoard).toContain("canReviewAgain={reviewed > 0}");
  });
});

describe("one-line buttons", () => {
  it("keeps the networking '+ Add person' button on one line", () => {
    expect(networking).toContain('cx(btn.primary, "whitespace-nowrap")');
    expect(networking).toContain("+ Add person");
  });

  it("keeps the sheet 'Waiting on you' filter on one line", () => {
    expect(sheet).toContain("whitespace-nowrap");
    expect(sheet).toContain("Waiting on you");
  });
});
