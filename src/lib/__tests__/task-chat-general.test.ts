import { describe, expect, it } from "vitest";

import { dueBucket } from "../pipeline";
import {
  answerGeneralQuestion,
  buildGeneralAgentHandoff,
  GENERAL_CHAT_SUGGESTIONS,
  generalChatGreeting,
  type GeneralChatContext,
} from "../task-chat";
import type { Application, Contact, TrackerEvent } from "../types";

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
];

const EVENTS: TrackerEvent[] = [
  { id: "e1", application_id: "app-1", event_date: "2026-11-12", kind: "OA Received", details: "HackerRank invite" },
  { id: "e2", application_id: "app-3", event_date: "2026-11-14", kind: "Interview Invited", details: "Recruiter screen passed" },
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
  },
  {
    id: "c2",
    person_name: "Sam Ortiz",
    company: "Globex",
    status: "Connected",
    next_step: "Thank her for the referral",
    next_step_on: "2026-11-14",
    notes: "",
  },
];

function ctx(over: Partial<GeneralChatContext> = {}): GeneralChatContext {
  return {
    apps: APPS,
    events: EVENTS,
    contacts: CONTACTS,
    today: TODAY,
    origin: "https://pulsefind-app.vercel.app",
    ghostDays: 21,
    weeklyGoal: 25,
    trackerPath: "/demo",
    ...over,
  };
}

describe("general chat suggestions", () => {
  it("offers the four whole-tracker starters", () => {
    expect(GENERAL_CHAT_SUGGESTIONS).toEqual([
      "What is waiting on me?",
      "What is due next?",
      "Who went quiet?",
      "How is my week going?",
    ]);
    for (const s of GENERAL_CHAT_SUGGESTIONS) expect(s).not.toContain("—");
  });
});

describe("general chat greeting", () => {
  it("opens warm, names the count waiting and the soonest due item", () => {
    const g = generalChatGreeting(ctx());
    expect(g.text).toContain("Hi, I'm Pulse");
    expect(g.text).toContain("whole tracker");
    expect(g.text).toContain("1 thing waiting on you");
    expect(g.text).toContain("Soonest: Northwind Labs, Finish the HackerRank");
    expect(g.text).toContain("Nov 20");
    expect(g.text).toContain("in 5 days");
    expect(g.links).toEqual([{ label: "Open your tracker", href: "https://pulsefind-app.vercel.app/demo" }]);
    expect(g.text).not.toContain("—");
  });

  it("says so plainly when nothing is waiting", () => {
    const g = generalChatGreeting(ctx({ apps: APPS.map((a) => ({ ...a, action_needed: "", action_due: null })) }));
    expect(g.text).toContain("Nothing is waiting on you right now");
  });

  it("links to /app when signed in", () => {
    const g = generalChatGreeting(ctx({ trackerPath: "/app" }));
    expect(g.links?.[0].href).toBe("https://pulsefind-app.vercel.app/app");
  });
});

