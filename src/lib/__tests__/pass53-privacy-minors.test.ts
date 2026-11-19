import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Pass-53 minors (Nov 18 desktop audit findings #13 + #14):
// (13) /privacy had a bare logo-only TopBar, no footer, and no way back
// anywhere but the logo. It now gets the landing nav + the shared footer.
// (14a) A same-day last contact rendered "Nov 18 0d" in the All
// applications table (Westfield Labs seeds contact: 0, i.e. today).
// (14b) The status filter listed "Accepted (0)" as a pickable option that
// only ever showed the empty state.
// (14c) "View all 5 waiting" scroll-jumps to the list with no way back —
// the jump is a scroll, not a navigation, so browser back does not help.
// (14d) The Response Rate card paired 45% with "2 rejected", but a
// rejection IS a response under hasResponded, so the pairing read as if
// the rejections were the ones who never replied.
// Plus the pass-52 JobsBoard re-indent: hunk 4d landed 2 spaces shallow
// and line 457 carried trailing whitespace (whitespace only, no semantics).
function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

describe("/privacy nav + footer", () => {
  it("gives /privacy the landing nav links", () => {
    const privacy = read("app/privacy/page.tsx");
    expect(privacy).toContain('href="/jobs"');
    expect(privacy).toContain('href="/demo"');
    expect(privacy).toContain("GitHubLink");
    expect(privacy).toContain('href="/login"');
    expect(privacy).toContain('href="/demo/connect"');
    expect(privacy).toContain("navButton");
  });

  it("renders the shared footer and pins it to the bottom on short pages", () => {
    const privacy = read("app/privacy/page.tsx");
    expect(privacy).toContain("<SiteFooter />");
    expect(privacy).toContain("min-h-dvh");
    expect(privacy).toContain("flex-1");
  });

  it("keeps the privacy copy itself untouched", () => {
    const privacy = read("app/privacy/page.tsx");
    expect(privacy).toContain("Last updated November 5, 2026");
    expect(privacy).toContain("Pulse Find does not read your inbox");
    expect(privacy).toContain("The demo uses invented companies");
  });
});

describe("shared site footer", () => {
  it("has the brand line and the same five links as the landing footer had", () => {
    const footer = read("components/SiteFooter.tsx");
    expect(footer).toContain("Pulse Find");
    expect(footer).toContain("Kumail Rizvi");
    expect(footer).toContain('href="/jobs"');
    expect(footer).toContain('href="/app/connect"');
    expect(footer).toContain('href="/demo"');
    expect(footer).toContain("github.com/kumailrizvi890/Pulse-Find");
    expect(footer).toContain('href="/privacy"');
  });

  it("is the one footer the landing page renders", () => {
    const landing = read("app/page.tsx");
    expect(landing).toContain("<SiteFooter />");
    expect(landing).not.toContain("Built by");
  });

  it("shares the top-bar button style instead of duplicating it", () => {
    const topBar = read("components/TopBar.tsx");
    expect(topBar).toContain("export const navButton");
    const landing = read("app/page.tsx");
    expect(landing).toContain("navButton");
    expect(landing).not.toContain("const navButton");
  });
});

describe("same-day last contact", () => {
  it("reads 'today' instead of '0d' in the applications table", () => {
    const dashboard = read("components/dashboard/Dashboard.tsx");
    expect(dashboard).toContain('quiet === 0 ? "today"');
    expect(dashboard).not.toContain("{quiet}d</span>");
  });

  it("still shows the day count for older contacts", () => {
    const dashboard = read("components/dashboard/Dashboard.tsx");
    expect(dashboard).toContain("`${quiet}d`");
  });

  it("reproduces on the demo seed: Westfield Labs was contacted today", () => {
    const demo = read("lib/demo-data.ts");
    expect(demo).toContain('company: "Westfield Labs"');
    expect(demo).toContain("contact: 0");
  });
});

describe("status filter empty options", () => {
  it("disables zero-count statuses instead of offering the empty state", () => {
    const dashboard = read("components/dashboard/Dashboard.tsx");
    expect(dashboard).toContain("disabled={(statusCounts[s] ?? 0) === 0}");
  });

  it("reproduces on the demo seed: Accepted is a status with zero rows", () => {
    const types = read("lib/types.ts");
    expect(types).toContain('"Accepted"');
    const demo = read("lib/demo-data.ts");
    expect(demo).not.toContain('status: "Accepted"');
  });

  it("keeps the option listed so the status stays discoverable", () => {
    const dashboard = read("components/dashboard/Dashboard.tsx");
    expect(dashboard).not.toContain("statusCounts[s] === 0 ? null");
  });
});

describe("waiting jump way back", () => {
  it("adds a Back to top button at the bottom of the applications list", () => {
    const dashboard = read("components/dashboard/Dashboard.tsx");
    expect(dashboard).toContain("Back to top");
    expect(dashboard).toContain("scrollToTop");
    expect(dashboard).toContain("window.scrollTo({ top: 0");
  });

  it("respects reduced motion on the way back, like the jump down does", () => {
    const dashboard = read("components/dashboard/Dashboard.tsx");
    expect(dashboard).toContain("prefers-reduced-motion: reduce");
  });

  it("only shows the button when there is a list to come back from", () => {
    const dashboard = read("components/dashboard/Dashboard.tsx");
    expect(dashboard).toContain("!loading && rows.length > 0");
  });
});

describe("response rate sub", () => {
  it("explains the rate with the responded count, not the rejected count", () => {
    const overview = read("components/dashboard/Overview.tsx");
    expect(overview).toContain("`${response.count} of ${sum.total} responded`");
    expect(overview).not.toContain("`${sum.rejected} rejected`");
  });

  it("says 'No replies yet' when nothing has responded", () => {
    const overview = read("components/dashboard/Overview.tsx");
    expect(overview).toContain('"No replies yet"');
  });
});

describe("JobsBoard re-indent (pass 52 nit)", () => {
  it("indents hunk 4d to the package pin", () => {
    const board = read("app/jobs/JobsBoard.tsx");
    expect(board).toContain("                    // the deck (their picks live in this browser only),");
    expect(board).toContain("                    <>");
    expect(board).toContain('                      <button className={btn.ghost} onClick={() => mark(j, "saved")}');
    expect(board).toContain("                    </>");
    expect(board).toContain("                  )}");
  });

  it("has no trailing whitespace left", () => {
    const board = read("app/jobs/JobsBoard.tsx");
    expect(board).not.toMatch(/ +$/m);
  });
});
