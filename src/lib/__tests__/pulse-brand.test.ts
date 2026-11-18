import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The PULSE branding pass (Nov 15 2026), v2: the v1 touches were too
// subtle to notice, so v2 turns the neon up — the logo mark is unboxed
// (bare glowing waveform, no red tile), the glow is a real halo, and
// the waiting panel carries a bell with a glowing count badge. One
// shared heartbeat waveform, a breathing logo mark, a bigger animated
// status dot, a brighter heartbeat loader, a visible red glow, a
// notification bell, a stronger login watermark, branded empty states,
// red hovers, and a footer signature. Everything reuses the existing
// red tokens only — no new colors, no layout changes. Pin the pieces
// so a later edit cannot silently drop the branding, re-box the logo,
// or sneak in a new palette.
function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

const brand = read("components/PulseBrand.tsx");
const css = read("app/globals.css");
const brandCss = css.slice(css.indexOf("PULSE brand touches"), css.indexOf("SITE-WIDE TEXTURED 3D BACKGROUND"));

function extractPath(src: string): string {
  const constMatch = src.match(/MARK_PATH = "([^"]+)"/);
  if (constMatch) return constMatch[1];
  // Match a <path d="...">, not id="..." (the icon's filter id="neon"
  // contains d="neon").
  const m = src.match(/<path d="([^"]+)"/);
  if (!m) throw new Error("no SVG path found");
  return m[1];
}

describe("pulse brand marks", () => {
  it("exports one shared waveform, status dot, heartbeat loader, bell and empty-state line", () => {
    expect(brand).toContain("export function PulseWaveform");
    expect(brand).toContain("export function PulseDot");
    expect(brand).toContain("export function PulseHeartbeat");
    expect(brand).toContain("export function NotifyBell");
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

  it("keeps the logo mark unboxed: no tile, neon layers, bright core", () => {
    const logo = read("components/Logo.tsx");
    expect(logo).not.toContain("<rect");
    expect(logo).not.toContain('fill="var(--accent)"');
    expect(logo).toContain("pf-mark");
    expect(logo).toContain('strokeOpacity="0.3"');
    expect(logo).toContain('stroke="var(--accent-ink)"');
  });

  it("keeps the favicon and the logo mark on the same tall-spike path, both unboxed", () => {
    const logo = read("components/Logo.tsx");
    const icon = read("app/icon.svg");
    const logoPath = extractPath(logo);
    expect(logoPath).toContain("L17 5");
    expect(extractPath(icon)).toBe(logoPath);
    expect(icon).not.toContain("<rect");
    expect(icon).toContain("<filter");
    expect(icon).toContain('stroke="#fd585d"');
  });

  it("breathes the logo mark visibly", () => {
    const logo = read("components/Logo.tsx");
    expect(logo).toContain("pf-breathe");
    expect(css).toContain("@keyframes pf-breathe");
    expect(css).toContain("scale(1.08)");
  });
});

describe("pulse brand css", () => {
  it("defines the dot ring, heartbeat draw, glow, badge, bell and nav glow", () => {
    expect(css).toContain("@keyframes pf-dot-ring");
    expect(css).toContain("@keyframes pf-heartbeat-draw");
    expect(css).toContain(".pf-glow");
    expect(css).toContain(".pf-badge");
    expect(css).toContain(".pf-bell");
    expect(css).toContain(".pf-bell-count");
    expect(css).toContain(".pf-nav-glow");
    expect(css).toContain(".pf-mark");
    expect(css).toContain(".pf-wave-glow");
  });

  it("makes the glow a real halo, not a whisper", () => {
    expect(css).toContain("0 0 24px rgb(248 52 62 / 0.5)");
    expect(css).toContain("0 0 10px rgb(248 52 62 / 0.9)");
  });

  it("makes the status dot bigger with a stronger ring", () => {
    expect(css).toContain("height: 10px");
    expect(css).toContain("scale(3)");
    expect(css).toContain("0 0 10px rgb(248 52 62 / 1)");
  });

  it("uses only the existing red in the brand section — no new palette", () => {
    // Scoped to the brand section: the site-wide texture section below
    // deliberately adds the preview's violet-tinted edge glows (approved
    // Nov 16 2026) — that exception lives in the site section only.
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
  it("puts the dot and the bell on the waiting panel, with a visible glow when items wait", () => {
    const overview = read("components/dashboard/Overview.tsx");
    expect(overview).toContain("<PulseDot />");
    expect(overview).toContain("<NotifyBell");
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

  it("watermarks the login screen visibly, behind the form", () => {
    const login = read("app/login/page.tsx");
    expect(login).toContain("opacity-[0.13]");
    expect(login).toContain("pointer-events-none");
    expect(login).toContain("relative z-10");
  });

  it("signs the footer with the mark and wordmark", () => {
    const home = read("app/page.tsx");
    expect(home).toContain("<PulseMark className=\"h-4 w-4\" />");
    expect(home).toContain("Pulse Find</span>");
  });

  it("lists all 7 capabilities in the landing hero, each led by a pulse dot", () => {
    const home = read("app/page.tsx");
    for (const item of [
      "Reads your email to track every application and reply, so each stage shows up without you logging it.",
      "Puts the replies, assessments and forms that need you at the top, with how long you have left.",
      "Flags the companies that haven't replied in 21 days, so you know when to follow up.",
      "Sets a weekly application goal and shows how far along you are.",
      "Finds live internships straight from company career pages.",
      "Connects to Claude, Cursor and Copilot through MCP, so your agent can read and update your tracker for you.",
      "Keeps your real application data private, visible only to you.",
    ]) {
      expect(home).toContain(item);
      expect(item).not.toContain("—");
    }
    expect(home).toContain("HERO_CAPABILITIES");
    expect(home).toContain("<PulseDot");
    expect(home).toContain("sm:grid-cols-2");
  });

  it("has no intro paragraph under the hero headline: the bullets carry the explanation", () => {
    const home = read("app/page.tsx");
    // The old paragraph's two distinctive fragments must be gone entirely.
    expect(home).not.toContain("puts the assessments, replies and forms that need you at the top");
    expect(home).not.toContain("went quiet so you know when to follow up");
    // The headline, the four buttons and the no-sign-up line stay.
    expect(home).toContain("Know what&apos;s waiting");
    expect(home).toContain("Try the live demo");
    expect(home).toContain("Find jobs");
    expect(home).toContain("Self host");
    expect(home).toContain("Connect your agents");
    expect(home).toContain("No sign-up needed for the demo or the job board.");
  });

  it("sends Connect your agent to the demo Connect instructions instead of a dead self-link", () => {
    const home = read("app/page.tsx");
    // The button used to link to /app/connect (signed-out visitors hit
    // the login page), then to #mcp — but it sits inside the #mcp
    // section itself, so that link went nowhere at all. It now goes to
    // the demo Connect page, where a visitor can read the four steps
// and copy the token and agent prompt without signing in.
    expect(home).toContain('<Link href="/demo/connect" className={primary}>Connect your agent</Link>');
    expect(home).toContain('<section id="mcp" className="border-t border-line bg-surface">');
    expect(home).toContain("Let your own AI agent keep it current");
    expect(home).toContain("MCP server");
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
