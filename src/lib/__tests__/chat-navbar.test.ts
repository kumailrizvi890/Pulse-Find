import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The chat used to be reachable only by opening a "Waiting on you" task
// (auto-open on wide screens, a small "Chat" toggle in the drawer header
// on phones). There was no way to open it from the navbar or the
// dashboard itself, so a visitor who wanted help had to find a task
// first. Now there are two visible entries: an "Ask Pulse" link in the
// demo navbar and an "Ask Pulse" button in the dashboard header, both
// opening the same compact dock in general mode (whole tracker, no task
// attached). Pin the wiring so it cannot silently disappear.

const root = join(__dirname, "..", "..");
const demoNav = readFileSync(join(root, "app", "demo", "DemoNav.tsx"), "utf8");
const demoPage = readFileSync(join(root, "app", "demo", "page.tsx"), "utf8");
const demoDashboard = readFileSync(join(root, "app", "demo", "DemoDashboard.tsx"), "utf8");
const dashboard = readFileSync(join(root, "components", "dashboard", "Dashboard.tsx"), "utf8");
const panel = readFileSync(join(root, "components", "dashboard", "TaskChatPanel.tsx"), "utf8");

describe("demo navbar Ask Pulse entry", () => {
  it("links to the demo dashboard with the chat trigger", () => {
    // A plain ?chat=1 link: the tour is an overlay now, not a route,
    // so there is no tour step to carry along anymore.
    expect(demoNav).toContain('href="/demo?chat=1"');
    expect(demoNav).not.toContain("?tour=");
    expect(demoNav).toContain("Ask Pulse");
  });

  it("carries the glowing pulse dot, like the other brand marks", () => {
    expect(demoNav).toContain('from "@/components/PulseBrand"');
    expect(demoNav).toContain("<PulseDot />");
  });

  it("sits in the top bar, next to Jobs and Sign in", () => {
    const topBar = demoNav.slice(demoNav.indexOf("<TopBar"), demoNav.indexOf("</TopBar>"));
    expect(topBar).toContain("Ask Pulse");
    expect(topBar).toContain('href="/jobs"');
    expect(topBar).toContain('href="/login"');
  });
});

describe("demo ?chat=1 plumbing", () => {
  it("the demo page reads the chat query and hands it to the dashboard", () => {
    expect(demoPage).toContain("searchParams");
    expect(demoPage).toContain('sp.chat === "1"');
    expect(demoPage).toContain('openChat={sp.chat === "1"}');
    expect(demoPage).not.toContain("tour");
  });

  it("DemoDashboard passes the trigger to the Dashboard and clears it", () => {
    expect(demoDashboard).toContain("openGeneralChat={openChat}");
    // Clearing the trigger keeps the next click a fresh navigation to
    // ?chat=1 instead of a no-op link to the current URL.
    expect(demoDashboard).toContain('router.replace("/demo", { scroll: false })');
    expect(demoDashboard).not.toContain("tour");
  });
});

describe("dashboard Ask Pulse affordance", () => {
  it("has a visible Ask Pulse button in the header, next to Add application", () => {
    expect(dashboard).toContain("Ask Pulse");
    expect(dashboard).toContain("<PulseDot />");
    const header = dashboard.slice(dashboard.indexOf("+ Add application"), dashboard.indexOf("+ Add application") + 600);
    expect(header).toContain("Ask Pulse");
  });

  it("opens the general chat and closes the drawer and task chat first", () => {
    expect(dashboard).toContain("generalChatOpen");
    expect(dashboard).toContain("openGeneralChatPanel");
    expect(dashboard).toContain('general={{ apps, ghostDays: settings.ghost_days, weeklyGoal: settings.weekly_goal }}');
    expect(dashboard).toContain('key="chat-general"');
  });

  it("opens the general chat once on a fresh ?chat=1 edge, not on every render", () => {
    expect(dashboard).toContain("openGeneralChat?: boolean");
    expect(dashboard).toContain("prevOpenGeneralRef");
    expect(dashboard).toContain("if (openGeneralChat && !prevOpenGeneralRef.current) openGeneralChatPanel();");
  });

  it("waits for the tracker to load before opening, so the greeting never claims nothing is waiting on an empty list", () => {
    expect(dashboard).toContain("generalChatPending");
    expect(dashboard).toContain('if (state === "ready") setGeneralChatOpen(true);');
    expect(dashboard).toContain("if (generalChatPending && state === \"ready\")");
  });

  it("opening a task closes the general chat, so the two panels never stack", () => {
    const openTask = dashboard.slice(dashboard.indexOf("const openTask"), dashboard.indexOf("const openGeneralChatPanel"));
    expect(openTask).toContain("setGeneralChatOpen(false)");
  });
});

describe("task chat general mode", () => {
  it("accepts a general context instead of a task", () => {
    expect(panel).toContain("general?: { apps: Application[]; ghostDays: number; weeklyGoal: number }");
    expect(panel).toContain("GENERAL_CHAT_SUGGESTIONS");
    expect(panel).toContain("generalChatGreeting");
    expect(panel).toContain("answerGeneralQuestion");
    expect(panel).toContain("buildGeneralAgentHandoff");
  });

  it("docks at the right edge in general mode, beside the drawer in task mode", () => {
    expect(panel).toContain('isGeneral ? "lg:right-4" : "lg:right-[476px]"');
  });

  it("keeps the backdrop off the panel in both modes", () => {
    expect(panel).toContain('isGeneral ? "lg:right-[432px]" : "lg:right-[876px]"');
  });

  it("labels itself as the whole tracker in general mode", () => {
    expect(panel).toContain('"Your whole tracker"');
    expect(panel).toContain('aria-label={isGeneral ? "Chat about your tracker"');
    expect(panel).toContain('placeholder={isGeneral ? "Ask about your tracker…"');
  });

  it("keeps the outside-click close, the thinking delay and Talk to Agent in both modes", () => {
    expect(panel).toContain('aria-label="Close chat"');
    expect(panel).toContain("onClick={onClose}");
    expect(panel).toContain("}, 350);");
    expect(panel).toContain("Talk to Agent");
  });
});

describe("task-click path still works", () => {
  it("opening a task still renders the task chat with that application", () => {
    expect(dashboard).toContain("application={drawer.editing}");
    expect(dashboard).toContain("drawer.open && drawer.editing && chatOpen");
    expect(dashboard).toContain("key={`chat-${drawer.editing.id}`}");
  });
});
