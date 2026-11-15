// Task chat: a small deterministic Q&A for one application, plus the
// "Talk to Agent" handoff summary.
//
// There is no LLM or chat endpoint in this repo, so the chatbot answers
// only from the tracker data Pulse Find already has: the application row,
// its history events, and networking contacts at the same company. Anything
// it cannot answer from that data is routed to the Talk to Agent handoff
// instead of guessed. All functions here are pure and take `today` so tests
// can pin the date. No em dashes in any user-facing string.

import { daysBetween, parseISO } from "./metrics";
import { buildAgentHandoffPrompt, getMcpEndpoint } from "./agent-prompt";
import type { Application, Contact, ISODate, TrackerEvent } from "./types";

export type ChatRole = "user" | "assistant";

export interface ChatLink {
  label: string;
  href: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  links?: ChatLink[];
}

export interface TaskChatContext {
  app: Application;
  /** History for this application only, newest first. */
  events: TrackerEvent[];
  /** Networking contacts at the same company. */
  contacts: Contact[];
  today: ISODate;
  /** App origin, used for links back into the tracker. */
  origin: string;
}

export const DEFAULT_APP_ORIGIN = "https://pulsefind-app.vercel.app";

/** Tap-to-ask starters shown when the chat opens. */
export const TASK_CHAT_SUGGESTIONS = [
  "What is due and when?",
  "Show me the link",
  "What happened so far?",
  "Who do I know here?",
  "What should I do next?",
] as const;

function fmtDay(s: ISODate | null): string {
  if (!s) return "no date set";
  const d = parseISO(s);
  const showYear = d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(showYear ? { year: "numeric" } : {}),
  });
}

function duePhrase(app: Application, today: ISODate): string {
  if (!app.action_due) return "No due date is set for it.";
  const d = daysBetween(today, app.action_due);
  if (d < 0) return `It was due ${fmtDay(app.action_due)}, ${-d} day${-d === 1 ? "" : "s"} overdue.`;
  if (d === 0) return `It is due today, ${fmtDay(app.action_due)}.`;
  if (d === 1) return `It is due tomorrow, ${fmtDay(app.action_due)}.`;
  return `It is due ${fmtDay(app.action_due)}, in ${d} days.`;
}

function trackerLink(ctx: TaskChatContext): ChatLink {
  return { label: "Open your tracker", href: `${ctx.origin.replace(/\/+$/, "")}/app` };
}

function postingLink(ctx: TaskChatContext): ChatLink | null {
  return ctx.app.link ? { label: "Open the posting", href: ctx.app.link } : null;
}

/** The answer the chat gives when it first opens for a task. */
export function taskChatGreeting(ctx: TaskChatContext): ChatMessage {
  const { app } = ctx;
  const lines = [`Hi, I'm here to help with this task. This one is ${app.company}${app.role ? `, ${app.role}` : ""}.`];
  if (app.action_needed) {
    lines.push(`Waiting on you: ${app.action_needed}. ${duePhrase(app, ctx.today)}`);
  } else {
    lines.push(`Nothing is waiting on you for this one right now. Status is ${app.status}.`);
  }
  lines.push("Ask me anything about it, like what is due or where the link is.");
  const links = [postingLink(ctx), trackerLink(ctx)].filter((l): l is ChatLink => l !== null);
  return { id: "greeting", role: "assistant", text: lines.join(" "), links };
}

function answerDue(ctx: TaskChatContext): ChatMessage {
  const { app } = ctx;
  if (!app.action_needed && !app.action_due) {
    return {
      id: "due",
      role: "assistant",
      text: `Nothing is waiting on you for ${app.company} right now, so there is no due date. Status is ${app.status}.`,
    };
  }
  const text = app.action_needed
    ? `${app.action_needed}. ${duePhrase(app, ctx.today)}`
    : duePhrase(app, ctx.today);
  const links = [postingLink(ctx), trackerLink(ctx)].filter((l): l is ChatLink => l !== null);
  return { id: "due", role: "assistant", text, links };
}

function answerLink(ctx: TaskChatContext): ChatMessage {
  const { app } = ctx;
  const post = postingLink(ctx);
  if (!post) {
    return {
      id: "link",
      role: "assistant",
      text: `No posting link is saved for ${app.company}. You can add one in the task form and ask me again.`,
      links: [trackerLink(ctx)],
    };
  }
  return {
    id: "link",
    role: "assistant",
    text: `Here is the link for ${app.company}${app.role ? `, ${app.role}` : ""}.`,
    links: [post, trackerLink(ctx)],
  };
}

