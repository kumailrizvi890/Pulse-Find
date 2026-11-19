import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Swipe-deck redesign (mockup, approved Nov 18): the deck gets the
// banner card, blank back shells, a Details button and a Saved tab, and
// a save lands in leads without a second manual step. The live feed
// carries no match score, pay, description, requirements or HR note, so
// none of those are rendered or invented — the card and the details
// panel show only what the posting actually has, and posting links are
// hidden outright when a job has no URL.
const deck = readFileSync(
  join(__dirname, "..", "..", "app", "jobs", "SwipeDeck.tsx"),
  "utf8",
);
const board = readFileSync(
  join(__dirname, "..", "..", "app", "jobs", "JobsBoard.tsx"),
  "utf8",
);
const details = readFileSync(
  join(__dirname, "..", "..", "app", "jobs", "JobDetails.tsx"),
  "utf8",
);

function fnBody(src: string, name: string, nextMarker: string): string {
  const start = src.indexOf(`async function ${name}(`);
  if (start === -1) throw new Error(`no ${name} function found`);
  const end = src.indexOf(nextMarker, start);
  return src.slice(start, end === -1 ? undefined : end);
}

describe("swipe deck redesign — banner card, blank back shells", () => {
  it("renders one front card only; the two cards behind it are blank shells, never text", () => {
    expect(deck.match(/<article/g)?.length).toBe(1);
    expect(deck).toContain('translate(7px, 5px) rotate(0.8deg)');
    expect(deck).toContain('translate(14px, 10px) rotate(1.6deg)');
    expect(deck).toContain('opacity: 0.8');
    expect(deck).toContain('opacity: 0.55');
    const shells = deck.slice(deck.indexOf("Blank offset shells"), deck.indexOf("<article"));
    expect(shells).not.toMatch(/\{[a-z]+\.(title|company|location)\}/);
    expect(shells).not.toContain("{top.");
  });

  it("gives the front card a 172px per-company banner with brand tile and posted pill", () => {
    expect(deck).toContain("h-[172px]");
    expect(deck).toContain("bannerStyle(top.company)");
    expect(deck).toContain("h-[52px] w-[52px]");
    expect(deck).toContain("Posted today");
    expect(deck).toContain("bg-accent");
  });

  it("keeps the card body in the mockup order and shows only fields the feed has", () => {
    const body = deck.slice(deck.indexOf("flex w-full flex-1 flex-col"));
    expect(body.indexOf("<h3")).toBeLessThan(body.indexOf("font-bold text-muted"));
    expect(deck).not.toContain("match");
    expect(deck).not.toContain("pay");
    expect(deck).not.toContain("salary");
    expect(deck).not.toContain("About the Role");
    expect(deck).not.toContain("Requirements");
  });

  it("hides the posting link when a job has no URL, instead of a dead link", () => {
    expect(deck).toContain("{top.url ? (");
    expect(deck).toContain("No posting link listed");
    expect(details).toContain("{job.url ? (");
    expect(details).toContain("No posting link listed for this role.");
    expect(deck).not.toContain("example.com");
    expect(details).not.toContain("example.com");
  });

  it("decides on the mockup drag numbers: 110px threshold, 480px fly-out over 280ms, 250ms snap-back", () => {
    expect(deck).toContain("const THRESHOLD = 110;");
    expect(deck).toContain("const FLY_OUT_PX = 480;");
    expect(deck).toContain("const FLY_OUT_MS = 280;");
    expect(deck).toContain("const SNAP_BACK_MS = 250;");
    expect(deck).toContain("offset / 24");
    expect(deck).toContain('leaving === "saved" ? 6 : -6');
    expect(deck).toContain("Math.min(Math.abs(offset) / 90, 1)");
  });

  it("has the four-button action row: 58px Pass, 46px raised Details, 46px Undo, 58px red Save", () => {
    expect(deck).toContain('aria-label="Pass"');
    expect(deck).toContain('aria-label="Details"');
    expect(deck).toContain('aria-label="Undo"');
    expect(deck).toContain('aria-label="Save"');
    expect(deck).toContain("h-[58px] w-[58px]");
    expect(deck).toContain("h-[46px] w-[46px] -translate-y-1.5");
    expect(deck).toContain("h-[46px] w-[46px]");
    expect(deck).toContain("bg-accent text-accent-ink");
    expect(deck).toContain("onDetails(top)");
  });

  it("clears the deck with a Review again button that re-reviews passed jobs", () => {
    expect(deck).toContain("Deck cleared");
    expect(deck).toContain("Review again");
    expect(deck).toContain("onReviewAgain");
    expect(deck).toContain("canReviewAgain");
    const again = fnBody(board, "reviewAgain", "function jumpToJob");
    expect(again).toContain('marks[j.id] === "hidden"');
    // One batched update: a setMark loop would rebuild from stale marks
    // and re-hide the jobs the earlier calls had just cleared.
    expect(again).toContain("delete nextMarks[j.id]");
    expect(again).toContain("setMarks(nextMarks)");
    expect(again).toContain('toast("Back to the start")');
  });
});

