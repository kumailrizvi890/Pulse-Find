import { describe, expect, it } from "vitest";

import { findKnowledgeAnswer } from "../job-knowledge";
import {
  answerGeneralQuestion,
  answerTaskQuestion,
  GENERAL_CHAT_SUGGESTIONS,
  generalChatGreeting,
  TASK_CHAT_SUGGESTIONS,
  taskChatGreeting,
  type GeneralChatContext,
  type TaskChatContext,
} from "../task-chat";
import type { Application, Contact, TrackerEvent } from "../types";

// Pulse now answers general job-hunt questions from a built-in knowledge
// base, not just tracker questions. The tracker still wins whenever it
// can answer: the knowledge layer only runs when no tracker intent
// matches, so it can never invent an application, a status, or a
// deadline. No em dashes in any user-facing string.

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
    next_step: "Follow up if no reply",
    next_step_on: "2026-11-15",
    notes: "",
    linkedin_url: "",
    last_contacted: null,
  },
];

const APPS: Application[] = [
  APP,
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
];

function taskCtx(over: Partial<TaskChatContext> = {}): TaskChatContext {
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

function generalCtx(over: Partial<GeneralChatContext> = {}): GeneralChatContext {
  return {
    apps: APPS,
    events: EVENTS,
    contacts: CONTACTS,
    today: TODAY,
    origin: "https://pulsefind-app.vercel.app",
    ghostDays: 21,
    weeklyGoal: 8,
    trackerPath: "/demo",
    ...over,
  };
}

describe("knowledge: interview prep", () => {
  it("answers behavioral questions with STAR", () => {
    const a = answerGeneralQuestion("How do I answer behavioral questions?", generalCtx());
    expect(a.text).toContain("STAR");
    expect(a.text).toContain("Situation, Task, Action, Result");
  });

  it("answers technical prep with patterns, not random problems", () => {
    const a = answerGeneralQuestion("How do I prepare for a technical interview?", generalCtx());
    expect(a.text).toContain("two pointers");
    expect(a.text).toContain("talk out loud");
  });

  it("answers the task-chat prep starter from knowledge", () => {
    const a = answerTaskQuestion("How do I prep for the interview?", taskCtx());
    expect(a.text).toContain("one or two problems a day");
    expect(a.id).toBe("knowledge-interview-technical-prep");
  });

  it("says what to expect in a technical round", () => {
    const a = answerGeneralQuestion("What should I expect in a technical round?", generalCtx());
    expect(a.text).toContain("45 to 60 minutes");
    expect(a.text).toContain("share your screen");
  });

  it("answers general interview tips", () => {
    const a = answerGeneralQuestion("Any tips for interviews?", generalCtx());
    expect(a.text).toContain("thank you the same day");
  });
});

describe("knowledge: resume", () => {
  it("gives resume tips that lead with what was built", () => {
    const a = answerGeneralQuestion("How can I improve my resume?", generalCtx());
    expect(a.text).toContain("one page");
    expect(a.text).toContain("what you built");
  });

  it("answers a bare resume question in the task chat too", () => {
    const a = answerTaskQuestion("Any resume tips?", taskCtx());
    expect(a.text).toContain("one page");
  });
});

describe("knowledge: online assessments", () => {
  it("answers HackerRank prep", () => {
    const a = answerGeneralQuestion("How do I do well on HackerRank?", generalCtx());
    expect(a.text).toContain("sample input and output");
    expect(a.text).toContain("edge cases");
  });

  it("answers CodeSignal prep", () => {
    const a = answerGeneralQuestion("Any CodeSignal tips?", generalCtx());
    expect(a.text).toContain("practice test first");
  });

  it("answers proctored Glider setup", () => {
    const a = answerGeneralQuestion("How do I prepare for a proctored Glider test?", generalCtx());
    expect(a.text).toContain("quiet room");
    expect(a.text).toContain("one sitting and one attempt");
  });

  it("answers general timed-assessment advice", () => {
    const a = answerGeneralQuestion("How should I prepare for an online assessment?", generalCtx());
    expect(a.text).toContain("when you are fresh");
    expect(a.text).toContain("Skim all the questions first");
  });
});

describe("knowledge: salary and offers", () => {
  it("answers salary questions with negotiation guidance", () => {
    const a = answerGeneralQuestion("What is the salary?", generalCtx());
    expect(a.text).toContain("Never give a number first");
    expect(a.text).toContain("in writing");
  });

  it("answers how to negotiate", () => {
    const a = answerGeneralQuestion("How do I negotiate an offer?", generalCtx());
    expect(a.text).toContain("whole offer");
  });

  it("answers choosing between two offers", () => {
    const a = answerGeneralQuestion("I have two offers, how do I choose?", generalCtx());
    expect(a.text).toContain("total pay over the first year");
  });
});

describe("knowledge: application strategy", () => {
  it("answers how many to apply to", () => {
    const a = answerGeneralQuestion("How many should I apply to?", generalCtx());
    expect(a.text).toContain("five to ten good applications a week");
  });

  it("answers where to apply", () => {
    const a = answerGeneralQuestion("Where should I apply?", generalCtx());
    expect(a.text).toContain("fit your level and graduation date");
  });

  it("answers how to get a referral", () => {
    const a = answerGeneralQuestion("How do I get a referral?", generalCtx());
    expect(a.text).toContain("short note");
    expect(a.text).toContain("not in the first message");
  });

  it("answers follow-up advice after an interview", () => {
    const a = answerGeneralQuestion("How do I follow up after an interview?", generalCtx());
    expect(a.text).toContain("thank you the same day");
  });

  it("answers how long it takes to hear back", () => {
    const a = answerGeneralQuestion("How long does it take to hear back?", generalCtx());
    expect(a.text).toContain("one to three weeks");
  });
});

describe("knowledge: networking and LinkedIn", () => {
  it("answers how to network", () => {
    const a = answerGeneralQuestion("How do I network on LinkedIn?", generalCtx());
    expect(a.text).toContain("short personal note");
    expect(a.text).toContain("One real conversation a week");
  });

  it("answers LinkedIn profile tips", () => {
    const a = answerGeneralQuestion("Any LinkedIn profile tips?", generalCtx());
    expect(a.text).toContain("headline clear");
  });
});

describe("knowledge: everyday stuff and random thoughts", () => {
  it("answers how are you warmly", () => {
    const a = answerGeneralQuestion("How are you?", generalCtx());
    expect(a.text).toContain("doing well");
  });

  it("says who Pulse is", () => {
    const a = answerGeneralQuestion("Who are you?", generalCtx());
    expect(a.text).toContain("I am Pulse");
    expect(a.text).toContain("job-hunt helper");
  });

  it("takes a thank you in stride", () => {
    const a = answerGeneralQuestion("Thanks!", generalCtx());
    expect(a.text).toContain("Anytime");
  });

  it("encourages instead of going quiet when the hunt feels heavy", () => {
    const a = answerGeneralQuestion("I feel so stressed about all of this", generalCtx());
    expect(a.text).toContain("one small thing today");
    expect(a.text).toContain("one yes");
  });

  it("answers a rejection with empathy and a next step", () => {
    const a = answerGeneralQuestion("I just got rejected again", generalCtx());
    expect(a.text).toContain("That one hurts");
    expect(a.text).toContain("keep the pipeline moving");
  });

  it("gives a day plan for what to do today", () => {
    const a = answerGeneralQuestion("What should I do today?", generalCtx());
    expect(a.text).toContain("three parts");
    expect(a.text).toContain("what is waiting on me");
  });

  it("tells a joke when asked", () => {
    const a = answerGeneralQuestion("Tell me a joke", generalCtx());
    expect(a.text).toContain("cache");
  });

  it("answers a vague random thought with a nudge, never a refusal", () => {
    for (const q of [
      "I keep thinking about whether I even want to do software engineering",
      "asdfghjkl",
      "Hmm",
    ]) {
      const a = answerGeneralQuestion(q, generalCtx());
      expect(a.text).not.toContain("I do not know");
      expect(a.text).toContain("Good thought");
    }
  });

  it("answers a vague thought in the task chat the same way", () => {
    const a = answerTaskQuestion("I keep wondering if this is the right role for me", taskCtx());
    expect(a.text).not.toContain("I do not know");
    expect(a.text).toContain("Good thought");
  });
});

describe("knowledge: greetings and help say what Pulse can do now", () => {
  it("task greeting mentions general job-hunt help", () => {
    const g = taskChatGreeting(taskCtx());
    expect(g.text).toContain("Hi, I'm here to help with this task");
    expect(g.text).toContain("interview prep");
  });

  it("general greeting mentions general job-hunt help", () => {
    const g = generalChatGreeting(generalCtx());
    expect(g.text).toContain("Hi, I'm Pulse");
    expect(g.text).toContain("interview prep");
    expect(g.text).toContain("ask about any company");
  });

  it("general help lists the knowledge areas", () => {
    const h = answerGeneralQuestion("help", generalCtx());
    expect(h.text).toContain("Happy to help");
    expect(h.text).toContain("interview prep");
    expect(h.text).toContain("resume tips");
    expect(h.text).toContain("salary");
  });

  it("task help lists the knowledge areas", () => {
    const h = answerTaskQuestion("help", taskCtx());
    expect(h.text).toContain("Happy to help");
    expect(h.text).toContain("interview prep");
  });

  it("both chats offer an interview prep starter", () => {
    expect(TASK_CHAT_SUGGESTIONS).toContain("How do I prep for the interview?");
    expect(GENERAL_CHAT_SUGGESTIONS).toContain("How do I prep for an interview?");
  });
});

describe("knowledge: the tracker still wins", () => {
  it("a company assessment question still answers from the tracker", () => {
    const a = answerGeneralQuestion("Do I have an assessment from Northwind Labs?", generalCtx());
    expect(a.text).toContain("Yes, Northwind Labs sent an assessment");
  });

  it("a stage count still answers from the tracker", () => {
    const a = answerGeneralQuestion("How many OAs do I have?", generalCtx());
    expect(a.text).toContain("1 assessment");
  });

  it("a networking follow-ups question still answers from contacts", () => {
    const a = answerGeneralQuestion("What networking follow-ups are due?", generalCtx());
    expect(a.text).toContain("Sam Ortiz");
    expect(a.text).not.toContain("short personal note");
  });

  it("an offers question still answers from the tracker", () => {
    const a = answerGeneralQuestion("Do I have any offers?", generalCtx());
    expect(a.text).toContain("No offers in your tracker yet");
  });

  it("what should I do next still answers from the task", () => {
    const a = answerTaskQuestion("What should I do next?", taskCtx());
    expect(a.text).toContain("Next step: Finish the HackerRank");
  });

  it("the knowledge layer returns null for a pure tracker question", () => {
    expect(findKnowledgeAnswer("What is due and when?")).toBeNull();
    expect(findKnowledgeAnswer("")).toBeNull();
  });
});

describe("knowledge: no em dashes anywhere", () => {
  it("no knowledge answer uses an em dash", () => {
    const questions = [
      "How do I answer behavioral questions?",
      "How do I prepare for a technical interview?",
      "What should I expect in a technical round?",
      "Any tips for interviews?",
      "How can I improve my resume?",
      "How do I do well on HackerRank?",
      "Any CodeSignal tips?",
      "How do I prepare for a proctored Glider test?",
      "How should I prepare for an online assessment?",
      "What is the salary?",
      "How do I negotiate an offer?",
      "I have two offers, how do I choose?",
      "How many should I apply to?",
      "Where should I apply?",
      "How do I get a referral?",
      "How do I follow up after an interview?",
      "How long does it take to hear back?",
      "How do I network on LinkedIn?",
      "Any LinkedIn profile tips?",
      "How are you?",
      "Who are you?",
      "Thanks!",
      "I feel so stressed about all of this",
      "I just got rejected again",
      "What should I do today?",
      "Tell me a joke",
      "I keep thinking about whether I even want to do software engineering",
      "asdfghjkl",
      "help",
      "hi",
    ];
    for (const q of questions) {
      expect(answerGeneralQuestion(q, generalCtx()).text).not.toContain("—");
      expect(answerTaskQuestion(q, taskCtx()).text).not.toContain("—");
    }
    expect(generalChatGreeting(generalCtx()).text).not.toContain("—");
    expect(taskChatGreeting(taskCtx()).text).not.toContain("—");
  });
});
