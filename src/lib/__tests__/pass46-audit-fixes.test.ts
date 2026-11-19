import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Two small gaps from the pass-45 desktop audit (Nov 18, 4:22-5:25pm PT):
// (3) The guided tour's step counter read "0/8" on step 1 (a completed
//     count) while the dots row said "Step 1 of 8", and the tour chrome
//     (recap heading, badges line, footer hint) was lowercase. The
//     counter now shows the current step, and the chrome is capitalized.
//     Pulse's own step lines stay lowercase on purpose: the TourStep
//     comment calls them "plain lowercase friend voice".
// (6) The dashboard Networking Follow-ups cards were not clickable at
//     all (signed-in visitors only had a bare "Open" link to the page).
//     The whole card is now a link to the Networking page deep-linked
//     to that contact (?contact=<id> opens their edit form on arrival).
//     The one-line note truncation from pass 36 is untouched on purpose.
function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

describe("tour step counter matches the step label", () => {
  const tourHost = read("components/GuidedTour.tsx");

  it("shows the current step, not the completed count", () => {
    expect(tourHost).toContain("{index + 1}/{TOUR_STEPS.length}");
    expect(tourHost).not.toContain("{progress.steps.length}/{TOUR_STEPS.length}");
    // The dots row says the same thing out loud.
    expect(tourHost).toContain("Step ${index + 1} of ${TOUR_STEPS.length}");
  });

  it("keeps the completed count on the progress ring only", () => {
    expect(tourHost).toContain("`${progress.steps.length} of ${TOUR_STEPS.length} steps done`");
  });
});

describe("tour chrome copy is capitalized, voice lines stay lowercase", () => {
  const tourHost = read("components/GuidedTour.tsx");
  const tourLib = read("lib/guided-tour.ts");

  it("capitalizes the recap heading, badges line and footer hint", () => {
    expect(tourHost).toContain('"You did all of it"');
    expect(tourHost).toContain('"Here is what you did"');
    expect(tourHost).toContain("Badges: {earnedBadges");
    expect(tourHost).toContain('"Moving on"');
    expect(tourHost).toContain('"Do the thing and the tour moves on"');
    expect(tourHost).not.toContain('"you did all of it"');
    expect(tourHost).not.toContain('"here is what you did"');
    expect(tourHost).not.toContain(">badges: {");
    expect(tourHost).not.toContain('"moving on"');
    expect(tourHost).not.toContain('"do the thing and the tour moves on"');
  });

  it("leaves Pulse's step lines in the lowercase friend voice", () => {
    // The "plain lowercase friend voice" comment wraps across two lines
    // in guided-tour.ts, so pin the two halves separately.
    expect(tourLib).toContain("plain lowercase");
    expect(tourLib).toContain("friend voice");
    expect(tourLib).toContain('line: "this is home. tap Open on the first waiting task');
  });

  it("does not touch the first-visit auto-start", () => {
    expect(tourHost).toContain("router.replace(tourStartHref())");
    expect(tourHost).toContain('if (pathname !== "/demo" || step !== null || dismissed()) return;');
  });
});

describe("networking follow-ups cards open the contact", () => {
  const overview = read("components/dashboard/Overview.tsx");
  const networking = read("components/pipeline/NetworkingSection.tsx");

  it("links the whole card to the Networking page at that contact", () => {
    expect(overview).toContain("?contact=${encodeURIComponent(c.id)}");
    expect(overview).toContain('aria-label={`Open ${c.person_name} on the Networking page`}');
    expect(overview).toContain('href={`${networkingHref}?contact=');
    // The old bare per-card "Open" link to the page is gone: the card
    // itself is the link now, in demo mode too.
    expect(overview).not.toContain('className={cx(btn.ghost, "mt-2")}');
  });

  it("keeps the one-line note truncation (pass 36 design)", () => {
    expect(overview).toContain("{c.notes &&");
    expect(overview).toContain("truncate text-xs text-faint");
  });

  it("opens the deep-linked contact's edit form on the Networking page", () => {
    expect(networking).toContain('new URLSearchParams(window.location.search).get("contact")');
    expect(networking).toContain("d.find((c) => c.id === id)");
    expect(networking).toContain("setForm({ open: true, editing: match })");
  });
});