describe("swipe deck redesign — save flows into leads, tabs, details", () => {
  it("saves into leads from the swipe deck and from the list Save button, silently", () => {
    const swipe = fnBody(board, "swipe", "async function undo(");
    expect(swipe).toContain("await saveLead(job, true)");
    const mark = fnBody(board, "mark", "async function swipe(");
    expect(mark).toContain("await saveLead(job, true)");
    const saveLead = fnBody(board, "saveLead", "// debounce the search box");
    expect(saveLead).toContain("silent = false");
    expect(saveLead).toContain("if (!silent) toast");
    // The manual Lead button keeps its own loud path.
    expect(board).toContain("onClick={() => saveLead(j)}");
  });

  it("has Swipe / List / Saved tabs with a count, plus a reviewed progress bar", () => {
    expect(board).toContain('role="tablist"');
    expect(board).toContain("Saved (${savedList.length})");
    expect(board).toContain('role="progressbar"');
    expect(board).toContain("progressPct");
  });

  it("shows the details panel synced to the front card, beside the deck on desktop", () => {
    expect(board).toContain("lg:grid-cols-[minmax(0,430px)_minmax(0,336px)]");
    expect(board).toContain("<JobDetails job={topJob}");
    expect(board).toContain("hidden lg:block");
    expect(details).toContain("Job Details");
    expect(details).toContain("Apply Now");
    expect(details).toContain("Saving never sends an application.");
  });

  it("lets a list or saved row jump to that job in the deck", () => {
    expect(board).toContain("function jumpToJob(job: Job)");
    expect(board).toContain("setPinnedId(job.id)");
    expect(board).toContain('setView("swipe")');
    expect(board).toContain("pinnedId");
  });

  it("keeps the tour anchors the guided tour depends on", () => {
    expect(board).toContain('data-tour="jobs"');
    expect(board).not.toContain('data-tour="find-jobs"');
    expect(deck).toContain('data-tour="job-card"');
    expect(deck).toContain('data-tour="job-posting"');
    expect(deck).not.toContain('data-tour="job-save"');
  });

  it("announces a real swipe on the card, and nothing else announces one", () => {
    // The deck fires pulsefind:job-swiped only from a pointer drag
    // past the threshold, so the guided tour can complete on a swipe
    // without watching pointer math. The Save and Pass buttons and the
    // arrow keys decide through the same handler without firing it.
    expect(deck).toContain('import { JOB_SWIPED_EVENT, type JobSwipedDetail } from "@/lib/guided-tour"');
    expect(deck).toContain('new CustomEvent<JobSwipedDetail>(JOB_SWIPED_EVENT, { detail: { direction: "saved" } })');
    expect(deck).toContain('new CustomEvent<JobSwipedDetail>(JOB_SWIPED_EVENT, { detail: { direction: "hidden" } })');
    const pointerUp = deck.slice(deck.indexOf("onPointerUp="), deck.indexOf("onPointerCancel"));
    expect(pointerUp).toContain("JOB_SWIPED_EVENT");
    const buttons = deck.slice(deck.indexOf('aria-label="Pass"'));
    expect(buttons).not.toContain("JOB_SWIPED_EVENT");
    const keys = deck.slice(deck.indexOf("ArrowRight"), deck.indexOf("window.addEventListener(\"keydown\""));
    expect(keys).not.toContain("JOB_SWIPED_EVENT");
  });
});
