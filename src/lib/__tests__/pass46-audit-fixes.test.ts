import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Two small gaps from the pass-45 desktop audit (Nov 18, 4:22-5:25pm PT):
// (3) was the guided tour's step counter (a completed count) while the
//     dots row said "Step 1 of 7", and the tour chrome was lowercase.
//     Both are gone with the old tour: the Nov 19 redesign replaced the
//     quest coach with the tour window (TourWindow.tsx, 8 steps, tap
//     Next), so those pins were deleted, not moved.
// (6) The dashboard Networking Follow-ups cards were not clickable at
//     all (signed-in visitors only had a bare "Open" link to the page).
//     The whole card is now a link to the Networking page deep-linked
//     to that contact (?contact=<id> opens their edit form on arrival).
//     The one-line note truncation from pass 36 is untouched on purpose.
function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

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
