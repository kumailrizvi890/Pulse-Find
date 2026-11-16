import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The PULSE branding pass (Nov 15 2026): one shared heartbeat waveform,
// a breathing logo mark, an animated status dot, a heartbeat loader, a
// faint red glow, a notification badge, a login watermark, branded empty
// states, red hovers, and a footer signature. Everything reuses the
// existing red tokens only — no new colors, no layout changes. Pin the
// pieces so a later edit cannot silently drop the branding or sneak in
// a new palette.
function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

const brand = read("components/PulseBrand.tsx");
const css = read("app/globals.css");
const brandCss = css.slice(css.indexOf("PULSE brand touches"));

function extractPath(src: string): string {
  const m = src.match(/d="([^"]+)"/);
  if (!m) throw new Error("no SVG path found");
  return m[1];
}

describe("pulse brand marks", () => {
  it("exports one shared waveform, status dot, heartbeat loader and empty-state line", () => {
    expect(brand).toContain("export function PulseWaveform");
    expect(brand).toContain("export function PulseDot");
    expect(brand).toContain("export function PulseHeartbeat");
    expect(brand).toContain("export function WaitingSignal");
  });

  it("draws the waveform from the existing accent token, tall spike and all", () => {
    expect(brand).toContain('stroke="var(--accent)"');
    expect(brand).toContain("M0 22 H34 L38 15 L42 29 L46 9 L50 35 L54 17 L58 22 H120");
  });

  it("renders the status dot and the loader from the brand CSS classes", () => {
    expect(brand).toContain('className={cx("pf-dot"');
    expect(brand).toContain("pf-heartbeat-line");
    expect(brand).toContain('role="status"');
  });

  it("keeps the favicon and the logo mark on the same tall-spike path", () => {
    const logo = read("components/Logo.tsx");
    const icon = read("app/icon.svg");
    const logoPath = extractPath(logo);
    expect(logoPath).toContain("L17 5");
    expect(extractPath(icon)).toBe(logoPath);
    expect(icon).toContain('fill="#fd585d"');
  });

  it("breathes the logo mark gently", () => {
    const logo = read("components/Logo.tsx");
    expect(logo).toContain("pf-breathe");
    expect(css).toContain("@keyframes pf-breathe");
  });
});

describe("pulse brand css", () => {
  it("defines the dot ring, heartbeat draw, glow, badge and nav glow", () => {
    expect(css).toContain("@keyframes pf-dot-ring");
    expect(css).toContain("@keyframes pf-heartbeat-draw");
    expect(css).toContain(".pf-glow");
    expect(css).toContain(".pf-badge");
    expect(css).toContain(".pf-nav-glow");
  });

  it("uses only the existing red in the brand section — no new palette", () => {
    for (const banned of ["cyan", "teal", "sky", "emerald", "indigo", "violet", "purple", "blue"]) {
      expect(brandCss.toLowerCase()).not.toContain(banned);
    }
    expect(brandCss).toContain("253 88 93");
  });

  it("respects reduced motion for every animation", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});

describe("pulse brand placements", () => {
  it("puts the dot and badge on the waiting panel, with a faint glow when items wait", () => {
    const overview = read("components/dashboard/Overview.tsx");
    expect(overview).toContain("<PulseDot />");
    expect(overview).toContain("<NotifyBadge");
    expect(overview).toContain("pf-glow");
    expect(overview).toContain("<PulseHeartbeat");
  });

  it("uses the status dot for AI thinking in the task chat, not the old three dots", () => {
    const chat = read("components/dashboard/TaskChatPanel.tsx");
    expect(chat).toContain("<PulseDot />");
    expect(chat).not.toContain("pf-thinking-dot");
  });

  it("marks notifications with the dot in the toast", () => {
    const ui = read("components/dashboard/ui.tsx");
    expect(ui).toContain("<PulseDot />");
    expect(ui).toContain("export function NotifyBadge");
  });

  it("loads the swipe deck with the heartbeat, not just text", () => {
    const deck = read("app/jobs/SwipeDeck.tsx");
    expect(deck).toContain("<PulseHeartbeat");
    expect(deck).toContain("Loading openings…");
  });

  it("watermarks the login screen faintly, behind the form", () => {
    const login = read("app/login/page.tsx");
    expect(login).toContain("opacity-[0.06]");
    expect(login).toContain("pointer-events-none");
    expect(login).toContain("relative z-10");
  });

  it("signs the footer with the mark and wordmark", () => {
    const home = read("app/page.tsx");
    expect(home).toContain("<PulseMark className=\"h-4 w-4\" />");
    expect(home).toContain("Pulse Find</span>");
  });

  it("keeps red hovers on nav links and tabs", () => {
    expect(read("components/TopBar.tsx")).toContain("hover:text-accent");
    const shell = read("components/AppShell.tsx");
    expect(shell).toContain("hover:text-accent");
    expect(shell).toContain("pf-nav-glow");
  });
});

describe("pulse empty states", () => {
  it("says 'Waiting for your next signal.' in the existing empty states", () => {
    // The line itself lives in WaitingSignal; each empty state renders it.
    expect(brand).toContain("Waiting for your next signal.");
    for (const f of [
      "components/dashboard/Dashboard.tsx",
      "components/dashboard/Overview.tsx",
      "components/pipeline/LeadsSection.tsx",
      "app/jobs/SwipeDeck.tsx",
    ]) {
      expect(read(f)).toContain("<WaitingSignal");
    }
  });
});
