import { describe, expect, it } from "vitest";

import {
  answerTaskQuestion,
  buildTaskAgentHandoff,
  taskChatGreeting,
  type TaskChatContext,
} from "../task-chat";
import type { Application, Contact, TrackerEvent } from "../types";

const TODAY = "2026-11-15";

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

const EVENTS: TrackerEvent[] = [
  { id: "e1", application_id: "app-1", event_date: "2026-11-12", kind: "OA Received", details: "HackerRank invite" },
  { id: "e2", application_id: "app-1", event_date: "2026-11-10", kind: "Applied", details: "Software Engineer Intern" },
];

const CONTACTS: Contact[] = [
  {
    id: "c1",
    person_name: "Maya Chen",
    company: "Northwind Labs",
    status: "Connected",
    next_step: "Ask about the intern project",
    next_step_on: "2026-11-18",
    notes: "",
    linkedin_url: "",
    last_contacted: null,
  },
];

function ctx(over: Partial<TaskChatContext> = {}): TaskChatContext {
  return {
    app: APP,
    events: EVENTS,
    contacts: CONTACTS,
    today: TODAY,
    origin: "https://pulsefind-app.vercel.app",
        trackerPath: "/app",
    ...over,
  };
}

describe("task chat greeting", () => {
  it("opens warm, names the task, and states what is due", () => {
    const g = taskChatGreeting(ctx());
    expect(g.text).toContain("Hi, I'm here to help with this task");
    expect(g.text).toContain("Northwind Labs");
    expect(g.text).toContain("Finish the HackerRank");
    expect(g.text).toContain("Nov 20");
    expect(g.links?.some((l) => l.label === "Open the posting")).toBe(true);
    expect(g.text).not.toContain("—");
  });

  it("says so plainly when nothing is waiting", () => {
    const g = taskChatGreeting(ctx({ app: { ...APP, action_needed: "", action_due: null } }));
    expect(g.text).toContain("Nothing is waiting on you");
  });
});

describe("answerTaskQuestion", () => {
  it("answers when it is due, with the overdue math", () => {
    const a = answerTaskQuestion("What is due and when?", ctx());
    expect(a.text).toContain("Finish the HackerRank");
    expect(a.text).toContain("in 5 days");
    const overdue = answerTaskQuestion("when is it due", ctx({ today: "2026-11-22" }));
    expect(overdue.text).toContain("2 days overdue");
  });

  it("answers the link question with the posting link", () => {
    const a = answerTaskQuestion("Show me the link", ctx());
    expect(a.links?.[0]).toEqual({ label: "Open the posting", href: APP.link });
  });

  it("says so honestly when no link is saved", () => {
    const a = answerTaskQuestion("link please", ctx({ app: { ...APP, link: "" } }));
    expect(a.text).toContain("No posting link is saved");
    expect(a.links?.some((l) => l.label === "Open your tracker")).toBe(true);
  });

  it("answers status with dates and interview count", () => {
    const a = answerTaskQuestion("what is the status", ctx());
    expect(a.text).toContain("OA Received");
    expect(a.text).toContain("Applied Nov 10");
    expect(a.text).toContain("3 days ago");
  });

  it("recaps history from the events", () => {
    const a = answerTaskQuestion("What happened so far?", ctx());
    expect(a.text).toContain("Latest update: HackerRank invite arrived by email");
    expect(a.text).toContain("Nov 12: OA Received");
  });

  it("names the people at the company", () => {
    const a = answerTaskQuestion("Who do I know here?", ctx());
    expect(a.text).toContain("Maya Chen");
    expect(a.text).toContain("Ask about the intern project");
    expect(a.links?.some((l) => l.label === "Open Networking")).toBe(true);
  });

  it("says so when there is nobody at the company", () => {
    const a = answerTaskQuestion("who do I know", ctx({ contacts: [] }));
    expect(a.text).toContain("no networking contacts saved at Northwind Labs");
  });

  it("suggests the next step from the action", () => {
    const a = answerTaskQuestion("What should I do next?", ctx());
    expect(a.text).toContain("Next step: Finish the HackerRank");
  });

  it("falls back honestly instead of inventing an answer", () => {
    const a = answerTaskQuestion("What is the salary?", ctx());
    expect(a.text).toContain("I do not know that one from your tracker data");
  });

  it("answers help and greetings warmly", () => {
    expect(answerTaskQuestion("hi", ctx()).text).toContain("Hi, I'm here to help");
    expect(answerTaskQuestion("help", ctx()).text).toContain("Happy to help");
  });
});

describe("buildTaskAgentHandoff", () => {
  it("is one full prompt: the task, the chat, the goal, and the whole operator prompt", () => {
    const messages = [
      { id: "g", role: "assistant" as const, text: "Hi, I'm here to help with this task." },
      { id: "u1", role: "user" as const, text: "When is the assessment due?" },
      { id: "u2", role: "user" as const, text: "Can you help me prep for it?" },
    ];
    const h = buildTaskAgentHandoff({ ctx: ctx(), messages });
    expect(h).toContain("Northwind Labs, Software Engineer Intern");
    expect(h).toContain("Waiting on me: Finish the HackerRank");
    expect(h).toContain("Posting: https://example.com/jobs/northwind-swe-intern");
    expect(h).toContain("Maya Chen");
    expect(h).toContain("What I asked in the chat:");
    expect(h).toContain("Can you help me prep for it?");
    expect(h).toContain("What I am trying to do: Can you help me prep for it?");
    expect(h).toContain("Set me up first, automatically");
    expect(h).toContain("Sheet view");
    expect(h).toContain("scan_inbox");
    expect(h).toContain("Your connection to the MCP server");
    expect(h).toContain("If you are already connected");
    expect(h).toContain("If you are not connected yet");
    expect(h).toContain("get_summary");
    expect(h).toContain("process_job_email");
    expect(h).toContain("What still needs me");
    expect(h).toContain("Never send email on my behalf, never apply to a job");
    expect(h).not.toMatch(/pf_[A-Za-z0-9]/);
    expect(h).not.toContain("—");
  });

  it("falls back to the action when the user has not asked anything yet", () => {
    const h = buildTaskAgentHandoff({ ctx: ctx(), messages: [] });
    expect(h).toContain("What I am trying to do: Finish the HackerRank");
  });
});