function answerStatus(ctx: TaskChatContext): ChatMessage {
  const { app, today } = ctx;
  const parts = [`${app.company}${app.role ? `, ${app.role}` : ""} is ${app.status}.`];
  if (app.date_applied) parts.push(`Applied ${fmtDay(app.date_applied)}.`);
  if (app.last_contact) {
    const quiet = daysBetween(app.last_contact, today);
    parts.push(
      quiet <= 0
        ? "Last contact was today."
        : `Last heard from them ${fmtDay(app.last_contact)}, ${quiet} day${quiet === 1 ? "" : "s"} ago.`,
    );
  }
  if (app.oa_received) parts.push("An assessment was received.");
  if (app.interviews_done > 0) parts.push(`${app.interviews_done} interview${app.interviews_done === 1 ? "" : "s"} done.`);
  if (app.action_needed) parts.push(`Waiting on you: ${app.action_needed}. ${duePhrase(app, today)}`);
  return { id: "status", role: "assistant", text: parts.join(" "), links: [trackerLink(ctx)] };
}

function answerHistory(ctx: TaskChatContext): ChatMessage {
  const { app, events } = ctx;
  const shown = events.slice(0, 5);
  const lines: string[] = [];
  if (app.latest_update) lines.push(`Latest update: ${app.latest_update}`);
  if (shown.length === 0) {
    lines.push("There is no history saved for this one yet.");
  } else {
    lines.push("What happened so far:");
    for (const e of shown) {
      lines.push(`- ${fmtDay(e.event_date)}: ${e.kind}${e.details ? `, ${e.details}` : ""}`);
    }
  }
  return { id: "history", role: "assistant", text: lines.join("\n"), links: [trackerLink(ctx)] };
}

function answerContacts(ctx: TaskChatContext): ChatMessage {
  const { app, contacts } = ctx;
  if (contacts.length === 0) {
    return {
      id: "contacts",
      role: "assistant",
      text: `You have no networking contacts saved at ${app.company}. Add one on the Networking page and I can remind you about them here.`,
      links: [{ label: "Open Networking", href: `${ctx.origin.replace(/\/+$/, "")}/app/networking` }],
    };
  }
  const lines = [`People you know at ${app.company}:`];
  for (const c of contacts.slice(0, 5)) {
    lines.push(
      `- ${c.person_name}${c.next_step ? `: ${c.next_step}` : ""}${c.next_step_on ? ` (${fmtDay(c.next_step_on)})` : ""}`,
    );
  }
  return {
    id: "contacts",
    role: "assistant",
    text: lines.join("\n"),
    links: [{ label: "Open Networking", href: `${ctx.origin.replace(/\/+$/, "")}/app/networking` }],
  };
}

function answerNext(ctx: TaskChatContext): ChatMessage {
  const { app, today } = ctx;
  const links = [postingLink(ctx), trackerLink(ctx)].filter((l): l is ChatLink => l !== null);
  if (app.action_needed) {
    return {
      id: "next",
      role: "assistant",
      text: `Next step: ${app.action_needed}. ${duePhrase(app, today)}`,
      links,
    };
  }
  if (app.status === "OA Received" || app.oa_received) {
    return {
      id: "next",
      role: "assistant",
      text: "The assessment is the next step. Open the posting to find it, and mark the task done when it is submitted.",
      links,
    };
  }
  if (app.status === "Interview Invited" || app.status === "Interviewing" || app.status === "Final Round") {
    return {
      id: "next",
      role: "assistant",
      text: "The interview is the next step. Check the latest update for the time and format, and use the posting link if you need the role details again.",
      links,
    };
  }
  if (app.status === "Applied" && app.last_contact) {
    const quiet = daysBetween(app.last_contact, today);
    if (quiet >= 21) {
      return {
        id: "next",
        role: "assistant",
        text: `It has been ${quiet} days since you heard from them. A short follow up is the sensible next step.`,
        links,
      };
    }
  }
  return {
    id: "next",
    role: "assistant",
    text: `Nothing is waiting on you for ${app.company} right now. I will say so as soon as a task is added.`,
    links: [trackerLink(ctx)],
  };
}

function answerHelp(ctx: TaskChatContext): ChatMessage {
  return {
    id: "help",
    role: "assistant",
    text: `Happy to help. I can answer from what Pulse Find knows about ${ctx.app.company}: what is due and when, the posting link, the status and dates, what happened so far, and who you know there. I cannot look things up outside your tracker, but for anything bigger, Talk to Agent hands the whole thing to your connected agent.`,
  };
}

