import { describe, expect, it } from "vitest";

import { demoApplications, demoEvents } from "../demo-data";
import { demoContacts, demoPipelineStore } from "../pipeline";
import {
  answerGeneralQuestion,
  generalChatGreeting,
  type GeneralChatContext,
} from "../task-chat";
import type { Application, Contact, Lead, TrackerEvent } from "../types";

// Ask Pulse, whole-tracker Q&A (Nov 19 2026, from Kumail's iPhone): the
// general chat only handled four canned intents and answered "I do not
// know" to everything else, even basic lookups the tracker data can
// answer ("Do I have an assessment from Roblox?"). It now answers any
// question about the journey from the tracker data: any company, stage
// counts and lists, timelines, leads, networking, and response rate.
// No em dashes in any user-facing string.

const TODAY = "2026-11-15";

const APPS: Application[] = [
  {
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
  },
  {
    id: "app-2",
    company: "Globex",
    role: "Software Engineer Intern",
    track: "Internship",
    status: "Applied",
    date_applied: "2026-10-15",
    last_contact: "2026-10-20",
    oa_received: false,
    interviews_done: 0,
    latest_update: "",
    link: "",
    notes: "",
    action_needed: "",
    action_due: null,
  },
  {
    id: "app-3",
    company: "Initech",
    role: "Software Engineer Intern",
    track: "Internship",
    status: "Interview Invited",
    date_applied: "2026-11-13",
    last_contact: "2026-11-14",
    oa_received: false,
    interviews_done: 1,
    latest_update: "Recruiter screen passed",
    link: "",
    notes: "",
    action_needed: "",
    action_due: null,
  },
  {
    id: "app-4",
    company: "Umbrella Corp",
    role: "Software Engineer Intern",
    track: "Internship",
    status: "Rejected",
    date_applied: "2026-11-05",
    last_contact: "2026-11-08",
    oa_received: false,
    interviews_done: 0,
    latest_update: "Not moving forward",
    link: "",
    notes: "",
    action_needed: "",
    action_due: null,
  },
  {
    id: "app-5",
    company: "Wonka Industries",
    role: "Software Engineer Intern",
    track: "Internship",
    status: "Offer",
    date_applied: "2026-11-12",
    last_contact: "2026-11-14",
    oa_received: false,
    interviews_done: 1,
    latest_update: "Offer: $28/hr, 20 hrs/week",
    link: "",
    notes: "",
    action_needed: "Accept or decline the offer",
    action_due: "2026-11-18",
  },
];

const EVENTS: TrackerEvent[] = [
  { id: "e1", application_id: "app-1", event_date: "2026-11-12", kind: "OA Received", details: "HackerRank invite" },
  { id: "e2", application_id: "app-3", event_date: "2026-11-14", kind: "Interview Invited", details: "Recruiter screen passed" },
  { id: "e3", application_id: "app-4", event_date: "2026-11-08", kind: "Rejected", details: "Not moving forward" },
  { id: "e4", application_id: "app-5", event_date: "2026-11-14", kind: "Offer", details: "Offer: $28/hr, 20 hrs/week" },
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
  {
    id: "c2",
    person_name: "Sam Ortiz",
    company: "Globex",
    status: "Connected",
    next_step: "Thank her for the referral",
    next_step_on: "2026-11-14",
    notes: "",
    linkedin_url: "",
    last_contacted: null,
  },
];

const LEADS: Lead[] = [
  {
    id: "l1",
    company: "Northwind Labs",
    role: "Backend Engineer Intern",
    track: "Internship",
    location: "Remote",
    pay: "$50/hr",
    url: "https://example.com/northwind-backend",
    source: "Job board",
    status: "New",
    fit_note: "Strong match",
    date_found: "2026-11-14",
  },
  {
    id: "l2",
    company: "Globex",
    role: "Data Engineer Intern",
    track: "Internship",
    location: "Seattle, WA",
    pay: "",
    url: "",
    source: "Agent scan",
    status: "Queued",
    fit_note: "",
    date_found: "2026-11-13",
  },
  {
    id: "l3",
    company: "Umbrella Corp",
    role: "SWE Intern",
    track: "Internship",
    location: "",
    pay: "",
    url: "",
    source: "",
    status: "Closed",
    fit_note: "Posting closed",
    date_found: "2026-11-01",
  },
];