describe("answerGeneralQuestion", () => {
  it("lists what is waiting, soonest first", () => {
    const a = answerGeneralQuestion("What is waiting on me?", ctx());
    expect(a.text).toContain("1 thing waiting on you");
    expect(a.text).toContain("Northwind Labs");
    expect(a.text).toContain("Finish the HackerRank");
    expect(a.text).toContain("in 5 days");
  });

  it("answers the next due item", () => {
    const a = answerGeneralQuestion("What is due next?", ctx());
    expect(a.text).toContain("Northwind Labs");
    expect(a.text).toContain("Finish the HackerRank");
  });

  it("names who went quiet, with the days", () => {
    const a = answerGeneralQuestion("Who went quiet?", ctx());
    expect(a.text).toContain("1 company has gone quiet");
    expect(a.text).toContain("Globex");
    expect(a.text).toContain("26 days ago");
    expect(a.text).toContain("21+ days");
  });

  it("says so honestly when nobody went quiet", () => {
    const a = answerGeneralQuestion("who went quiet", ctx({ apps: APPS.map((x) => ({ ...x, last_contact: "2026-11-14" })) }));
    expect(a.text).toContain("Nobody has gone quiet");
  });

  it("reports the week against the goal", () => {
    const a = answerGeneralQuestion("How is my week going?", ctx());
    expect(a.text).toContain("This week you applied to 2");
    expect(a.text).toContain("23 more to hit your weekly goal of 25");
    expect(a.text).toContain("All time: 3 applications, 1 with interviews, 0 offers");
  });

  it("summarises the overall status", () => {
    const a = answerGeneralQuestion("what is the status", ctx());
    expect(a.text).toContain("3 applications in total");
    expect(a.text).toContain("1 still at Applied");
    expect(a.text).toContain("1 with assessments");
    expect(a.text).toContain("1 in interviews");
  });

  it("names the follow-ups that are due", () => {
    const a = answerGeneralQuestion("who do I need to follow up with", ctx());
    expect(a.text).toContain("1 follow-up due");
    expect(a.text).toContain("Sam Ortiz");
    expect(a.text).toContain("Thank her for the referral");
    expect(a.links?.some((l) => l.label === "Open Networking")).toBe(true);
    expect(a.links?.[0].href).toContain("/demo/networking");
  });

  it("lists a contact with a date today but no step as due, with the Follow up fallback", () => {
    // Gap fix: a date alone is enough to be due, so this contact is now
    // listed; the line reads "Follow up" instead of an empty step.
    const blank: Contact = {
      id: "c-blank",
      person_name: "No Step Nora",
      company: "Globex",
      status: "Connected",
      next_step: "",
      next_step_on: TODAY,
      notes: "",
    };
    const a = answerGeneralQuestion("who do I need to follow up with", ctx({ contacts: [blank] }));
    expect(a.text).toContain("1 follow-up due");
    expect(a.text).toContain("No Step Nora");
    expect(a.text).toContain("Follow up");
    expect(dueBucket(blank, TODAY)).toBe("today");
  });

  it("lists a contact with a date today and a step as due", () => {
    const due: Contact = {
      id: "c-due",
      person_name: "Due Dan",
      company: "Globex",
      status: "Connected",
      next_step: "Send the intro",
      next_step_on: TODAY,
      notes: "",
    };
    const a = answerGeneralQuestion("who do I need to follow up with", ctx({ contacts: [due] }));
    expect(a.text).toContain("1 follow-up due");
    expect(a.text).toContain("Due Dan");
    expect(a.text).toContain("Send the intro");
  });

  it("lists an overdue contact with a step as due", () => {
    const overdue: Contact = {
      id: "c-overdue",
      person_name: "Late Lena",
      company: "Globex",
      status: "Connected",
      next_step: "Chase the referral",
      next_step_on: "2026-11-14",
      notes: "",
    };
    const a = answerGeneralQuestion("who do I need to follow up with", ctx({ contacts: [overdue] }));
    expect(a.text).toContain("1 follow-up due");
    expect(a.text).toContain("Late Lena");
    expect(a.text).toContain("Chase the referral");
  });

  it("never renders an empty step in a due line", () => {
    // Blank-step due contacts are now listed (date alone is due), and
    // every due line carries the "Follow up" fallback instead of an
    // empty step, whatever the contact data holds.
    const contacts: Contact[] = [
      { id: "c-blank", person_name: "Blank Ben", company: "Globex", status: "Connected", next_step: "", next_step_on: TODAY, notes: "" },
      { id: "c-space", person_name: "Spacey Sue", company: "Globex", status: "Connected", next_step: "   ", next_step_on: "2026-11-14", notes: "" },
      { id: "c-due", person_name: "Due Dan", company: "Globex", status: "Connected", next_step: "Send the intro", next_step_on: TODAY, notes: "" },
    ];
    const a = answerGeneralQuestion("who do I need to follow up with", ctx({ contacts }));
    expect(a.text).toContain("3 follow-ups due");
    expect(a.text).toContain("Blank Ben");
    expect(a.text).toContain("Spacey Sue");
    expect(a.text).toContain("Blank Ben (Globex): Follow up (Nov 15).");
    expect(a.text).toContain("Spacey Sue (Globex): Follow up (Nov 14).");
    expect(a.text).not.toContain(":  (");
    expect(a.text).not.toContain(": (");
  });

  it("counts due follow-ups the same way dueBucket does", () => {
    const contacts: Contact[] = [
      { id: "c-1", person_name: "Overdue Olive", company: "Globex", status: "Connected", next_step: "Ping her", next_step_on: "2026-11-13", notes: "" },
      { id: "c-2", person_name: "Today Tom", company: "Globex", status: "Connected", next_step: "Call him", next_step_on: TODAY, notes: "" },
      { id: "c-3", person_name: "Blank Ben", company: "Globex", status: "Connected", next_step: "", next_step_on: TODAY, notes: "" },
      { id: "c-4", person_name: "Future Fay", company: "Globex", status: "Connected", next_step: "Meet up", next_step_on: "2026-11-20", notes: "" },
      { id: "c-5", person_name: "No Date Ned", company: "Globex", status: "Connected", next_step: "Email him", next_step_on: null, notes: "" },
    ];
    const expected = contacts.filter((c) => {
      const b = dueBucket(c, TODAY);
      return b === "overdue" || b === "today";
    }).length;
    // Blank Ben counts now: his date is today even though no step is written.
    expect(expected).toBe(3);
    const a = answerGeneralQuestion("who do I need to follow up with", ctx({ contacts }));
    expect(a.text).toContain("3 follow-ups due");
    expect(a.text).toContain("Overdue Olive");
    expect(a.text).toContain("Today Tom");
    expect(a.text).toContain("Blank Ben");
    expect(a.text).toContain("Blank Ben (Globex): Follow up (Nov 15).");
    expect(a.text).not.toContain("Future Fay");
    expect(a.text).not.toContain("No Date Ned");
  });

  it("routes networking follow-up questions to the contacts, not the waiting tasks", () => {
    // Same contacts as the demo seed on Nov 16: Priya due today, Marcus
    // overdue, Sam with no step and no date. The two failing phrasings
    // from production ("due" used to win and return the waiting
    // applications; "networking follow-ups" fell through to "I do not
    // know") must both name the two due contacts.
    const demoContacts: Contact[] = [
      { id: "d1", person_name: "Priya Nair", company: "Copperline", status: "Connected", next_step: "Week 2 value touch", next_step_on: "2026-11-16", notes: "" },
      { id: "d2", person_name: "Marcus Webb", company: "Atlas Robotics", status: "Messaged", next_step: "Follow up if no reply", next_step_on: "2026-11-14", notes: "" },
      { id: "d3", person_name: "Sam Ortiz", company: "Fernhill Capital", status: "Connected", next_step: "", next_step_on: null, notes: "" },
    ];
    const demoCtx = ctx({ contacts: demoContacts, today: "2026-11-16" });
    for (const q of [
      "What networking follow-ups are due?",
      "Show me my networking follow-ups.",
      "any networking follow-ups due",
      "who do I need to follow up with",
    ]) {
      const a = answerGeneralQuestion(q, demoCtx);
      expect(a.text).toContain("2 follow-ups due");
      expect(a.text).toContain("Priya Nair");
      expect(a.text).toContain("Marcus Webb");
      expect(a.text).not.toContain("Sam Ortiz");
      expect(a.text).not.toContain("Northwind Labs");
    }
  });

  it("says no networking follow-ups are due when contacts exist but none are due", () => {
    const a = answerGeneralQuestion("What networking follow-ups are due?", ctx({ contacts: [CONTACTS[0]] }));
    expect(a.text).toContain("no follow-ups due right now");
    expect(a.text).not.toContain("waiting on you");
    expect(a.text).not.toContain("I do not know");
  });

  it("says no networking follow-ups are due when no contacts are saved at all", () => {
    const a = answerGeneralQuestion("Show me my networking follow-ups.", ctx({ contacts: [] }));
    expect(a.text).toContain("no follow-ups due right now");
    expect(a.text).not.toContain("waiting on you");
    expect(a.text).not.toContain("I do not know");
  });

  it("answers a bare contacts question with the follow-ups, not the waiting tasks", () => {
    const a = answerGeneralQuestion("show me my contacts", ctx());
    expect(a.text).toContain("1 follow-up due");
    expect(a.text).toContain("Sam Ortiz");
  });

  it("still answers 'What is due next?' with the waiting tasks", () => {
    // Ambiguous on purpose: "due next" with no networking word keeps the
    // existing behaviour (waiting applications), it does not guess contacts.
    const a = answerGeneralQuestion("What is due next?", ctx());
    expect(a.text).toContain("Northwind Labs");
    expect(a.text).toContain("Finish the HackerRank");
    expect(a.text).not.toContain("follow-up");
  });

  it("falls back honestly instead of inventing an answer", () => {
    const a = answerGeneralQuestion("What is the salary?", ctx());
    expect(a.text).toContain("I do not know that one from your tracker data");
  });

  it("answers help and greetings warmly", () => {
    expect(answerGeneralQuestion("hi", ctx()).text).toContain("Hi, I'm Pulse");
    expect(answerGeneralQuestion("help", ctx()).text).toContain("Happy to help");
  });
});

