import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// PWA nav fixes (Nov 19 2026, from Kumail's iPhone): the installed
// app's sticky header and tab bar were translucent, so tracker rows
// showed through the top edge and the greeting read sliced in half
// behind the tabs; the signed-in tab order is Tracker, Sheet, Find
// jobs, Networking, Leads, Connect agent (Find jobs ahead of Leads,
// overriding the Nov 18 Leads-first order); and the About page copy
// carries no em dashes, per the standing zero-em-dash rule.

const root = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(root, ...rel.split("/")), "utf8");

const shell = read("components/AppShell.tsx");
const topBar = read("components/TopBar.tsx");
const about = read("components/landing/AboutLanding.tsx");
const install = read("components/landing/InstallSection.tsx");
const demoDashboard = read("app/demo/DemoDashboard.tsx");

describe("signed-in tab order: Find jobs ahead of Leads", () => {
  it("lists Tracker, Sheet, Find jobs, Networking, Leads, Connect agent in that order", () => {
    const order = ["Tracker", "Sheet", "Find jobs", "Networking", "Leads", "Connect agent"];
    const positions = order.map((label) => shell.indexOf(`label: "${label}"`));
    for (const pos of positions) expect(pos).toBeGreaterThan(-1);
    for (let i = 1; i < positions.length; i += 1) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });

  it("links Find jobs to /jobs and Leads to /app/leads", () => {
    expect(shell).toContain('{ href: "/jobs", label: "Find jobs", key: "jobs" }');
    expect(shell).toContain('{ href: "/app/leads", label: "Leads", key: "leads" }');
  });
});

describe("sticky shell bars are solid, never see-through", () => {
  it("the signed-in header is opaque and covers the status-bar zone", () => {
    // top-0 plus the safe-area inset as padding (not as an offset):
    // offsetting the header down left a see-through strip above the
    // pulse line where scrolled content showed through on the
    // installed app. Desktop is unchanged: the inset is 0 there.
    expect(shell).toContain('className="sticky top-0 z-30 border-b border-line bg-bg pt-[env(safe-area-inset-top,0px)]"');
    expect(shell).not.toContain("bg-bg/85");
    expect(shell).not.toContain("backdrop-blur");
  });

  it("the tab bar is opaque and still sticks at header height", () => {
    expect(shell).toContain('className="sticky top-[calc(env(safe-area-inset-top,0px)+71px)] z-20 border-b border-line bg-bg"');
    expect(shell).not.toContain("bg-bg/85");
  });

  it("the public TopBar gets the same solid-header fix", () => {
    expect(topBar).toContain('className="sticky top-0 z-30 border-b border-line bg-bg pt-[env(safe-area-inset-top,0px)]"');
    expect(topBar).not.toContain("bg-bg/85");
    expect(topBar).not.toContain("backdrop-blur");
  });

  it("the demo banner stays solid at the same offset", () => {
    expect(demoDashboard).toContain('className="sticky top-[calc(env(safe-area-inset-top,0px)+71px)] z-20 border-b border-accent/20 bg-accent-soft"');
  });
});

describe("About page copy has no em dashes", () => {
  it("neither AboutLanding nor InstallSection contains one, copy or comments", () => {
    expect(about).not.toContain("—");
    expect(install).not.toContain("—");
  });

  it("keeps the reworded About lines", () => {
    expect(about).toContain("people lined up to talk to, and an AI agent");
    expect(about).toContain("behind a single home, refreshed daily");
    expect(about).toContain("newest first. Swipe to save");
    expect(about).toContain("color-coded by stage: red Applied, amber OA, green Interview");
    expect(about).toContain("update stages. Set it up once with a single prompt.");
    expect(about).toContain("Add Pulse Find to your home screen. No app store, about 10 seconds.");
    expect(about).toContain("I&apos;m Kumail, a computer science senior at UW Bothell");
    expect(about).toContain("the system I wanted, so I built it");
    expect(about).toContain("#1 for &quot;internship&quot;</b>, first");
    expect(about).toContain("green in CI on every push</b>:");
    expect(about).toContain("Nothing ships on a hope. Every");
  });

  // Nov 24 2026: the install section went phones-only, so there are no
  // install copy lines left at all. The two phones carry it: the Share
  // sheet screenshot (alt text names Add to Home Screen) and the home
  // screen mock with the Pulse Find icon.
  it("has no install copy lines left: the section is two phones", () => {
    for (const line of [
      "Add to Home Screen: show me how",
      "Tap the Pulse Find icon on your home screen. It",
      "Tap Install. About 10",
      "No worries, you can install anytime from your browser menu.",
      "straight into your dashboard",
      ", full-screen, no browser bars, no typing a URL",
      "Tap the <b>Share</b> button, then <b>Add to Home Screen</b>",
      "is on your home screen. One tap, you&apos;re in.",
    ]) {
      expect(install).not.toContain(line);
    }
    expect(install).toContain('src="/landing/ios-add-to-home.jpg"');
    expect(install).toContain('src="/icons/icon-512.png"');
  });
});