function ctx(over: Partial<GeneralChatContext> = {}): GeneralChatContext {
  return {
    apps: APPS,
    events: EVENTS,
    contacts: CONTACTS,
    leads: LEADS,
    today: TODAY,
    origin: "https://pulsefind-app.vercel.app",
    ghostDays: 21,
    weeklyGoal: 25,
    trackerPath: "/demo",
    ...over,
  };
}

describe("Ask Pulse answers about any company", () => {
  it("answers an assessment question for a company it knows, with the action and due date", () => {
    const a = answerGeneralQuestion("Do I have an assessment from Northwind Labs?", ctx());
    expect(a.text).toContain("Yes, Northwind Labs sent an assessment");
    expect(a.text).toContain("HackerRank invite arrived by email");
    expect(a.text).toContain("Finish the HackerRank");
    expect(a.text).toContain("Nov 20");
    expect(a.text).toContain("in 5 days");
    expect(a.text).not.toContain("I do not know");
  });

  it("answers the same question with the company's short name", () => {
    const a = answerGeneralQuestion("Do I have an assessment from Northwind?", ctx());
    expect(a.text).toContain("Yes, Northwind Labs sent an assessment");
  });

  it("says plainly when a known company sent no assessment", () => {
    const a = answerGeneralQuestion("Do I have an assessment from Umbrella Corp?", ctx());
    expect(a.text).toContain("No assessment from Umbrella Corp");
    expect(a.text).toContain("Rejected");
    expect(a.text).not.toContain("I do not know");
  });

  it("answers when a company was applied to", () => {
    const a = answerGeneralQuestion("When did I apply to Northwind Labs?", ctx());
    expect(a.text).toContain("Nov 10");
    expect(a.text).not.toContain("I do not know");
  });

  it("answers what was applied to at a company", () => {
    const a = answerGeneralQuestion("What did I apply to at Globex?", ctx());
    expect(a.text).toContain("Software Engineer Intern");
    expect(a.text).toContain("Applied");
  });

  it("answers who is known at a company", () => {
    const a = answerGeneralQuestion("Who do I know at Northwind Labs?", ctx());
    expect(a.text).toContain("Maya Chen");
    expect(a.text).toContain("Ask about the intern project");
  });

  it("answers about interviews and offers at a company", () => {
    const interviews = answerGeneralQuestion("Do I have an interview with Initech?", ctx());
    expect(interviews.text).toContain("Interviews at Initech");
    expect(interviews.text).toContain("Interview Invited");
    const offers = answerGeneralQuestion("Do I have an offer from Wonka Industries?", ctx());
    expect(offers.text).toContain("Offers from Wonka Industries");
    expect(offers.text).toContain("Accept or decline the offer");
    const none = answerGeneralQuestion("Do I have an offer from Globex?", ctx());
    expect(none.text).toContain("No offer from Globex");
  });

  it("summarises a company with no specific question", () => {
    const a = answerGeneralQuestion("What is my status at Northwind Labs?", ctx());
    expect(a.text).toContain("Northwind Labs:");
    expect(a.text).toContain("OA Received");
    expect(a.text).toContain("applied Nov 10");
    expect(a.text).toContain("assessment received");
    expect(a.text).toContain("HackerRank invite arrived by email");
  });

  it("answers about a person by name", () => {
    const a = answerGeneralQuestion("What is Maya Chen's next step?", ctx());
    expect(a.text).toContain("Maya Chen (Northwind Labs)");
    expect(a.text).toContain("Ask about the intern project");
    expect(a.text).toContain("Nov 18");
  });

  it("says plainly when a company is not in the tracker at all", () => {
    const a = answerGeneralQuestion("Do I have an assessment from Acme?", ctx());
    expect(a.text).toContain("No application at Acme is in your tracker");
    expect(a.text).toContain("no assessment");
    expect(a.text).not.toContain("I do not know");
  });

  it("answers the exact Roblox question from the demo seed: no Roblox application there", async () => {
    const today = "2026-11-19";
    const apps = demoApplications(today);
    const demoCtx: GeneralChatContext = {
      apps,
      events: demoEvents(apps),
      contacts: demoContacts(today),
      leads: await demoPipelineStore(today).loadLeads(),
      today,
      origin: "https://pulsefind-app.vercel.app",
      ghostDays: 21,
      weeklyGoal: 25,
      trackerPath: "/demo",
    };
    const a = answerGeneralQuestion("Do i have an assessment from Roblox", demoCtx);
    expect(a.text).toContain("No application at Roblox is in your tracker");
    expect(a.text).toContain("no assessment");
    expect(a.text).not.toContain("I do not know");
  });

  it("answers the same question with a real Roblox assessment when the tracker has one", () => {
    const roblox: Application = {
      id: "app-r",
      company: "Roblox",
      role: "Software Engineer Intern",
      track: "Internship",
      status: "OA Received",
      date_applied: "2026-11-10",
      last_contact: "2026-11-12",
      oa_received: true,
      interviews_done: 0,
      latest_update: "Assessment invite arrived by email",
      link: "",
      notes: "",
      action_needed: "Finish the 5 assessment modules",
      action_due: "2026-11-25",
    };
    const a = answerGeneralQuestion("Do i have an assessment from Roblox", ctx({ apps: [...APPS, roblox] }));
    expect(a.text).toContain("Yes, Roblox sent an assessment");
    expect(a.text).toContain("Finish the 5 assessment modules");
  });

  it("answers a demo-seed assessment question with the real demo state", () => {
    const today = "2026-11-19";
    const apps = demoApplications(today);
    const demoCtx: GeneralChatContext = {
      apps,
      events: demoEvents(apps),
      contacts: demoContacts(today),
      leads: [],
      today,
      origin: "https://pulsefind-app.vercel.app",
      ghostDays: 21,
      weeklyGoal: 25,
      trackerPath: "/demo",
    };
    const a = answerGeneralQuestion("Do I have an assessment from Northwind Labs?", demoCtx);
    expect(a.text).toContain("Yes, Northwind Labs sent an assessment");
    expect(a.text).toContain("HackerRank assessment sent (2 problems, 90 min)");
    expect(a.text).toContain("Finish the HackerRank assessment");
    expect(a.text).toContain("Nov 22");
    expect(a.text).toContain("in 3 days");
  });
});

