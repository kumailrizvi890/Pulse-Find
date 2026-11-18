import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { demoApplications } from "../demo-data";
import { hasOA } from "../metrics";
import {
  answerGeneralQuestion,
  answerTaskQuestion,
  generalChatGreeting,
  taskChatGreeting,
} from "../task-chat";

// Pass-43 desktop audit fixes (Wed Nov 18, 2026, signed-out audit at
// 1919px). Each section pins the fix — or, for the two verify-first
// items that turned out not to be bugs, pins the code that proves it.

function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

const board = read("app/jobs/JobsBoard.tsx");
const connect = read("app/demo/connect/DemoConnectAgent.tsx");
const terminal = read("components/landing/TerminalDemo.tsx");
const bento = read("components/landing/Bento.tsx");
const showcase = read("components/landing/Showcase.tsx");
const overview = read("components/dashboard/Overview.tsx");
const sheet = read("components/dashboard/SheetView.tsx");
const dashboard = read("components/dashboard/Dashboard.tsx");
const drawer = read("components/dashboard/ApplicationDrawer.tsx");
const chatPanel = read("components/dashboard/TaskChatPanel.tsx");

const MONDAY = "2026-11-16";
const DEMO = demoApplications(MONDAY);

describe("jobs reviewed count agrees across Swipe, List and Saved", () => {
  it("derives left from the same reviewed count as the progress bar", () => {
    expect(board).toContain("const leftToReview = total === null ? null : Math.max(0, total - reviewed);");
    expect(board).toContain("{leftToReview ?? queue.length}</b> left to review");
  });

  it("no longer computes left from the loaded page's marks", () => {
    expect(board).not.toContain("(total ?? 0) - (jobs.length - queue.length)");
  });

  it("shows the count in words beside the bar, in every view", () => {
    expect(board).toContain("{reviewed} reviewed · {leftToReview} left of {total}");
  });
});

describe("jobs Details button on desktop", () => {
  it("scrolls the details panel into view on every width", () => {
    expect(board).not.toContain('matchMedia("(max-width: 1023px)")');
    const fn = board.slice(board.indexOf("function openDetails()"), board.indexOf("function changeView"));
    expect(fn).toContain("detailsRef.current?.scrollIntoView");
  });
});

describe("demo Connect step 2 wraps the Claude Code command", () => {
  it("wraps the snippet instead of scrolling it sideways", () => {
    expect(connect).toContain("whitespace-pre-wrap break-words");
  });

  it("still copies the exact snippet string, not the wrapped rendering", () => {
    expect(connect).toContain("copy(snippet(client, url, PLACEHOLDER_TOKEN), setSnippetCopied)");
  });
});

describe("landing names are demo companies", () => {
  it("types demo companies in the MCP terminal", () => {
    expect(terminal).toContain("Northwind Labs · OA received · due Nov 11");
    expect(terminal).toContain("Atlas Robotics · new application");
    expect(terminal).toContain('"Meridian Retail" · likely a fake job offer, nothing added');
    expect(terminal).not.toContain("Roblox");
    expect(terminal).not.toContain("Ramp");
    expect(terminal).not.toContain("Global Corp");
  });

  it("uses the same demo company in the Bento agent card", () => {
    expect(bento).toContain("Northwind Labs · OA received");
    expect(bento).not.toContain("Roblox");
  });
});

describe("landing copy speaks to the visitor", () => {
  it("says no reply since you applied", () => {
    expect(showcase).toContain("No reply since you applied");
    expect(showcase).not.toContain("No reply since they applied");
  });
});

describe("OAs panel carries the active count", () => {
  it("shows active OAs next to the cumulative count", () => {
    expect(overview).toContain("hint={`${oaList.length} with an assessment · ${activeOAs} active`}");
    expect(overview).toContain(
      'oaList.filter((a) => a.status !== "Rejected" && a.status !== "Withdrawn" && a.status !== "Accepted").length',
    );
  });

  it("counts 6 OAs and 5 active on the demo data", () => {
    const oas = DEMO.filter(hasOA);
    expect(oas).toHaveLength(6);
    expect(oas.map((a) => a.company).sort()).toEqual(
      ["Atlas Robotics", "Copperline", "Fernhill Capital", "Northwind Labs", "Saltmarsh Security", "Verdant Energy"].sort(),
    );
    const active = oas.filter((a) => a.status !== "Rejected" && a.status !== "Withdrawn" && a.status !== "Accepted");
    expect(active).toHaveLength(5);
    expect(active.map((a) => a.company)).not.toContain("Saltmarsh Security");
  });
});

describe("Ask Pulse no longer repeats the tracker link", () => {
  const generalCtx = {
    apps: DEMO,
    events: [],
    contacts: [],
    today: MONDAY,
    origin: "https://pulsefind-app.vercel.app",
    ghostDays: 21,
    weeklyGoal: 25,
    trackerPath: "/demo" as const,
  };
  const taskCtx = {
    app: DEMO[0],
    events: [],
    contacts: [],
    today: MONDAY,
    origin: "https://pulsefind-app.vercel.app",
  };

  it("keeps the tracker link out of both greetings", () => {
    expect(generalChatGreeting(generalCtx).links ?? []).toEqual([]);
    const taskLinks = taskChatGreeting(taskCtx).links ?? [];
    expect(taskLinks.some((l) => l.label === "Open your tracker")).toBe(false);
  });

  it("still links the tracker exactly once on a real answer", () => {
    const a = answerGeneralQuestion("what is waiting on me?", generalCtx);
    expect(a.links?.filter((l) => l.label === "Open your tracker")).toHaveLength(1);
    const t = answerTaskQuestion("what is the status", taskCtx);
    expect(t.links?.filter((l) => l.label === "Open your tracker")).toHaveLength(1);
  });
});

describe("verify-first: sheet Company column is sticky in code", () => {
  it("freezes the Company header and body cells", () => {
    expect(sheet).toContain('ci === 0 && "left-0 z-20 border-r"');
    expect(sheet).toContain('ci === 0 && "sticky left-0 z-[5] border-r border-line bg-surface font-semibold"');
  });
});

describe("verify-first: waiting Open plus chat is the intended design", () => {
  it("opens the task chat beside the drawer only where there is room", () => {
    expect(dashboard).toContain('window.innerWidth >= 1024');
    expect(dashboard).toContain("setChatOpen(true)");
  });

  it("leaves a gap between the chat dock and the drawer, never an overlap", () => {
    expect(drawer).toContain("max-w-[460px]");
    expect(chatPanel).toContain("lg:right-[476px]");
  });

  it("hides the chat when Hide chat is tapped", () => {
    expect(dashboard).toContain("onToggleChat={() => setChatOpen((o) => !o)}");
    expect(drawer).toContain('{chatOpen ? "Hide chat" : "Chat"}');
  });
});
