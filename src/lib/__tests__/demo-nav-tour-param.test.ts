import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The top-nav "Ask Pulse" link used to be a plain href="/demo?chat=1".
// On the tour's chat step the coach says "tap Ask Pulse in the top
// bar", so a visitor did exactly that, the tour=chat param was dropped
// at navigation, and the chat-clear in DemoDashboard replaced the URL
// with plain /demo: the tour was stranded with no coach and no ring,
// even after the answer arrived. The dashboard's own Ask Pulse button
// never had this bug (it opens the panel in place, no navigation).
// Now the nav link carries the running tour step along, and the
// chat-clear keeps it, so the tour survives the chat step.

const root = join(__dirname, "..", "..");
const demoNav = readFileSync(join(root, "app", "demo", "DemoNav.tsx"), "utf8");
const demoPage = readFileSync(join(root, "app", "demo", "page.tsx"), "utf8");
const demoDashboard = readFileSync(join(root, "app", "demo", "DemoDashboard.tsx"), "utf8");
const floatingButton = readFileSync(join(root, "components", "FloatingPulseButton.tsx"), "utf8");

const DEMO_PAGES = [
  "app/demo/sheet/page.tsx",
  "app/demo/leads/page.tsx",
  "app/demo/networking/page.tsx",
  "app/demo/connect/page.tsx",
];
const TOUR_PROP = '<DemoNav tour={typeof sp.tour === "string" ? sp.tour : undefined} />';

describe("demo navbar Ask Pulse link keeps the tour alive", () => {
  it("carries the running tour step on the Ask Pulse link when one is present", () => {
    expect(demoNav).toContain("export function DemoNav({ tour }: { tour?: string })");
    expect(demoNav).toContain('href={tour ? `/demo?tour=${tour}&chat=1` : "/demo?chat=1"}');
  });

  it("still links to plain ?chat=1 when no tour is running", () => {
    // The no-tour branch is the same link visitors have always had:
    // same destination, same chat trigger, nothing else changes.
    expect(demoNav).toContain('"/demo?chat=1"');
    expect(demoNav).toContain("Ask Pulse");
  });

  it("the demo dashboard page hands its tour param to the nav", () => {
    expect(demoPage).toContain(TOUR_PROP);
  });

  it("every demo sub-page reads its tour param and hands it to the nav", () => {
    // The nav renders on every demo page, and the tour runs across
    // them, so each page has to pass the param through: a visitor
    // mid-tour on the sheet who taps Ask Pulse keeps the tour instead
    // of losing it (the tour's own route check walks them back to
    // their step once the chat closes).
    for (const page of DEMO_PAGES) {
      const src = readFileSync(join(root, page), "utf8");
      expect(src).toContain("searchParams: Promise<{ tour?: string | string[] }>");
      expect(src).toContain("await searchParams");
      expect(src).toContain(TOUR_PROP);
    }
  });
});

describe("the chat-clear half still preserves the tour", () => {
  it("DemoDashboard keeps tour= when it clears ?chat=1, so the pair cannot half-break", () => {
    // The link above is only one half of the fix: if the clear dropped
    // tour, the tour would strand the moment the chat opened, exactly
    // as before. Both halves are pinned here together.
    expect(demoDashboard).toContain("router.replace(tour ?");
    expect(demoDashboard).toContain("`/demo?tour=${tour}`");
  });
});

describe("the floating chat button is not a second strand path", () => {
  it("hides while a tour runs, so its own ?chat=1 fallback never fires mid-tour", () => {
    expect(floatingButton).toContain('searchParams.get("tour") !== null');
    expect(floatingButton).toContain("if (tourActive");
    expect(floatingButton).toContain("return null");
  });
});