describe("Ask Pulse answers stage counts and lists", () => {
  it("counts assessments", () => {
    const a = answerGeneralQuestion("How many OAs do I have?", ctx());
    expect(a.text).toContain("1 assessment");
    expect(a.text).toContain("Northwind Labs");
    expect(a.text).toContain("Finish the HackerRank");
  });

  it("says so plainly when there are no assessments", () => {
    const a = answerGeneralQuestion("How many OAs do I have?", ctx({ apps: [APPS[1]] }));
    expect(a.text).toContain("No assessments in your tracker yet");
  });

  it("lists interviews coming up", () => {
    const a = answerGeneralQuestion("What interviews are coming up?", ctx());
    // Same membership as the dashboard: Initech at interview stage plus
    // Wonka at Offer (an offer means interviews happened), both active.
    expect(a.text).toContain("2 applications reached interview stage, 2 still active");
    expect(a.text).toContain("Initech");
    expect(a.text).toContain("Interview Invited");
    expect(a.text).toContain("Recruiter screen passed");
    expect(a.text).toContain("Wonka Industries");
    expect(a.text).toContain("Offer");
  });

  it("counts rejections", () => {
    const a = answerGeneralQuestion("How many rejections do I have?", ctx());
    expect(a.text).toContain("1 rejection");
    expect(a.text).toContain("Umbrella Corp");
    expect(a.text).toContain("Not moving forward");
  });

  it("lists offers", () => {
    const a = answerGeneralQuestion("Do I have any offers?", ctx());
    expect(a.text).toContain("1 offer");
    expect(a.text).toContain("Wonka Industries");
    expect(a.text).toContain("Accept or decline the offer");
  });

  it("says so plainly when there are no offers", () => {
    const a = answerGeneralQuestion("Do I have any offers?", ctx({ apps: [APPS[1]] }));
    expect(a.text).toContain("No offers in your tracker yet");
  });
});

