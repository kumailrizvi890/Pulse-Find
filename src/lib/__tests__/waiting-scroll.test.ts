import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The Overview's "View all N waiting items" button used to only flip the
// filter to "Waiting on you": the filtered list sits below the fold (the
// Overview grid plus the stats row are ~980px tall on desktop, ~2060px on
// phones), so the click looked like it did nothing. The handler now also
// scrolls the "All applications" panel into view and moves focus to it.
// Pin the wiring so the scroll cannot silently drop out again.
const dashboard = readFileSync(
  join(__dirname, "..", "..", "components", "dashboard", "Dashboard.tsx"),
  "utf8",
);
const overview = readFileSync(
  join(__dirname, "..", "..", "components", "dashboard", "Overview.tsx"),
  "utf8",
);

function showWaitingBody(): string {
  const m = dashboard.match(/const showWaiting = useCallback\(\(\) => \{([\s\S]*?)\}, \[\]\);/);
  if (!m) throw new Error("no showWaiting handler found in Dashboard.tsx");
  return m[1];
}

describe("view all waiting scrolls to the list", () => {
  it("the Overview button still calls the onShowWaiting prop", () => {
    expect(overview).toContain("View all {queue.length} waiting items");
    expect(overview).toContain("onClick={onShowWaiting}");
  });

  it("the dashboard wires the button to a handler, not a bare filter flip", () => {
    expect(dashboard).toContain("onShowWaiting={showWaiting}");
    expect(dashboard).not.toContain('onShowWaiting={() => setFilter("action")}');
  });

  it("the handler filters to waiting AND scrolls the list into view", () => {
    const body = showWaitingBody();
    expect(body).toContain('setFilter("action")');
    expect(body).toContain("allAppsRef.current");
    expect(body).toContain("scrollIntoView");
    expect(body).toContain('block: "start"');
  });

  it("the handler moves focus to the list for keyboard and screen readers", () => {
    const body = showWaitingBody();
    expect(body).toContain("focus({ preventScroll: true })");
  });

  it("the scroll respects reduced motion instead of always animating", () => {
    const body = showWaitingBody();
    expect(body).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
    expect(body).toContain('behavior: reduceMotion ? "auto" : "smooth"');
  });

  it("the All applications panel is a focusable scroll target clear of the sticky header", () => {
    const m = dashboard.match(
      /<div ref=\{allAppsRef\} tabIndex=\{-1\} className="([^"]*)">\s*<Panel\s*\n\s*title="All applications"/,
    );
    if (!m) throw new Error("no allAppsRef wrapper around the All applications panel");
    expect(m[1]).toContain("scroll-mt-32");
    expect(m[1]).toContain("outline-none");
  });
});
