import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Audit finding #8 (pass-45 desktop audit): /demo/jobs loses demo
// context, List view cannot save, top title truncated, "2 reviewed"
// unexplained, "Sign up to save jobs" misleading. Verified one by one
// against main 18b64e3, in code and in a local render (mock Supabase
// feed, desktop 1920px + phone 430px):
//   - demo context REPRODUCED: /jobs showed a bare TopBar (Demo + Sign
//     in only), no demo sections, no Ask Pulse, no badge.
//   - list save REPRODUCED: signed-out list rows rendered no buttons
//     at all, while the deck saved fine to localStorage.
//   - reviewed REPRODUCED: "1 reviewed · 2 left of 3" said nothing
//     about what counts as reviewed.
//   - sign-up copy REPRODUCED: the button claimed sign-up is what
//     enables saving, but the deck saves without an account.
//   - top title NOT reproduced: "Find openings", subtitle and button
//     measured untruncated at both widths, no page overflow. No fix.
//   - /demo/jobs 404 NOT reproduced: the pass-36 redirect to /jobs
//     already works. Guarded here, not changed.

const root = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(root, ...rel.split("/")), "utf8");
}

const board = read("app/jobs/JobsBoard.tsx");
const jobsPage = read("app/jobs/page.tsx");
const demoNav = read("app/demo/DemoNav.tsx");
const demoJobsPage = read("app/demo/jobs/page.tsx");

describe("/jobs keeps demo context for signed-out visitors", () => {
  it("renders the demo nav instead of the bare TopBar", () => {
    expect(jobsPage).toContain('import { DemoNav } from "../demo/DemoNav";');
    expect(jobsPage).toContain('<DemoNav badge="Live openings"');
    expect(jobsPage).not.toContain("from \"@/components/TopBar\"");
    expect(jobsPage).not.toContain("<TopBar");
  });

  it("passes the running tour step through, like every demo page", () => {
    expect(jobsPage).toContain("searchParams: Promise<{ tour?: string | string[] }>");
    expect(jobsPage).toContain("await searchParams");
    expect(jobsPage).toContain('tour={typeof sp.tour === "string" ? sp.tour : undefined}');
  });

  it("labels the board Live openings, never fictional sample data", () => {
    // The badge defaults to the sample-data label for the demo pages;
    // the jobs board overrides it, since its listings are live.
    expect(demoNav).toContain('badge = "Fictional sample data"');
    expect(demoNav).toContain("{badge}");
    expect(jobsPage).toContain('badge="Live openings"');
  });

  it("keeps Take the tour on one line at phone width", () => {
    // The sections row scrolls sideways on phones; without nowrap the
    // multi-word tour link wrapped to three lines and made the row
    // taller on every demo page (surfaced on /jobs by this pass).
    expect(demoNav).toContain('className="flex items-center gap-1.5 whitespace-nowrap"');
  });

  it("still gives signed-in users the tracker shell, untouched", () => {
    expect(jobsPage).toContain("<AppShell");
    expect(jobsPage).toContain('active="jobs"');
    expect(jobsPage).toContain("<JobsBoard userId={user.id} />");
    expect(jobsPage).toContain("<JobsBoard userId={null} />");
  });

  it("/demo/jobs still redirects to the shared board", () => {
    expect(demoJobsPage).toContain('redirect("/jobs")');
  });
});

describe("List view can save while signed out", () => {
  it("offers Save and Hide on signed-out list rows", () => {
    const list = board.slice(board.indexOf('view === "saved"'), board.indexOf("view === \"list\" && total"));
    expect(list).toContain('onClick={() => mark(j, "saved")}');
    expect(list).toContain('onClick={() => mark(j, "hidden")}');
    expect(list).toContain("{m === \"saved\" ? \"Saved\" : \"Save\"}");
  });

  it("keeps Lead and I applied signed-in only", () => {
    // Those two write to the account's pipeline and tracker, which a
    // signed-out visitor has no account for; saveLead / setMark would
    // silently no-op, so the buttons must not be offered at all.
    const signedOut = board.slice(board.indexOf("// Signed-out visitors can already save"));
    expect(signedOut).not.toContain("saveLead(j)");
    expect(signedOut).not.toContain('mark(j, "applied")');
  });

  it("still toasts on a list save, like the deck does", () => {
    const markFn = board.slice(board.indexOf("async function mark("), board.indexOf("async function swipe("));
    expect(markFn).toContain('toast(next === "saved" ? "Saved" : "Hidden")');
  });
});

describe("the reviewed count says what reviewed means", () => {
  it("glosses the count in place, on every width including touch", () => {
    expect(board).toContain("{reviewed} reviewed (saved, hidden or applied) · {leftToReview} left of {total}");
  });
});

describe("the sign-up button no longer claims saving needs an account", () => {
  it("says sign-up keeps picks, since saving works in this browser", () => {
    expect(board).toContain("Sign up to keep your picks");
    expect(board).not.toContain("Sign up to save jobs");
  });

  it("leaves the Saved tab wording alone (it was already honest)", () => {
    expect(board).toContain("Sign up to keep your picks and track applications");
    expect(board).toContain("Saved in this browser only.");
  });
});

describe("the top title was checked, not changed", () => {
  it("still renders the same heading and subtitle", () => {
    expect(board).toContain("Find openings");
    expect(board).toContain("Straight from the career pages of");
  });
});
