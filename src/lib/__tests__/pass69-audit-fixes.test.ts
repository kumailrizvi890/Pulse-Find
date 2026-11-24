import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildAgentHandoffPrompt,
  buildAgentPrompt,
  buildOperatorBody,
  getMcpEndpoint,
} from "../agent-prompt";
import { demoApplications, demoEvents } from "../demo-data";
import { demoContacts } from "../pipeline";
import {
  answerGeneralQuestion,
  generalChatGreeting,
  type GeneralChatContext,
} from "../task-chat";
import type { Application, TrackerEvent } from "../types";

// Pass 69 audit fixes: Ask Pulse could not answer "which applications
// are ghosted" (the routing regex matched "ghost" but never "ghosted"),
// named only 5 of the 6 OAs, and the connect pages listed 7 tools in
// step 3 against 13 in the step-4 prompt, whose status list omitted
// "OA Received". No em dashes in any user-facing string.

const TODAY = "2026-11-19";

function demoCtx(): GeneralChatContext {
  const apps = demoApplications(TODAY);
  return {
    apps,
    events: demoEvents(apps),
    contacts: demoContacts(TODAY),
    leads: [],
    today: TODAY,
    origin: "https://pulsefind-app.vercel.app",
    ghostDays: 21,
    weeklyGoal: 25,
    trackerPath: "/demo",
  };
}

const GHOSTED_FIVE = [
  "Pinecrest Games",
  "Harbor & Pike",
  "Meridian Retail",
  "Sable Studio",
  "Ember Logistics",
];

const OA_SIX = [
  "Northwind Labs",
  "Copperline",
  "Atlas Robotics",
  "Fernhill Capital",
  "Saltmarsh Security",
  "Verdant Energy",
];

function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

describe("Ask Pulse answers ghosted questions", () => {
  it("answers 'which applications are ghosted' with the 5 quiet ones by name", () => {
    const a = answerGeneralQuestion("Which applications are ghosted?", demoCtx());
    expect(a.text).toContain("5 companies have gone quiet");
    expect(a.text).toContain("21+ days");
    for (const name of GHOSTED_FIVE) expect(a.text).toContain(name);
    expect(a.text).not.toContain("I do not know");
  });

  it("answers 'who ghosted me' the same way", () => {
    const a = answerGeneralQuestion("Who ghosted me?", demoCtx());
    expect(a.text).toContain("5 companies have gone quiet");
    for (const name of GHOSTED_FIVE) expect(a.text).toContain(name);
    expect(a.text).not.toContain("I do not know");
  });

  it("answers the 'gone quiet' wording too", () => {
    const a = answerGeneralQuestion("Who has gone quiet?", demoCtx());
    expect(a.text).toContain("5 companies have gone quiet");
    for (const name of GHOSTED_FIVE) expect(a.text).toContain(name);
  });

  it("never lists a finished row as ghosted, however quiet it is", () => {
    // Kestrel Fintech was last heard from 22 days ago but is Rejected;
    // Ridgeview Bank 35 days ago but Withdrawn. Both are closed, so
    // the ghosted predicate (same one the dashboard and Sheet use)
    // excludes them.
    const a = answerGeneralQuestion("Which applications are ghosted?", demoCtx());
    expect(a.text).not.toContain("Kestrel Fintech");
    expect(a.text).not.toContain("Ridgeview Bank");
  });

  it("says 'And N more' instead of silently dropping the sixth ghosted row", () => {
    const apps: Application[] = Array.from({ length: 6 }, (_, i) => ({
      id: `app-g${i}`,
      company: `Quiet Co ${i + 1}`,
      role: "Software Engineer Intern",
      track: "Internship",
      status: "Applied",
      date_applied: "2026-10-01",
      last_contact: "2026-10-15",
      oa_received: false,
      interviews_done: 0,
      latest_update: "",
      link: "",
      notes: "",
      action_needed: "",
      action_due: null,
    }));
    const ctx: GeneralChatContext = { ...demoCtx(), apps, events: [] as TrackerEvent[] };
    const a = answerGeneralQuestion("Which applications are ghosted?", ctx);
    expect(a.text).toContain("6 companies have gone quiet");
    expect(a.text).toContain("And 1 more in your tracker.");
  });
});

describe("Ask Pulse names every OA", () => {
  it("names all 6 companies, with no 'And 1 more' tail", () => {
    const a = answerGeneralQuestion("How many OAs have I received, and which companies?", demoCtx());
    expect(a.text).toContain("6 assessments:");
    for (const name of OA_SIX) expect(a.text).toContain(name);
    expect(a.text).not.toContain("And 1 more");
    expect(a.text).not.toContain("I do not know");
  });
});

describe("Ask Pulse says ghosted is something it can answer", () => {
  it("the help answer names ghosted", () => {
    expect(answerGeneralQuestion("help", demoCtx()).text).toContain("ghosted");
  });

  it("the fallback names ghosted among the things it can answer", () => {
    // Salary used to reach the fallback; it now has a knowledge answer,
    // so the fallback is reached with a question nothing can answer.
    expect(answerGeneralQuestion("What is the meaning of life?", demoCtx()).text).toContain("ghosted");
  });

  it("the greeting names ghosted", () => {
    expect(generalChatGreeting(demoCtx()).text).toContain("ghosted");
  });
});

describe("no em dashes in the new answers", () => {
  it("ghosted, OA, help, fallback, and greeting answers carry none", () => {
    const ctx = demoCtx();
    for (const q of ["Which applications are ghosted?", "How many OAs have I received, and which companies?", "help", "What is the salary?"]) {
      expect(answerGeneralQuestion(q, ctx).text).not.toContain("—");
    }
    expect(generalChatGreeting(ctx).text).not.toContain("—");
  });
});

const THIRTEEN_TOOLS =
  "Tools: get_summary, list_applications, add_application, update_application, process_job_email, check_job_scam, search_jobs, list_leads, add_lead, update_lead, list_contacts, add_contact, update_contact.";

describe("connect step 3 lists every tool", () => {
  it("the demo page step 3 names all 13 tools, like the step-4 prompt", () => {
    expect(read("app/demo/connect/DemoConnectAgent.tsx")).toContain(THIRTEEN_TOOLS);
  });

  it("the signed-in page step 3 names all 13 tools too", () => {
    expect(read("app/app/connect/ConnectAgent.tsx")).toContain(THIRTEEN_TOOLS);
  });
});

describe("operator prompt statuses include OA Received", () => {
  it("the shared operator body lists OA Received between Incomplete and OA Completed", () => {
    const list = "Applied, Incomplete, OA Received, OA Completed, Recruiter Screen";
    expect(buildOperatorBody()).toContain(list);
    expect(buildAgentPrompt({ endpoint: getMcpEndpoint(), token: "pf_x" })).toContain(list);
    expect(buildAgentHandoffPrompt({ endpoint: getMcpEndpoint() })).toContain(list);
  });

  it("the SKILL.md handout carries the same status list", () => {
    // SKILL.md lives at the repo root, one level above src/.
    const skill = readFileSync(join(__dirname, "..", "..", "..", "skills", "pulse-find", "SKILL.md"), "utf8");
    expect(skill).toContain("Applied, Incomplete, OA Received, OA Completed, Recruiter Screen");
  });
});