function answerFallback(ctx: TaskChatContext): ChatMessage {
  return {
    id: "fallback",
    role: "assistant",
    text: `Hmm, I do not know that one from your tracker data for ${ctx.app.company}. Try asking what is due, for the link, what happened so far, or who you know there. Or tap Talk to Agent and your connected agent can dig into it with you.`,
  };
}

/**
 * Answer one user question deterministically from the task context.
 * Never invents facts: every sentence comes from the application row, its
 * history, or its contacts, and the fallback says so when nothing matches.
 */
export function answerTaskQuestion(question: string, ctx: TaskChatContext): ChatMessage {
  const q = question.trim().toLowerCase();
  if (!q) return answerHelp(ctx);
  if (/^(hi|hey|hello|yo)\b/.test(q)) return taskChatGreeting(ctx);
  if (/\b(help|what can you do|what can i ask)\b/.test(q)) return answerHelp(ctx);
  if (/\b(due|deadline|when is it due|when do i|by when|overdue|how long)\b/.test(q)) return answerDue(ctx);
  if (/\b(link|posting|url|website|apply|open it)\b/.test(q)) return answerLink(ctx);
  if (/\b(next|should i|what do i do|what do i need|to-?do|todo)\b/.test(q)) return answerNext(ctx);
  if (/\b(who|contact|know|referr|network|recruiter|people)\b/.test(q)) return answerContacts(ctx);
  if (/\b(happen|history|update|news|heard|latest|so far|progress)\b/.test(q)) return answerHistory(ctx);
  if (/\b(status|where is|where are|how far|stage|applied)\b/.test(q)) return answerStatus(ctx);
  return answerFallback(ctx);
}

// ---------- Talk to Agent ----------

/**
 * One ready-to-paste prompt for the agent the user already connected
 * through Pulse Find MCP (Claude Code, Cursor, Copilot): the task, the chat
 * so far, and what the user is trying to do, followed by the FULL operator
 * prompt (every capability, the automatic setup, and the rules), so the
 * agent can pick the task up and set everything up on its own. It contains
 * no token: the agent already has its own access from the Connect page.
 */
export function buildTaskAgentHandoff(args: {
  ctx: TaskChatContext;
  messages: ChatMessage[];
}): string {
  const { ctx, messages } = args;
  const { app, events, contacts, today } = ctx;
  const userLines = messages.filter((m) => m.role === "user").map((m) => m.text.trim());
  const goal =
    userLines.length > 0
      ? userLines[userLines.length - 1]
      : app.action_needed || "Work through this task with me.";
  const lines: string[] = [
    "Help me with this Pulse Find task.",
    "",
    `Task: ${app.company}${app.role ? `, ${app.role}` : ""} (${app.track})`,
    `Status: ${app.status}. Applied ${app.date_applied ? fmtDay(app.date_applied) : "date not set"}. Last contact ${app.last_contact ? fmtDay(app.last_contact) : "none yet"}.`,
  ];
  if (app.action_needed) {
    lines.push(`Waiting on me: ${app.action_needed}. ${duePhrase(app, today)}`);
  }
  if (app.link) lines.push(`Posting: ${app.link}`);
  if (app.latest_update) lines.push(`Latest update: ${app.latest_update}`);
  if (app.oa_received) lines.push("An assessment was received for this role.");
  if (app.interviews_done > 0) lines.push(`Interviews done: ${app.interviews_done}.`);
  if (events.length > 0) {
    lines.push("History:");
    for (const e of events.slice(0, 5)) {
      lines.push(`- ${fmtDay(e.event_date)}: ${e.kind}${e.details ? `, ${e.details}` : ""}`);
    }
  }
  if (contacts.length > 0) {
    lines.push(`People at ${app.company}:`);
    for (const c of contacts.slice(0, 5)) {
      lines.push(
        `- ${c.person_name}${c.next_step ? `: ${c.next_step}` : ""}${c.next_step_on ? ` (${fmtDay(c.next_step_on)})` : ""}`,
      );
    }
  }
  if (userLines.length > 0) {
    lines.push("What I asked in the chat:");
    for (const q of userLines.slice(-5)) lines.push(`- ${q}`);
  }
  lines.push("", `What I am trying to do: ${goal}`, "");
  lines.push(
    "Here is the full prompt for how you work as my Pulse Find operator. " +
      "Follow it, starting with the setup in job 1, so I can hop back into the dashboard and start using it with nothing else to do.",
    "",
    buildAgentHandoffPrompt({ endpoint: getMcpEndpoint(ctx.origin) }),
  );
  return lines.join("\n");
}