describe("Ask Pulse answers timelines, leads, and response rate", () => {
  it("recaps what happened this week", () => {
    const a = answerGeneralQuestion("What happened this week?", ctx());
    expect(a.text).toContain("What happened in the last 7 days");
    expect(a.text).toContain("Northwind Labs, OA Received");
    expect(a.text).toContain("Initech, Interview Invited");
    expect(a.text).toContain("Wonka Industries, Offer");
    expect(a.text).toContain("Umbrella Corp, Rejected");
  });

  it("recaps only since yesterday when asked", () => {
    const a = answerGeneralQuestion("What is new since yesterday?", ctx());
    expect(a.text).toContain("since yesterday");
    expect(a.text).toContain("Initech");
    expect(a.text).toContain("Wonka Industries");
    expect(a.text).not.toContain("Northwind Labs");
    expect(a.text).not.toContain("Umbrella Corp");
  });

  it("lists open leads", () => {
    const a = answerGeneralQuestion("What leads do I have?", ctx());
    expect(a.text).toContain("2 open leads");
    expect(a.text).toContain("Northwind Labs, Backend Engineer Intern (New)");
    expect(a.text).toContain("Globex, Data Engineer Intern (Queued)");
    expect(a.text).not.toContain("Umbrella Corp");
    expect(a.links?.some((l) => l.label === "Open Leads")).toBe(true);
  });

  it("lists leads at one company", () => {
    const a = answerGeneralQuestion("What leads do I have at Northwind Labs?", ctx());
    expect(a.text).toContain("Leads at Northwind Labs");
    expect(a.text).toContain("Backend Engineer Intern (New)");
  });

  it("reports the response rate from applications and contacts", () => {
    const a = answerGeneralQuestion("What is my response rate?", ctx());
    expect(a.text).toContain("80%");
    expect(a.text).toContain("4 of 5 applications");
    expect(a.text).toContain("100%");
    expect(a.text).toContain("2 of 2 contacts");
  });

  it("narrows what is due to this week", () => {
    const a = answerGeneralQuestion("What is due this week?", ctx());
    expect(a.text).toContain("2 things due in the next 7 days");
    expect(a.text).toContain("Wonka Industries");
    expect(a.text).toContain("Accept or decline the offer");
    expect(a.text).toContain("Northwind Labs");
    expect(a.text).toContain("Finish the HackerRank");
  });
});

describe("Ask Pulse help and fallback", () => {
  it("says what it can now answer", () => {
    const h = answerGeneralQuestion("help", ctx());
    expect(h.text).toContain("Happy to help");
    expect(h.text).toContain("any company");
    expect(h.text).toContain("assessment");
    expect(h.text).toContain("response rate");
  });

  it("hints at company questions in the greeting", () => {
    const g = generalChatGreeting(ctx());
    expect(g.text).toContain("ask about any company");
  });

  it("answers a salary question from the knowledge base instead of refusing", () => {
    const a = answerGeneralQuestion("What is the salary?", ctx());
    expect(a.text).toContain("Never give a number first");
    expect(a.text).not.toContain("I do not know");
  });

  it("never uses an em dash in any new answer", () => {
    const questions = [
      "Do I have an assessment from Northwind Labs?",
      "Do I have an assessment from Roblox?",
      "Do I have an assessment from Acme?",
      "When did I apply to Northwind Labs?",
      "What did I apply to at Globex?",
      "Who do I know at Northwind Labs?",
      "What is Maya Chen's next step?",
      "How many OAs do I have?",
      "What interviews are coming up?",
      "How many rejections do I have?",
      "Do I have any offers?",
      "What happened this week?",
      "What is new since yesterday?",
      "What leads do I have?",
      "What leads do I have at Northwind Labs?",
      "What is my response rate?",
      "What is due this week?",
      "What is my status at Northwind Labs?",
      "What is the salary?",
      "help",
      "hi",
    ];
    for (const q of questions) {
      expect(answerGeneralQuestion(q, ctx()).text).not.toContain("—");
    }
    expect(generalChatGreeting(ctx()).text).not.toContain("—");
  });
});
