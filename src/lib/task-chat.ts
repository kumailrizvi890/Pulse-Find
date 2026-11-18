// Task chat: a small deterministic Q&A for one application, plus the
// "Talk to Agent" handoff summary.
//
// There is no LLM or chat endpoint in this repo, so the chatbot answers
// only from the tracker data Pulse Find already has: the application row,
// its history events, and networking contacts at the same company. Anything
// it cannot answer from that data is routed to the Talk to Agent handoff
// instead of guessed. All functions here are pure and take `today` so tests
// can pin the date. No em dashes in any user-facing string.

import { CLOSED, daysBetween, parseISO, weekStart } from "./metrics";
import { buildAgentHandoffPrompt, getMcpEndpoint } from "./agent-prompt";
import { dueBucket } from "./pipeline";
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
    /** Where the tracker itself lives: /app when signed in, /demo otherwise. */
    trackerPath: "/app" | "/demo";
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
  return { label: "Open your tracker", href: `${ctx.origin.replace(/\/+$/, "")}${ctx.trackerPath}` };
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
  // No tracker link here: every answer already carries one, so the
  // greeting plus the first answer showed the same "Open your tracker"
  // pill twice in a row. The posting link stays — it belongs to this task.
  const links = [postingLink(ctx)].filter((l): l is ChatLink => l !== null);
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
    // A dated contact owes a follow-up even when no step is written;
    // an undated one gets no step text at all.
    const step = c.next_step.trim() || (c.next_step_on ? "Follow up" : "");
    lines.push(
      `- ${c.person_name}${step ? `: ${step}` : ""}${c.next_step_on ? ` (${fmtDay(c.next_step_on)})` : ""}`,
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

// ---------- General chat: the whole tracker, not one task ----------

/**
 * The general chat answers from the whole tracker: every application, its
 * history, and the networking contacts. It is what opens from the navbar
 * "Ask Pulse" entry and the dashboard "Ask Pulse" button, so a visitor
 * can ask what is waiting, what is due next, who went quiet, or how the
 * week is going without opening a task first. Same rules as the task
 * chat: deterministic, never invents facts, anything it cannot answer
 * goes to the Talk to Agent handoff.
 */
export interface GeneralChatContext {
  apps: Application[];
  /** History for all applications, newest first. */
  events: TrackerEvent[];
  /** All networking contacts. */
  contacts: Contact[];
  today: ISODate;
  /** App origin, used for links back into the tracker. */
  origin: string;
  /** Quiet days after which a company counts as ghosted (the setting). */
  ghostDays: number;
  /** Applications per week the user is aiming for (the setting). */
  weeklyGoal: number;
  /** Where the tracker itself lives: /app when signed in, /demo otherwise. */
  trackerPath: "/app" | "/demo";
}

/** Tap-to-ask starters shown when the general chat opens. */
export const GENERAL_CHAT_SUGGESTIONS = [
  "What is waiting on me?",
  "What is due next?",
  "Who went quiet?",
  "How is my week going?",
] as const;

function generalTrackerLink(ctx: GeneralChatContext): ChatLink {
  return { label: "Open your tracker", href: `${ctx.origin.replace(/\/+$/, "")}${ctx.trackerPath}` };
}

function generalNetworkingLink(ctx: GeneralChatContext): ChatLink {
  return { label: "Open Networking", href: `${ctx.origin.replace(/\/+$/, "")}${ctx.trackerPath}/networking` };
}

function waitingApps(ctx: GeneralChatContext): Application[] {
  return ctx.apps.filter((a) => a.action_needed);
}

function bySoonestDue(a: Application, b: Application): number {
  return (a.action_due ?? "9999").localeCompare(b.action_due ?? "9999");
}

function ghostedApps(ctx: GeneralChatContext): { app: Application; quiet: number }[] {
  return ctx.apps
    .filter((a) => a.last_contact && !CLOSED.includes(a.status))
    .map((a) => ({ app: a, quiet: daysBetween(a.last_contact as ISODate, ctx.today) }))
    .filter(({ quiet }) => quiet >= ctx.ghostDays)
    .sort((x, y) => y.quiet - x.quiet);
}

function thisWeekCount(ctx: GeneralChatContext): number {
  const monday = weekStart(ctx.today);
  return ctx.apps.filter((a) => a.date_applied && a.date_applied >= monday).length;
}

/** The answer the general chat gives when it first opens. */
export function generalChatGreeting(ctx: GeneralChatContext): ChatMessage {
  const waiting = waitingApps(ctx);
  const lines = ["Hi, I'm Pulse. I can answer from your whole tracker, not just one task."];
  if (waiting.length === 0) {
    lines.push("Nothing is waiting on you right now. Your tracker is all caught up.");
  } else {
    const soonest = [...waiting].sort(bySoonestDue)[0];
    lines.push(
      `${waiting.length} thing${waiting.length === 1 ? "" : "s"} waiting on you. Soonest: ${soonest.company}, ${soonest.action_needed}. ${duePhrase(soonest, ctx.today)}`,
    );
  }
  lines.push("Ask me what is waiting, what is due next, who went quiet, or how your week is going.");
  // No tracker link here, for the same reason as the task greeting: the
  // first answer already carries one, and the greeting plus that answer
  // showed the same pill twice in a row.
  return { id: "greeting", role: "assistant", text: lines.join(" ") };
}

function answerGeneralWaiting(ctx: GeneralChatContext): ChatMessage {
  const waiting = [...waitingApps(ctx)].sort(bySoonestDue);
  if (waiting.length === 0) {
    return {
      id: "waiting",
      role: "assistant",
      text: "Nothing is waiting on you right now. No assessments to finish, no interviews to schedule, no forms half done.",
      links: [generalTrackerLink(ctx)],
    };
  }
  const lines = [`${waiting.length} thing${waiting.length === 1 ? "" : "s"} waiting on you:`];
  for (const a of waiting.slice(0, 5)) {
    lines.push(`- ${a.company}${a.role ? `, ${a.role}` : ""}: ${a.action_needed}. ${duePhrase(a, ctx.today)}`);
  }
  if (waiting.length > 5) lines.push(`And ${waiting.length - 5} more in your tracker.`);
  return { id: "waiting", role: "assistant", text: lines.join("\n"), links: [generalTrackerLink(ctx)] };
}

function answerGeneralQuiet(ctx: GeneralChatContext): ChatMessage {
  const ghosted = ghostedApps(ctx);
  if (ghosted.length === 0) {
    return {
      id: "quiet",
      role: "assistant",
      text: `Nobody has gone quiet. Nobody you applied to has been silent for ${ctx.ghostDays} days or more.`,
      links: [generalTrackerLink(ctx)],
    };
  }
  const lines = [
    `${ghosted.length} ${ghosted.length === 1 ? "company has" : "companies have"} gone quiet (${ctx.ghostDays}+ days with no reply):`,
  ];
  for (const { app, quiet } of ghosted.slice(0, 5)) {
    lines.push(
      `- ${app.company}${app.role ? `, ${app.role}` : ""}: last heard ${fmtDay(app.last_contact)}, ${quiet} day${quiet === 1 ? "" : "s"} ago.`,
    );
  }
  lines.push("A short follow up is the sensible next step for the quietest one.");
  return { id: "quiet", role: "assistant", text: lines.join("\n"), links: [generalTrackerLink(ctx)] };
}

function answerGeneralWeek(ctx: GeneralChatContext): ChatMessage {
  const week = thisWeekCount(ctx);
  const interviews = ctx.apps.filter((a) => a.interviews_done > 0).length;
  const offers = ctx.apps.filter((a) => a.status === "Offer" || a.status === "Accepted").length;
  const goalWord =
    week >= ctx.weeklyGoal
      ? "You hit your weekly goal."
      : `${ctx.weeklyGoal - week} more to hit your weekly goal of ${ctx.weeklyGoal}.`;
  return {
    id: "week",
    role: "assistant",
    text: `This week you applied to ${week}. ${goalWord} All time: ${ctx.apps.length} applications, ${interviews} with interviews, ${offers} offer${offers === 1 ? "" : "s"}.`,
    links: [generalTrackerLink(ctx)],
  };
}

function answerGeneralStatus(ctx: GeneralChatContext): ChatMessage {
  const total = ctx.apps.length;
  const counts = {
    applied: ctx.apps.filter((a) => a.status === "Applied").length,
    assessments: ctx.apps.filter((a) => a.status === "OA Received" || a.status === "OA Completed").length,
    interviews: ctx.apps.filter(
      (a) => a.status === "Recruiter Screen" || a.status === "Interview Invited" || a.status === "Interviewing" || a.status === "Final Round",
    ).length,
    offers: ctx.apps.filter((a) => a.status === "Offer" || a.status === "Accepted").length,
    rejected: ctx.apps.filter((a) => a.status === "Rejected" || a.status === "Withdrawn").length,
  };
  const parts = [`${total} application${total === 1 ? "" : "s"} in total.`];
  if (counts.applied > 0) parts.push(`${counts.applied} still at Applied.`);
  if (counts.assessments > 0) parts.push(`${counts.assessments} with assessments.`);
  if (counts.interviews > 0) parts.push(`${counts.interviews} in interviews.`);
  if (counts.offers > 0) parts.push(`${counts.offers} offer${counts.offers === 1 ? "" : "s"}.`);
  if (counts.rejected > 0) parts.push(`${counts.rejected} rejected or withdrawn.`);
  if (total === 0) parts.push("Add your first application and I can keep track of it here.");
  return { id: "status", role: "assistant", text: parts.join(" "), links: [generalTrackerLink(ctx)] };
}

function answerGeneralContacts(ctx: GeneralChatContext): ChatMessage {
  // Same due rule as the dashboard and Networking section: a contact is
  // due when it has a date on or before today, whether or not a step is
  // written down for it yet.
  const due = ctx.contacts
    .filter((c) => {
      const bucket = dueBucket(c, ctx.today);
      return bucket === "overdue" || bucket === "today";
    })
    .sort((a, b) => (a.next_step_on as string).localeCompare(b.next_step_on as string));
  if (due.length === 0) {
    return {
      id: "contacts",
      role: "assistant",
      text: `You have ${ctx.contacts.length} networking contact${ctx.contacts.length === 1 ? "" : "s"} saved and no follow-ups due right now.`,
      links: [generalNetworkingLink(ctx)],
    };
  }
  const lines = [`${due.length} follow-up${due.length === 1 ? "" : "s"} due:`];
  for (const c of due.slice(0, 5)) {
    lines.push(
      `- ${c.person_name}${c.company ? ` (${c.company})` : ""}: ${c.next_step.trim() || "Follow up"} (${fmtDay(c.next_step_on)}).`,
    );
  }
  return { id: "contacts", role: "assistant", text: lines.join("\n"), links: [generalNetworkingLink(ctx)] };
}

function answerGeneralHelp(): ChatMessage {
  return {
    id: "help",
    role: "assistant",
    text: "Happy to help. I can answer from your whole tracker: what is waiting on you, what is due next, who went quiet, how your week is going, your overall status, and who is due a follow-up. I cannot look things up outside your tracker, but for anything bigger, Talk to Agent hands the whole thing to your connected agent.",
  };
}

function answerGeneralFallback(): ChatMessage {
  return {
    id: "fallback",
    role: "assistant",
    text: "Hmm, I do not know that one from your tracker data. Try asking what is waiting on you, what is due next, who went quiet, or how your week is going. Or tap Talk to Agent and your connected agent can dig into it with you.",
  };
}

/**
 * Answer one user question deterministically from the whole tracker.
 * Same honesty rule as the task chat: every sentence comes from the
 * tracker data, and the fallback says so when nothing matches.
 */
export function answerGeneralQuestion(question: string, ctx: GeneralChatContext): ChatMessage {
  const q = question.trim().toLowerCase();
  if (!q) return answerGeneralHelp();
  if (/^(hi|hey|hello|yo)\b/.test(q)) return generalChatGreeting(ctx);
  if (/\b(help|what can you do|what can i ask)\b/.test(q)) return answerGeneralHelp();
  // "Who went quiet?" has both "who" and "quiet": check quiet first.
  if (/\b(quiet|ghost|silent|no reply|heard from)\b/.test(q)) return answerGeneralQuiet(ctx);
    // Networking follow-ups name people, not application tasks: check them
    // before the generic "what is due / waiting" handler, which would
    // otherwise answer a "follow-ups due" question with the waiting
    // applications. "networking" and "follow-ups" do not match the
    // word-boundary checks below (networking carries a suffix, follow-ups
    // a plural), so this check spells the variants out.
    if (/\b(networking|follow[- ]?ups?|contacts?)\b/.test(q)) return answerGeneralContacts(ctx);
  if (/\b(waiting|due|deadline|next|should i|what do i do|to-?do|todo)\b/.test(q)) return answerGeneralWaiting(ctx);
  if (/\b(week|pace|goal|applied this week|progress)\b/.test(q)) return answerGeneralWeek(ctx);
  if (/\b(who|contact|know|people|network|recruiter|follow-?up)\b/.test(q)) return answerGeneralContacts(ctx);
  if (/\b(status|where|how far|stage|total|summary|overview|how is it going)\b/.test(q)) return answerGeneralStatus(ctx);
  return answerGeneralFallback();
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
      const step = c.next_step.trim() || (c.next_step_on ? "Follow up" : "");
      lines.push(
        `- ${c.person_name}${step ? `: ${step}` : ""}${c.next_step_on ? ` (${fmtDay(c.next_step_on)})` : ""}`,
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

/**
 * The general handoff: same shape as the task handoff, but tracker-wide,
 * what is waiting, who went quiet, and the week so far, followed by the
 * FULL operator prompt. No token in here either.
 */
export function buildGeneralAgentHandoff(args: {
  ctx: GeneralChatContext;
  messages: ChatMessage[];
}): string {
  const { ctx, messages } = args;
  const userLines = messages.filter((m) => m.role === "user").map((m) => m.text.trim());
  const goal =
    userLines.length > 0
      ? userLines[userLines.length - 1]
      : "Work through what is waiting on me.";
  const waiting = [...waitingApps(ctx)].sort(bySoonestDue);
  const ghosted = ghostedApps(ctx);
  const lines: string[] = [
    "Help me with my Pulse Find tracker.",
    "",
    `${ctx.apps.length} applications in total. This week: ${thisWeekCount(ctx)} applied, weekly goal ${ctx.weeklyGoal}.`,
  ];
  if (waiting.length > 0) {
    lines.push("Waiting on me:");
    for (const a of waiting.slice(0, 8)) {
      lines.push(
        `- ${a.company}${a.role ? `, ${a.role}` : ""} (${a.status}): ${a.action_needed}. ${duePhrase(a, ctx.today)}`,
      );
    }
  } else {
    lines.push("Nothing is waiting on me right now.");
  }
  if (ghosted.length > 0) {
    lines.push("Gone quiet:");
    for (const { app, quiet } of ghosted.slice(0, 5)) {
      lines.push(`- ${app.company}: last heard ${fmtDay(app.last_contact)}, ${quiet} days ago.`);
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