describe("buildGeneralAgentHandoff", () => {
  it("is one full prompt: the tracker, the waiting items, the quiet ones, and the whole operator prompt", () => {
    const messages = [
      { id: "g", role: "assistant" as const, text: "Hi, I'm Pulse." },
      { id: "u1", role: "user" as const, text: "Who went quiet?" },
      { id: "u2", role: "user" as const, text: "Help me follow up with Globex." },
    ];
    const h = buildGeneralAgentHandoff({ ctx: ctx(), messages });
    expect(h).toContain("Help me with my Pulse Find tracker");
    expect(h).toContain("3 applications in total");
    expect(h).toContain("This week: 2 applied, weekly goal 25");
    expect(h).toContain("Waiting on me:");
    expect(h).toContain("Northwind Labs, Software Engineer Intern (OA Received): Finish the HackerRank");
    expect(h).toContain("Gone quiet:");
    expect(h).toContain("Globex: last heard Oct 20, 26 days ago");
    expect(h).toContain("What I asked in the chat:");
    expect(h).toContain("Help me follow up with Globex.");
    expect(h).toContain("What I am trying to do: Help me follow up with Globex.");
    expect(h).toContain("Set me up first, automatically");
    expect(h).toContain("Sheet view");
    expect(h).toContain("scan_inbox");
    expect(h).toContain("You are already connected to the MCP server");
    expect(h).toContain("get_summary");
    expect(h).toContain("process_job_email");
    expect(h).toContain("What still needs me");
    expect(h).toContain("Never send email on my behalf, never apply to a job");
    expect(h).not.toMatch(/pf_[A-Za-z0-9]/);
    expect(h).not.toContain("—");
  });

  it("falls back to the waiting work when the user has not asked anything yet", () => {
    const h = buildGeneralAgentHandoff({ ctx: ctx(), messages: [] });
    expect(h).toContain("What I am trying to do: Work through what is waiting on me.");
  });
});
