import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { demoApplications } from "../demo-data";
import { applyFilter, CLOSED, followUp, reachedInterview } from "../metrics";
import { SavedJobTitle } from "../../app/jobs/JobsBoard";

// Desktop audit, loop pass 65 (Thu Nov 19, 2026, ~3pm PT).
//
// 1. An Offer counted as closed in one place and active in another:
//    the dashboard Closed filter listed Oakline Coffee (Offer) with the
//    two rejections and the withdrawal (Closed 4, Active 18), while the
//    Interviews panel tagged it "Offer Active" and "Waiting on you"
//    still listed "Accept or decline the offer". An offer awaiting
//    accept/decline is definitionally still open, so Offer left CLOSED:
//    Closed 3, Active 19, everywhere (filter, follow-up flag, waiting
//    list, quiet-days). Accepted stays closed: the offer was taken.
// 2. Short values truncated with no way to expand them: the sheet's
//    40-character toggle missed every shorter truncated value ("Backend
//    Engineer Intern" is 23 characters and already ellipsised in the
//    narrow columns), and a saved title under 40 characters truncated
//    too once the View posting button took its space. The toggle now
//    also appears whenever the rendered text actually overflows its
//    cell (scrollWidth past clientWidth); the 40-character rule stays
//    as the fallback for server renders, where there is no layout to
//    measure. The title tooltips pass 63/64 added were already there
//    and are untouched; the Job Details title and the list-view
//    location had none, so they get one.
// 3. Jobs Undo is disabled with no hint that it only covers swipes
//    from this session: the button gets a title tooltip and the hint
//    under the deck says so in grey.
// 4. Networking header said "the next step you owe each of them" but
//    Sam Ortiz has no next step by design (connect only). The copy now
//    says the next step for each one that has one.
// 5. Landing install heading scrolled half under the sticky header on
//    the #getApp anchor jump: the section gets scroll-mt-24, so the
//    heading lands fully visible.
//
// Dropped after verification, not built (see DEPLOY.md): the sheet
// "Show more bleeding through the sticky header" (the header is solid
// rgb(22,21,29) at z-10/z-20 and elementFromPoint proves it paints
// over the button at every scroll position) and the connect step-4
// prompt "loading scrolled down" (scrollTop is 0 on fresh load, on
// reload, and on back-navigation).
//
// The demo below is pinned to Monday 2026-11-16 (demoApplications takes
// an explicit date) so the counts are deterministic: 22 applications.

const MONDAY = "2026-11-16";
const DEMO = demoApplications(MONDAY);
const FINISHED = ["Rejected", "Withdrawn", "Accepted"];

function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

const sheet = read("components/dashboard/SheetView.tsx");
const board = read("app/jobs/JobsBoard.tsx");
const details = read("app/jobs/JobDetails.tsx");
const deck = read("app/jobs/SwipeDeck.tsx");
const networking = read("components/pipeline/NetworkingSection.tsx");
const install = read("components/landing/InstallSection.tsx");

describe("an Offer counts as active everywhere", () => {
  it("leaves Offer out of CLOSED", () => {
    expect(CLOSED).toEqual(["Rejected", "Accepted", "Withdrawn"]);
    expect(CLOSED).not.toContain("Offer");
  });

  it("counts Closed 3 and Active 19 on the demo, Oakline active", () => {
    expect(DEMO).toHaveLength(22);
    const closed = applyFilter(DEMO, "closed", MONDAY, 21);
    expect(closed.map((a) => a.company).sort()).toEqual([
      "Kestrel Fintech",
      "Ridgeview Bank",
      "Saltmarsh Security",
    ]);
    const active = applyFilter(DEMO, "active", MONDAY, 21);
    expect(active).toHaveLength(19);
    expect(active.map((a) => a.company)).toContain("Oakline Coffee");
    expect(closed.map((a) => a.company)).not.toContain("Oakline Coffee");
  });

  it("keeps the Offer in the waiting list with a follow-up flag, not a closed row", () => {
    const oakline = DEMO.find((a) => a.company === "Oakline Coffee")!;
    expect(oakline.status).toBe("Offer");
    expect(oakline.action_needed).toBe("Accept or decline the offer");
    // Contacted yesterday: waiting, not ghosted, and no longer exempt
    // from the flag the way closed rows are.
    expect(followUp(oakline, MONDAY, 21)).toBe("waiting");
    // The Interviews panel's finished predicate still excludes it, so
    // it keeps its Active tag there too.
    expect(reachedInterview(oakline)).toBe(true);
    expect(FINISHED).not.toContain(oakline.status);
    const interviews = DEMO.filter(reachedInterview);
    expect(interviews).toHaveLength(6);
    expect(interviews.filter((a) => !FINISHED.includes(a.status))).toHaveLength(5);
  });
});

describe("short truncated text gets a Show more toggle when it overflows", () => {
  it("bases the sheet toggle on real overflow as well as length", () => {
    expect(sheet).toContain("const CELL_EXPAND_LIMIT = 40;");
    expect(sheet).toContain("value.length > CELL_EXPAND_LIMIT");
    expect(sheet).toContain("el.scrollWidth > el.clientWidth + 1");
    expect(sheet).toContain("const showToggle = expanded || long || overflowing;");
  });

  it("bases the saved-title toggle on real overflow as well as length", () => {
    expect(board).toContain("const SAVED_TITLE_LIMIT = 40;");
    expect(board).toContain("title.length > SAVED_TITLE_LIMIT");
    expect(board).toContain("el.scrollWidth > el.clientWidth + 1");
    expect(board).toContain("const showToggle = expanded || long || overflowing;");
  });

  it("still offers no toggle for a short title in a server render, where there is no layout to measure", () => {
    const html = renderToStaticMarkup(
      createElement(SavedJobTitle, { title: "2027 Mission Operations Engineer", expanded: false, onToggle: () => {} }),
    );
    expect(html).toContain("2027 Mission Operations Engineer");
    expect(html).toContain('title="2027 Mission Operations Engineer"');
    expect(html).not.toContain("<button");
  });

  it("still offers a toggle for a long title in a server render", () => {
    const html = renderToStaticMarkup(
      createElement(SavedJobTitle, {
        title: "Product Design (Mechanical Engineering) Intern",
        expanded: false,
        onToggle: () => {},
      }),
    );
    expect(html).toContain("Show more");
  });

  it("gives the Job Details title and company a hover tooltip", () => {
    expect(details).toContain("title={job.title}");
    expect(details).toContain("title={job.company}");
  });

  it("gives the list-view location a hover tooltip", () => {
    expect(board).toContain("title={j.location}");
  });
});

describe("jobs Undo says what it covers", () => {
  it("titles the Undo button and says under the deck that it is this session only", () => {
    expect(deck).toContain('title="Undo your last swipe. Only swipes from this session can be undone"');
    expect(deck).toContain("Undo only covers swipes from this session.");
  });
});

describe("networking header stays true for connect-only contacts", () => {
  it("no longer claims a next step for everyone", () => {
    expect(networking).toContain("the next step for each one that has one");
    expect(networking).not.toContain("the next step you owe each of them");
  });
});

describe("landing install heading lands fully visible", () => {
  it("gives the install section anchor a scroll margin above the sticky header", () => {
    expect(install).toContain('id="getApp"');
    expect(install).toContain('className="install scroll-mt-24"');
  });
});
