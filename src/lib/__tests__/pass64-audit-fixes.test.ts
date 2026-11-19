import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { refreshLabel, SavedJobTitle } from "../../app/jobs/JobsBoard";
import { contactResponseRate } from "../metrics";
import { demoContacts } from "../pipeline";

const root = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const networking = read("src/components/pipeline/NetworkingSection.tsx");
const overview = read("src/components/dashboard/Overview.tsx");
const leads = read("src/components/pipeline/LeadsSection.tsx");
const jobsBoard = read("src/app/jobs/JobsBoard.tsx");
const pass63 = read("src/lib/__tests__/pass63-sheet-truncation-firstpaint.test.ts");

const TODAY = "2026-11-19";
const LONG_TITLE = "Product Design (Mechanical Engineering) Intern";
const SHORT_TITLE = "Software Engineer Intern";

// Pass-64 audit, findings 2 + 3 (verified live Nov 19 ~1pm PT, then
// checked against the code — the audit's premise was partly wrong, see
// below; what survives is a real honesty gap: the rate line never said
// what "responded" means, and the Networking page never stated its own
// total, so a visitor could not reconcile it with the dashboard's
// "See all 4 contacts" link).
//
// What the code actually says: the demo has exactly 4 contacts (Priya,
// Marcus, Elena, Sam Ortiz — no Sofia, no James Chen anywhere in the
// repo; those two names were test contacts added in the audit browser
// session, not seed data). 3 of the 4 count as responded under Kumail's
// Nov 18 status-based call — Priya and Elena ("Connected — …") and Sam
// Ortiz ("Connected") all moved forward; Marcus ("Messaged — awaiting
// reply") did not. So "3 of 4 responded · 75%" was already arithmetically
// right; the fix names the denominator ("of 4 people") and explains the
// rule in a hover title, instead of redefining anything.
describe("networking response rate names its denominator", () => {
  it("the demo really has 4 contacts and 3 of them count as responded", () => {
    const contacts = demoContacts(TODAY);
    expect(contacts).toHaveLength(4);
    expect(contactResponseRate(contacts)).toEqual({ responded: 3, total: 4, rate: 0.75 });
  });

  it("the page line reads 'of N people responded', so the total is visible", () => {
    expect(networking).toContain("{responseRate.responded} of {responseRate.total} people responded");
  });

  it("the line explains the forward-movement rule on hover", () => {
    expect(networking).toContain("counts as responded once their status moves forward");
    expect(networking).toContain("Still waiting on a first reply does not count");
  });

  it("the dashboard link counts the same contacts the page totals", () => {
    expect(overview).toContain("See all {orderedContacts.length} contacts");
    expect(overview).toContain("const shownContacts = orderedContacts.slice(0, 3);");
  });
});

// Pass-64 audit, finding 4: the Leads page used two labels for the same
// state — a Queued lead already in the tracker read "Already tracked"
// while an Applied lead read "In tracker". One label now: "In tracker",
// matching the Jobs board's tag for the same state.
describe("leads use one label for the tracked state", () => {
  it("Applied and already-tracked leads share one In tracker branch", () => {
    expect(leads).toContain('l.status === "Applied" || isAlreadyTracked(trackedApps, l) ? (');
    expect(leads).toContain('<Tag tone="muted">In tracker</Tag>');
  });

  it("no Already tracked label survives anywhere in the leads page", () => {
    expect(leads).not.toContain("Already tracked");
    expect(leads.match(/<Tag tone="muted">In tracker<\/Tag>/g)).toHaveLength(1);
  });
});

// Pass-64 audit, finding 5: the Jobs Saved tab truncated long titles
// ("Product Design (Mechanical En…") with no way to read the full title.
// The title now carries the same treatment the sheet uses: the full text
// as a hover tooltip, plus a Show more toggle past 40 characters.
describe("saved jobs show the full title", () => {
  it("renders a short title in full with a tooltip and no toggle", () => {
    const html = renderToStaticMarkup(
      createElement(SavedJobTitle, { title: SHORT_TITLE, expanded: false, onToggle: () => {} }),
    );
    expect(html).toContain(SHORT_TITLE);
    expect(html).toContain(`title="${SHORT_TITLE}"`);
    expect(html).toContain("truncate");
    expect(html).not.toContain("Show more");
    expect(html).not.toContain("<button");
  });

  it("offers a Show more toggle for a long title", () => {
    const html = renderToStaticMarkup(
      createElement(SavedJobTitle, { title: LONG_TITLE, expanded: false, onToggle: () => {} }),
    );
    expect(html).toContain(`title="${LONG_TITLE}"`);
    expect(html).toContain("Show more");
    expect(html).toContain('aria-expanded="false"');
  });

  it("expands a long title in place and offers Show less", () => {
    const html = renderToStaticMarkup(
      createElement(SavedJobTitle, { title: LONG_TITLE, expanded: true, onToggle: () => {} }),
    );
    expect(html).toContain(LONG_TITLE);
    expect(html).toContain("Show less");
    expect(html).toContain("break-words");
    expect(html).not.toContain("truncate");
  });

  it("the Saved tab wires the toggle to one expanded title at a time", () => {
    expect(jobsBoard).toContain("<SavedJobTitle");
    expect(jobsBoard).toContain("expanded={expandedSavedTitle === j.id}");
    expect(jobsBoard).toContain("const [expandedSavedTitle, setExpandedSavedTitle] = useState<string | null>(null);");
  });
});

// Pass-64 audit, finding 7: the Jobs page read "Last refresh today"
// with no time, although the refresh timestamp is already in the
// component (meta.refreshed). Same-day refreshes now read
// "today at 2:35 pm"; older ones keep the existing ago() wording.
describe("last refresh carries the time when it was today", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 19, 14, 35, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the time for a same-day refresh", () => {
    expect(refreshLabel(new Date(2026, 10, 19, 13, 5, 0).toISOString())).toBe("today at 1:05 pm");
  });

  it("keeps the day wording for older refreshes", () => {
    expect(refreshLabel(new Date(2026, 10, 18, 9, 0, 0).toISOString())).toBe("1d ago");
    expect(refreshLabel(new Date(2026, 10, 14, 9, 0, 0).toISOString())).toBe("5d ago");
  });

  it("returns empty for no refresh timestamp", () => {
    expect(refreshLabel(null)).toBe("");
  });

  it("the Jobs page renders the refresh line through refreshLabel", () => {
    expect(jobsBoard).toContain("Last refresh {refreshLabel(meta.refreshed)}.");
  });
});

// Pass-63 fold-in: the landed pass63 test file carried an extra closing
// quote in the chips-slice search (indexOf('className="ml-auto"')), so
// the slice ran to -1 and the assertion was weaker than intended. The
// corrected search ends at the real class, pinning the chips slice.
describe("pass63 chips-slice correction", () => {
  it("searches for className=\"ml-auto without the extra closing quote", () => {
    expect(pass63).toContain(`sheet.indexOf('className="ml-auto')`);
    expect(pass63).not.toContain(`sheet.indexOf('className="ml-auto"')`);
  });
});

// Pass-64 audit, finding 6, dropped — verified against the code, not
// built: no "1 of 6 OAs are scheduled" / "1 of 6 Interviews are
// scheduled" copy exists anywhere in the app. The OAs panel hint reads
// "6 with an assessment · 5 active" and the Interviews hint "6 reached
// interview stage · 5 active", both already singular-safe. There is
// nothing to fix, so no test pins the quoted copy.
