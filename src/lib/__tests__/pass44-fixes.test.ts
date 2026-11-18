import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  answerGeneralQuestion,
  answerTaskQuestion,
  type GeneralChatContext,
  type TaskChatContext,
} from "../task-chat";
import type { Application, Contact, TrackerEvent } from "../types";

// Pass-44 fixes (Wed Nov 18, 2026). Two small routing/wrap gaps found by
// the pass-43 audit follow-up, plus the metrics.ts blank-line nit.
// 1. The task chat hardcoded /app in its tracker link, so a demo visitor
//    asking about a task landed on the login page. The general chat
//    already threaded trackerPath; the task chat now mirrors it.
// 2. The signed-in ConnectAgent step-2 command still scrolled sideways
//    (overflow-x-auto) while the demo twin already wraps.

function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

const taskChatSrc = read("lib/task-chat.ts");
const panel = read("components/dashboard/TaskChatPanel.tsx");
const agent = read("app/app/connect/ConnectAgent.tsx");
const demoAgent = read("app/demo/connect/DemoConnectAgent.tsx");

const TODAY = "2026-11-16";
const ORIGIN = "https://pulsefind-app.vercel.app";

const APP: Application = {
  id: "app-1",
  company: "Northwind Labs",
  role: "Software Engineer Intern",
  track: "Internship",
  status: "OA Received",
  date_applied: "2026-11-10",
  last_contact: "2026-11-12",
  oa_received: true,
  interviews_done: 0,
  latest_update: "HackerRank invite arrived by email",
  link: "https://example.com/jobs/northwind-swe-intern",
  notes: "",
  action_needed: "Finish the HackerRank",
  action_due: "2026-11-20",
};

function taskCtx(trackerPath: "/app" | "/demo"): TaskChatContext {
  return {
    app: APP,
    events: [] as TrackerEvent[],
    contacts: [] as Contact[],
    today: TODAY,
    origin: ORIGIN,
    trackerPath,
  };
}

function generalCtx(trackerPath: "/app" | "/demo"): GeneralChatContext {
  return {
    apps: [APP],
    events: [] as TrackerEvent[],
    contacts: [] as Contact[],
    today: TODAY,
    origin: ORIGIN,
    ghostDays: 21,
    weeklyGoal: 25,
    trackerPath,
  };
}

function trackerHref(links: { label: string; href: string }[] | undefined): string {
  const link = (links ?? []).find((l) => l.label === "Open your tracker");
  expect(link).toBeDefined();
  return link?.href ?? "";
}

describe("task chat tracker link follows the visitor", () => {
  it("points demo visitors at /demo, not /app", () => {
    const a = answerTaskQuestion("what is the status", taskCtx("/demo"));
    const href = trackerHref(a.links);
    expect(href).toBe(`${ORIGIN}/demo`);
    expect(href).not.toContain("/app");
  });

  it("points signed-in visitors at /app", () => {
    const a = answerTaskQuestion("what is the status", taskCtx("/app"));
    expect(trackerHref(a.links)).toBe(`${ORIGIN}/app`);
  });

  it("carries the demo link on the due answer too", () => {
    const a = answerTaskQuestion("what is due and when?", taskCtx("/demo"));
    expect(trackerHref(a.links)).toBe(`${ORIGIN}/demo`);
  });

  it("builds the link from trackerPath, not a hardcoded /app", () => {
    const fn = taskChatSrc.slice(taskChatSrc.indexOf("function trackerLink"), taskChatSrc.indexOf("function postingLink"));
    expect(fn).toContain("ctx.trackerPath");
    expect(fn).not.toContain('"/app"');
  });

  it("threads trackerPath through the panel task context", () => {
    const block = panel.slice(panel.indexOf("const taskCtx"), panel.indexOf("const generalCtx"));
    expect(block).toContain('trackerPath: userId ? "/app" : "/demo"');
  });
});

describe("general chat tracker link is unchanged", () => {
  it("still points demo visitors at /demo", () => {
    const a = answerGeneralQuestion("what is waiting on me?", generalCtx("/demo"));
    expect(trackerHref(a.links)).toBe(`${ORIGIN}/demo`);
  });

  it("still points signed-in visitors at /app", () => {
    const a = answerGeneralQuestion("what is waiting on me?", generalCtx("/app"));
    expect(trackerHref(a.links)).toBe(`${ORIGIN}/app`);
  });
});

describe("signed-in Connect step 2 wraps the Claude Code command", () => {
  it("wraps the snippet instead of scrolling it sideways", () => {
    expect(agent).toContain("whitespace-pre-wrap break-words");
    expect(agent).not.toContain("overflow-x-auto");
  });

  it("still copies the exact snippet string, not the wrapped rendering", () => {
    expect(agent).toContain("copy(snippet(client, url, shown))");
  });

  it("leaves the demo twin wrapping as it already did", () => {
    expect(demoAgent).toContain("whitespace-pre-wrap break-words");
    expect(demoAgent).not.toContain("overflow-x-auto");
  });
});
