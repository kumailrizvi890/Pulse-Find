import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { demoApplications } from "../demo-data";
import { hasOA, reachedInterview } from "../metrics";

// Desktop audit, loop pass 59 (Thu Nov 19, 2026).
//
// 1. The OAs and Interviews panels listed CLOSED rows exactly like live
//    ones: Saltmarsh Security (Rejected) sat in the OAs panel under a
//    "6 with an assessment · 5 active" hint, and Kestrel Fintech
//    (Rejected) sat in the Interviews panel under "6 reached interview
//    stage". Only the status pill told them apart. Finished rows are now
//    muted with a Closed tag (Closed wins over Ghosted: once the outcome
//    is known the silence no longer matters), active OA rows get the
//    same Active tag the Interviews panel already had, and the
//    Interviews hint now reads the active split too. The funnel counts
//    are untouched — the funnel is deliberately cumulative/all-time
//    (pass 41), and an Offer still counts as active, as before.
// 2. The "Demo mode." banner scrolled up underneath the sticky header,
//    where the line read sliced mid-sentence through the translucent
//    header. The banner is now pinned just below the header instead.
//
// The demo below is pinned to Monday 2026-11-16 (demoApplications takes
// an explicit date) so the counts are deterministic: 22 applications,
// 6 OAs (5 active), 6 at interview stage (5 active).

const MONDAY = "2026-11-16";
const DEMO = demoApplications(MONDAY);
const FINISHED = ["Rejected", "Withdrawn", "Accepted"];

function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

const overview = read("components/dashboard/Overview.tsx");
const demoDashboard = read("app/demo/DemoDashboard.tsx");

describe("closed rows in the OAs and Interviews panels", () => {
  it("keeps the demo counts the fix reasons about", () => {
    expect(DEMO).toHaveLength(22);
    const oas = DEMO.filter(hasOA);
    expect(oas).toHaveLength(6);
    expect(oas.filter((a) => !FINISHED.includes(a.status))).toHaveLength(5);
    const interviews = DEMO.filter(reachedInterview);
    expect(interviews).toHaveLength(6);
    expect(interviews.filter((a) => !FINISHED.includes(a.status))).toHaveLength(5);
    // The closed rows in question are the demo's only finished ones.
    expect(oas.filter((a) => FINISHED.includes(a.status)).map((a) => a.company)).toEqual([
      "Saltmarsh Security",
    ]);
    expect(interviews.filter((a) => FINISHED.includes(a.status)).map((a) => a.company)).toEqual([
      "Kestrel Fintech",
    ]);
  });

  it("mutes finished OA rows and tags them Closed", () => {
    const oasPanel = overview.slice(overview.indexOf('<Panel title="OAs"'));
    expect(oasPanel).toContain('finished && "opacity-60"');
    expect(oasPanel).toContain('<Tag tone="muted">Closed</Tag>');
  });

  it("gives active OA rows the same Active tag the Interviews panel has", () => {
    const oasPanel = overview.slice(overview.indexOf('<Panel title="OAs"'));
    expect(oasPanel).toContain('<span className="text-xs font-medium text-good">Active</span>');
  });

  it("mutes finished interview rows, tags them Closed, and shows the active split in the hint", () => {
    const interviewsPanel = overview.slice(overview.indexOf('title="Interviews"'));
    expect(interviewsPanel).toContain('hint={`${interviewList.length} reached interview stage · ${activeInterviews} active`}');
    expect(interviewsPanel).toContain('finished && "opacity-60"');
    expect(interviewsPanel).toContain('<Tag tone="muted">Closed</Tag>');
    // Closed wins over Ghosted for a finished row.
    expect(interviewsPanel.indexOf('<Tag tone="muted">Closed</Tag>')).toBeLessThan(
      interviewsPanel.indexOf('<Tag tone="danger">Ghosted</Tag>'),
    );
  });

  it("does not change what the funnel counts", () => {
    // The funnel steps are built from the cumulative steps, not from
    // the panel lists — the panels only change how rows render.
    expect(overview).toContain('hint="All time"');
    expect(overview).toContain(
      "Each step counts every application that reached it, including ones that moved past it.",
    );
  });
});

describe("demo banner pinned under the sticky header", () => {
  it("sticks the banner just below the 71px header instead of scrolling under it", () => {
    expect(demoDashboard).toContain(
      "sticky top-[calc(env(safe-area-inset-top,0px)+71px)] z-20 border-b border-accent/20 bg-accent-soft",
    );
  });

  it("keeps the banner copy itself unchanged", () => {
    expect(demoDashboard).toContain("Demo mode.");
    expect(demoDashboard).toContain("Sample companies, nothing saved. Add, edit and import freely.");
  });
});
