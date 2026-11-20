// Task chat: a small deterministic Q&A for one application, plus the
// "Talk to Agent" handoff summary.
//
// There is no LLM or chat endpoint in this repo, so the chatbot answers
// only from the tracker data Pulse Find already has: the application row,
// its history events, and networking contacts at the same company. Anything
// it cannot answer from that data is routed to the Talk to Agent handoff
// instead of guessed. All functions here are pure and take `today` so tests
// can pin the date. No em dashes in any user-facing string.

import {
  addDays,
  applicationResponseRate,
  CLOSED,
  contactResponseRate,
  daysBetween,
  hasOA,
  OFFER_STAGE,
  parseISO,
  reachedInterview,
  weekStart,
} from "./metrics";
import { buildAgentHandoffPrompt, getMcpEndpoint } from "./agent-prompt";
import { dueBucket } from "./pipeline";
import type { Application, Contact, ISODate, Lead, TrackerEvent } from "./types";

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
  /** Leads, when the panel has loaded them. Absent for the landing beat, which answers from applications only. */
  leads?: Lead[];
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
  lines.push(
    "Ask me what is waiting, what is due next, who went quiet, or how your week is going. You can also ask about any company, like whether you have an assessment from them.",
  );
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

// ---------- Company and person lookup: any name in the tracker ----------

function leadsOf(ctx: GeneralChatContext): Lead[] {
  return ctx.leads ?? [];
}

/** "Harbor & Pike" becomes "harbor and pike": one comparable shape for names and questions. */
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function nameTokens(s: string): string[] {
  const n = normalizeName(s);
  return n ? n.split(" ") : [];
}

/** True when the name's words appear in order inside the question's words. */
function nameInQuestion(name: string, questionTokens: string[]): boolean {
  const nt = nameTokens(name);
  if (nt.length === 0) return false;
  for (let i = 0; i + nt.length <= questionTokens.length; i += 1) {
    if (nt.every((t, j) => questionTokens[i + j] === t)) return true;
  }
  return false;
}

/**
 * Every company the tracker knows (applications, leads, contacts), with
 * first-word aliases when they point at exactly one company ("Northwind"
 * for "Northwind Labs"). The longest match wins, so a full name beats
 * its own alias.
 */
function knownCompanies(ctx: GeneralChatContext): { name: string; display: string }[] {
  const byNorm = new Map<string, string>();
  const add = (company: string) => {
    const norm = normalizeName(company);
    if (norm && !byNorm.has(norm)) byNorm.set(norm, company);
  };
  for (const a of ctx.apps) add(a.company);
  for (const l of leadsOf(ctx)) add(l.company);
  for (const c of ctx.contacts) add(c.company);
  const out = [...byNorm.entries()].map(([norm, display]) => ({ name: norm, display }));
  const firstWord = new Map<string, string>();
  for (const { name, display } of out) {
    const first = name.split(" ")[0];
    if (!first || first.length < 3) continue;
    if (firstWord.has(first) && firstWord.get(first) !== display) firstWord.set(first, "");
    else if (!firstWord.has(first)) firstWord.set(first, display);
  }
  for (const [first, display] of firstWord) {
    if (display) out.push({ name: first, display });
  }
  return out;
}

/** The company named in the question, if the tracker knows one. Longest match wins. */
function findKnownCompany(question: string, ctx: GeneralChatContext): string | null {
  const tokens = nameTokens(question);
  let best: { name: string; display: string } | null = null;
  for (const cand of knownCompanies(ctx)) {
    if (nameInQuestion(cand.name, tokens) && (!best || cand.name.length > best.name.length)) best = cand;
  }
  return best?.display ?? null;
}

/** The contact named in the question, if one is saved. Longest match wins. */
function findKnownPerson(question: string, ctx: GeneralChatContext): Contact | null {
  const tokens = nameTokens(question);
  let best: Contact | null = null;
  for (const c of ctx.contacts) {
    if (nameInQuestion(c.person_name, tokens) && (!best || c.person_name.length > best.person_name.length)) best = c;
  }
  return best;
}

/** Words that are never a company name on their own. */
const COMPANY_CANDIDATE_BLOCK = new Set([
  "my week", "my tracker", "the tracker", "the week", "my job", "a job",
  "it", "this", "that", "everything", "anything", "work", "school",
  "them", "him", "her", "us", "me", "you",
  "tracker", "dashboard", "week", "day", "today", "tomorrow", "home",
]);

/**
 * A company the tracker does NOT know, pulled from the tail of a
 * company-shaped question ("an assessment from Roblox", "applied to
 * Acme", "my status at Globex"). Only the preposition + tail shape
 * counts, so "what is waiting on me" or "how is my week going" never
 * yields a phantom company. "To" only counts after apply ("applied to
 * Acme"), never after "follow up" or "do". Title-cased for display.
 */
function extractUnknownCompany(question: string): string | null {
  const m =
    question.match(/(?:\bfrom|\bat|\bwith|\bfor|\babout)\s+([a-z0-9][a-z0-9&' .-]*?)\s*(?:\?|$)/) ??
    question.match(/\bappl(?:y|ied|ying)?\s+to\s+([a-z0-9][a-z0-9&' .-]*?)\s*(?:\?|$)/);
  if (!m) return null;
  let cand = m[1]
    .replace(/\b(assessment|assessments|oa|interview|interviews|offer|offers|job|jobs|role|roles|application|applications|status|update|updates|news|yet|any|anymore|still|there)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // "apply to at Acme" leaves a second preposition at the front: drop it.
  cand = cand.replace(/^(from|at|with|for|to|about|the|a|an|my)\s+/, "");
  if (!cand || cand.length > 40) return null;
  if (COMPANY_CANDIDATE_BLOCK.has(cand)) return null;
  return cand
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Append a period when the sentence does not already end with one. */
function endSentence(s: string): string {
  return s.endsWith(".") || s.endsWith("!") || s.endsWith("?") ? s : `${s}.`;
}

function companyApps(ctx: GeneralChatContext, company: string): Application[] {
  const norm = normalizeName(company);
  return ctx.apps.filter((a) => normalizeName(a.company) === norm);
}

function companyLeads(ctx: GeneralChatContext, company: string): Lead[] {
  const norm = normalizeName(company);
  return leadsOf(ctx).filter((l) => normalizeName(l.company) === norm);
}

function companyContacts(ctx: GeneralChatContext, company: string): Contact[] {
  const norm = normalizeName(company);
  return ctx.contacts.filter((c) => normalizeName(c.company) === norm);
}

function appSummaryLine(a: Application, ctx: GeneralChatContext): string {
  const parts = [`${a.role}: ${a.status}`];
  if (a.date_applied) parts.push(`applied ${fmtDay(a.date_applied)}`);
  if (a.last_contact) {
    const quiet = daysBetween(a.last_contact, ctx.today);
    parts.push(quiet <= 0 ? "last contact today" : `last heard ${fmtDay(a.last_contact)}, ${quiet} day${quiet === 1 ? "" : "s"} ago`);
  }
  if (a.oa_received) parts.push("assessment received");
  if (a.interviews_done > 0) parts.push(`${a.interviews_done} interview${a.interviews_done === 1 ? "" : "s"} done`);
  if (a.action_needed) parts.push(`waiting on you: ${a.action_needed}. ${duePhrase(a, ctx.today)}`);
  if (a.latest_update) parts.push(`Latest: ${a.latest_update}`);
  return `- ${endSentence(parts.join(". "))}`;
}

/** One company, any question about it: status, assessment, dates, people, leads. */
function answerGeneralCompany(company: string, q: string, ctx: GeneralChatContext, known: boolean): ChatMessage {
  const apps = companyApps(ctx, company);
  const leads = companyLeads(ctx, company);
  const contacts = companyContacts(ctx, company);
  const links = [generalTrackerLink(ctx)];
  if (!known) {
    const lines = [`No application at ${company} is in your tracker.`];
    if (/\b(assessment|oa|hackerrank|codesignal|online test|interview|offer)\b/.test(q)) {
      lines.push(`So there is no assessment, interview or offer from ${company} in your tracker either.`);
    }
    if (leads.length > 0) {
      lines.push(`You do have ${leads.length === 1 ? "a lead" : `${leads.length} leads`} there: ${leads.map((l) => `${l.role} (${l.status})`).join(", ")}.`);
    } else if (contacts.length > 0) {
      lines.push(`No lead there either, but you know ${contacts.map((c) => c.person_name).join(", ")} at ${company}.`);
    } else {
      lines.push("Nothing saved for them yet, no lead and no contact there.");
    }
    lines.push("If you apply, add it on the Tracker page and I can keep track of it.");
    return { id: "company", role: "assistant", text: lines.join(" "), links };
  }
  if (/\b(assessment|oa|hackerrank|codesignal|online test)\b/.test(q)) {
    const withOA = apps.filter((a) => hasOA(a));
    if (withOA.length === 0) {
      const lines = [`No assessment from ${company} in your tracker.`];
      if (apps.length > 0) lines.push(apps.map((a) => `${a.role} is ${a.status}`).join(" "));
      return { id: "company-oa", role: "assistant", text: lines.join(" "), links };
    }
    const lines = [`Yes, ${company} sent an assessment:`];
    for (const a of withOA) {
      const bits = [`${a.role}`];
      if (a.latest_update) bits.push(a.latest_update);
      if (a.action_needed) bits.push(`${a.action_needed}. ${duePhrase(a, ctx.today)}`);
      lines.push(`- ${endSentence(bits.join(". "))}`);
    }
    return { id: "company-oa", role: "assistant", text: lines.join("\n"), links };
  }
  if (/\b(interview|interviews)\b/.test(q)) {
    const atStage = apps.filter((a) => reachedInterview(a));
    if (atStage.length === 0) {
      const lines = [`No interviews at ${company} in your tracker.`];
      if (apps.length > 0) lines.push(apps.map((a) => `${a.role} is ${a.status}`).join(" "));
      return { id: "company-interview", role: "assistant", text: lines.join(" "), links };
    }
    const lines = [`Interviews at ${company}:`];
    for (const a of atStage) {
      const bits = [`${a.role}: ${a.status}`];
      if (a.interviews_done > 0) bits.push(`${a.interviews_done} interview${a.interviews_done === 1 ? "" : "s"} done`);
      if (a.latest_update) bits.push(a.latest_update);
      if (a.action_needed) bits.push(`${a.action_needed}. ${duePhrase(a, ctx.today)}`);
      lines.push(`- ${endSentence(bits.join(". "))}`);
    }
    return { id: "company-interview", role: "assistant", text: lines.join("\n"), links };
  }
  if (/\b(offer|offers)\b/.test(q)) {
    const withOffer = apps.filter((a) => OFFER_STAGE.includes(a.status));
    if (withOffer.length === 0) {
      return { id: "company-offer", role: "assistant", text: `No offer from ${company} in your tracker.`, links };
    }
    const lines = [`Offers from ${company}:`];
    for (const a of withOffer) {
      const bits = [`${a.role}: ${a.status}`];
      if (a.latest_update) bits.push(a.latest_update);
      if (a.action_needed) bits.push(`${a.action_needed}. ${duePhrase(a, ctx.today)}`);
      lines.push(`- ${endSentence(bits.join(". "))}`);
    }
    return { id: "company-offer", role: "assistant", text: lines.join("\n"), links };
  }
  if (/\bwhen\b/.test(q) && /\bappl/.test(q)) {
    if (apps.length === 0) {
      return { id: "company", role: "assistant", text: `You have not applied at ${company} yet.`, links };
    }
    const lines = apps.map((a) => `- ${a.role}: applied ${a.date_applied ? fmtDay(a.date_applied) : "date not set"}.`);
    return { id: "company", role: "assistant", text: `Applied at ${company}:\n${lines.join("\n")}`, links };
  }
  if (/\bwhat\b/.test(q) && /\bappl/.test(q)) {
    if (apps.length === 0) {
      return { id: "company", role: "assistant", text: `You have not applied at ${company} yet.`, links };
    }
    const lines = apps.map((a) => `- ${a.role}: ${a.status}.`);
    return { id: "company", role: "assistant", text: `You applied to this at ${company}:\n${lines.join("\n")}`, links };
  }
  if (/\b(who|know|contact|people|network|recruiter)\b/.test(q)) {
    if (contacts.length === 0) {
      return {
        id: "company",
        role: "assistant",
        text: `You have no networking contacts saved at ${company}.`,
        links: [generalNetworkingLink(ctx)],
      };
    }
    const lines = [`People you know at ${company}:`];
    for (const c of contacts.slice(0, 5)) {
      const step = c.next_step.trim() || (c.next_step_on ? "Follow up" : "");
      lines.push(`- ${c.person_name}${step ? `: ${step}` : ""}${c.next_step_on ? ` (${fmtDay(c.next_step_on)})` : ""}.`);
    }
    return { id: "company", role: "assistant", text: lines.join("\n"), links: [generalNetworkingLink(ctx)] };
  }
  if (/\bleads?\b/.test(q)) {
    if (leads.length === 0) {
      return { id: "company", role: "assistant", text: `No leads saved at ${company}.`, links };
    }
    const lines = [`Leads at ${company}:`];
    for (const l of leads) {
      lines.push(`- ${l.role} (${l.status})${l.location ? `, ${l.location}` : ""}${l.fit_note ? `. ${l.fit_note}` : ""}.`);
    }
    return { id: "company", role: "assistant", text: lines.join("\n"), links };
  }
  const lines = [`${company}:`];
  for (const a of apps) lines.push(appSummaryLine(a, ctx));
  const appIds = new Set(apps.map((a) => a.id));
  const recent = ctx.events.filter((e) => appIds.has(e.application_id)).slice(0, 3);
  if (recent.length > 0) {
    lines.push("Recent history:");
    for (const e of recent) {
      lines.push(`- ${fmtDay(e.event_date)}: ${e.kind}${e.details ? `, ${e.details}` : ""}.`);
    }
  }
  if (leads.length > 0) lines.push(`Leads there: ${leads.map((l) => `${l.role} (${l.status})`).join(", ")}.`);
  if (contacts.length > 0) lines.push(`People you know there: ${contacts.map((c) => c.person_name).join(", ")}.`);
  return { id: "company", role: "assistant", text: lines.join("\n"), links };
}

/** One saved person, by name: status, next step, last touch. */
function answerGeneralPerson(person: Contact, ctx: GeneralChatContext): ChatMessage {
  const lines = [`${person.person_name}${person.company ? ` (${person.company})` : ""}: ${person.status || "no status saved"}.`];
  const step = person.next_step.trim() || (person.next_step_on ? "Follow up" : "");
  if (step) lines.push(`Next step: ${step}${person.next_step_on ? ` (${fmtDay(person.next_step_on)})` : ""}.`);
  if (person.last_contacted) lines.push(`Last in touch ${fmtDay(person.last_contacted)}.`);
  if (person.notes) lines.push(person.notes);
  return { id: "person", role: "assistant", text: lines.join(" "), links: [generalNetworkingLink(ctx)] };
}

// ---------- Stage counts and lists ----------

function answerGeneralOAs(ctx: GeneralChatContext): ChatMessage {
  const oas = ctx.apps.filter((a) => hasOA(a));
  if (oas.length === 0) {
    return { id: "oas", role: "assistant", text: "No assessments in your tracker yet. Nothing has sent you one.", links: [generalTrackerLink(ctx)] };
  }
  const lines = [`${oas.length} assessment${oas.length === 1 ? "" : "s"}:`];
  for (const a of oas.slice(0, 5)) {
    const bits = [`${a.company}${a.role ? `, ${a.role}` : ""}`];
    if (a.latest_update) bits.push(a.latest_update);
    if (a.action_needed) bits.push(`${a.action_needed}. ${duePhrase(a, ctx.today)}`);
    lines.push(`- ${endSentence(bits.join(". "))}`);
  }
  if (oas.length > 5) lines.push(`And ${oas.length - 5} more in your tracker.`);
  return { id: "oas", role: "assistant", text: lines.join("\n"), links: [generalTrackerLink(ctx)] };
}

function answerGeneralInterviews(ctx: GeneralChatContext): ChatMessage {
  // Same membership as the dashboard Interviews panel: reachedInterview
  // folds in offer-stage rows (an offer means interviews happened) and
  // rejected rows with interviews done. Active first, then most recently
  // contacted, so the finished rows sit at the end, marked closed.
  const list = ctx.apps
    .filter((a) => reachedInterview(a))
    .sort(
      (a, b) =>
        Number(CLOSED.includes(a.status)) - Number(CLOSED.includes(b.status)) ||
        (b.last_contact ?? "").localeCompare(a.last_contact ?? ""),
    );
  if (list.length === 0) {
    return { id: "interviews", role: "assistant", text: "No interviews in your tracker yet.", links: [generalTrackerLink(ctx)] };
  }
  const active = list.filter((a) => !CLOSED.includes(a.status)).length;
  const lines = [`${list.length} ${list.length === 1 ? "application" : "applications"} reached interview stage, ${active} still active:`];
  for (const a of list.slice(0, 5)) {
    const finished = CLOSED.includes(a.status);
    const bits = [`${a.company}${a.role ? `, ${a.role}` : ""}: ${a.status}${finished ? " (Closed)" : ""}`];
    if (a.interviews_done > 0) bits.push(`${a.interviews_done} interview${a.interviews_done === 1 ? "" : "s"} done`);
    if (a.latest_update) bits.push(a.latest_update);
    if (a.action_needed) bits.push(`${a.action_needed}. ${duePhrase(a, ctx.today)}`);
    lines.push(`- ${endSentence(bits.join(". "))}`);
  }
  if (list.length > 5) lines.push(`And ${list.length - 5} more in your tracker.`);
  return { id: "interviews", role: "assistant", text: lines.join("\n"), links: [generalTrackerLink(ctx)] };
}
function answerGeneralRejections(ctx: GeneralChatContext): ChatMessage {
  const list = ctx.apps.filter((a) => a.status === "Rejected");
  const withdrawn = ctx.apps.filter((a) => a.status === "Withdrawn").length;
  if (list.length === 0) {
    return {
      id: "rejections",
      role: "assistant",
      text:
        withdrawn > 0
          ? `No rejections in your tracker, but ${withdrawn} ${withdrawn === 1 ? "application was" : "applications were"} withdrawn.`
          : "No rejections in your tracker yet.",
      links: [generalTrackerLink(ctx)],
    };
  }
  const lines = [`${list.length} rejection${list.length === 1 ? "" : "s"}:`];
  for (const a of list.slice(0, 5)) {
    const bits = [`${a.company}${a.role ? `, ${a.role}` : ""}`];
    if (a.latest_update) bits.push(a.latest_update);
    if (a.last_contact) bits.push(fmtDay(a.last_contact));
    lines.push(`- ${endSentence(bits.join(". "))}`);
  }
  if (list.length > 5) lines.push(`And ${list.length - 5} more in your tracker.`);
  return { id: "rejections", role: "assistant", text: lines.join("\n"), links: [generalTrackerLink(ctx)] };
}

function answerGeneralOffers(ctx: GeneralChatContext): ChatMessage {
  const list = ctx.apps.filter((a) => OFFER_STAGE.includes(a.status));
  if (list.length === 0) {
    return { id: "offers", role: "assistant", text: "No offers in your tracker yet.", links: [generalTrackerLink(ctx)] };
  }
  const lines = [`${list.length} offer${list.length === 1 ? "" : "s"}:`];
  for (const a of list.slice(0, 5)) {
    const bits = [`${a.company}${a.role ? `, ${a.role}` : ""}: ${a.status}`];
    if (a.latest_update) bits.push(a.latest_update);
    if (a.action_needed) bits.push(`${a.action_needed}. ${duePhrase(a, ctx.today)}`);
    lines.push(`- ${endSentence(bits.join(". "))}`);
  }
  if (list.length > 5) lines.push(`And ${list.length - 5} more in your tracker.`);
  return { id: "offers", role: "assistant", text: lines.join("\n"), links: [generalTrackerLink(ctx)] };
}

// ---------- Timeline, leads, response rate, due window ----------

function answerGeneralHistory(ctx: GeneralChatContext, days: number): ChatMessage {
  const since = addDays(ctx.today, -days);
  const byId = new Map(ctx.apps.map((a) => [a.id, a]));
  const recent = ctx.events
    .filter((e) => e.event_date >= since && e.event_date <= ctx.today)
    .sort((a, b) => b.event_date.localeCompare(a.event_date));
  if (recent.length === 0) {
    return {
      id: "history",
      role: "assistant",
      text: days === 1 ? "Nothing new since yesterday." : `Nothing new in the last ${days} days.`,
      links: [generalTrackerLink(ctx)],
    };
  }
  const windowWord = days === 1 ? "since yesterday" : `in the last ${days} days`;
  const lines = [`What happened ${windowWord}:`];
  for (const e of recent.slice(0, 8)) {
    const app = byId.get(e.application_id);
    lines.push(`- ${fmtDay(e.event_date)}: ${app ? `${app.company}, ` : ""}${e.kind}${e.details ? `, ${e.details}` : ""}.`);
  }
  if (recent.length > 8) lines.push(`And ${recent.length - 8} more events in your tracker.`);
  return { id: "history", role: "assistant", text: lines.join("\n"), links: [generalTrackerLink(ctx)] };
}

function answerGeneralLeads(ctx: GeneralChatContext): ChatMessage {
  const all = leadsOf(ctx);
  const open = all.filter((l) => l.status === "New" || l.status === "Queued");
  const links = [{ label: "Open Leads", href: `${ctx.origin.replace(/\/+$/, "")}${ctx.trackerPath}/leads` }];
  if (open.length === 0) {
    return {
      id: "leads",
      role: "assistant",
      text: all.length === 0 ? "No leads saved yet." : "No open leads right now.",
      links,
    };
  }
  const lines = [`${open.length} open lead${open.length === 1 ? "" : "s"}:`];
  for (const l of open.slice(0, 5)) {
    const bits = [`${l.company}, ${l.role} (${l.status})`];
    if (l.location) bits.push(l.location);
    if (l.pay) bits.push(l.pay);
    if (l.fit_note) bits.push(l.fit_note);
    lines.push(`- ${endSentence(bits.join(". "))}`);
  }
  if (open.length > 5) lines.push(`And ${open.length - 5} more in your tracker.`);
  return { id: "leads", role: "assistant", text: lines.join("\n"), links };
}

function answerGeneralResponseRate(ctx: GeneralChatContext): ChatMessage {
  const apps = applicationResponseRate(ctx.apps);
  const contacts = contactResponseRate(ctx.contacts);
  const appPct = Math.round(apps.rate * 100);
  const contactPct = Math.round(contacts.rate * 100);
  const text =
    `Your application response rate is ${appPct}% (${apps.responded} of ${apps.total} applications got a reply, meaning the status moved past Applied). ` +
    `Networking is ${contactPct}% (${contacts.responded} of ${contacts.total} contacts responded).`;
  return { id: "response-rate", role: "assistant", text, links: [generalTrackerLink(ctx)] };
}

function answerGeneralDueWindow(ctx: GeneralChatContext): ChatMessage {
  const due = waitingApps(ctx)
    .filter((a) => a.action_due && a.action_due <= addDays(ctx.today, 7))
    .sort(bySoonestDue);
  if (due.length === 0) {
    return { id: "due-week", role: "assistant", text: "Nothing is due in the next 7 days.", links: [generalTrackerLink(ctx)] };
  }
  const lines = [`${due.length} thing${due.length === 1 ? "" : "s"} due in the next 7 days:`];
  for (const a of due.slice(0, 5)) {
    lines.push(`- ${a.company}${a.role ? `, ${a.role}` : ""}: ${a.action_needed}. ${duePhrase(a, ctx.today)}`);
  }
  if (due.length > 5) lines.push(`And ${due.length - 5} more in your tracker.`);
  return { id: "due-week", role: "assistant", text: lines.join("\n"), links: [generalTrackerLink(ctx)] };
}

function answerGeneralHelp(): ChatMessage {
  return {
    id: "help",
    role: "assistant",
    text: "Happy to help. I can answer from your whole tracker: any company, like whether you have an assessment from them or when you applied; how many OAs, interviews, rejections or offers you have; what is waiting on you and what is due this week; what happened this week; your leads; who you know at a company; and your response rate. I cannot look things up outside your tracker, but for anything bigger, Talk to Agent hands the whole thing to your connected agent.",
  };
}

function answerGeneralFallback(): ChatMessage {
  return {
    id: "fallback",
    role: "assistant",
    text: "Hmm, I do not know that one from your tracker data. I can answer about any company, like whether you have an assessment from them, how many OAs, interviews, rejections or offers you have, what is due this week, what happened this week, your leads, and your response rate. Or tap Talk to Agent and your connected agent can dig into it with you.",
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
  // A named person or company beats every generic handler: "Do I have an
  // assessment from Roblox?" is a company question, not a status one.
  const person = findKnownPerson(q, ctx);
  if (person) return answerGeneralPerson(person, ctx);
  const company = findKnownCompany(q, ctx);
  if (company) return answerGeneralCompany(company, q, ctx, true);
  const unknown = extractUnknownCompany(q);
  if (unknown) return answerGeneralCompany(unknown, q, ctx, false);
  // "What happened this week?" is history, not the week-count summary.
  if (/\b(happened|happen|what'?s new|what is new|new since|since yesterday|recent|latest news)\b/.test(q)) {
    return answerGeneralHistory(ctx, /\bsince yesterday\b/.test(q) ? 1 : 7);
  }
  // Stage counts and lists: "how many OAs", "what interviews are coming up".
  if (/\b(oa|oas|assessment|assessments|online test)\b/.test(q)) return answerGeneralOAs(ctx);
  if (/\b(interview|interviews)\b/.test(q)) return answerGeneralInterviews(ctx);
  if (/\b(reject|rejection|rejections|rejected|turned down)\b/.test(q)) return answerGeneralRejections(ctx);
  if (/\b(offer|offers)\b/.test(q)) return answerGeneralOffers(ctx);
  if (/\b(response rate|reply rate|responded)\b/.test(q)) return answerGeneralResponseRate(ctx);
  if (/\b(leads?)\b/.test(q)) return answerGeneralLeads(ctx);
  // Networking follow-ups name people, not application tasks: check them
  // before the generic "what is due / waiting" handler, which would
  // otherwise answer a "follow-ups due" question with the waiting
  // applications. "networking" and "follow-ups" do not match the
  // word-boundary checks below (networking carries a suffix, follow-ups
  // a plural), so this check spells the variants out.
  if (/\b(networking|follow[- ]?ups?|contacts?)\b/.test(q)) return answerGeneralContacts(ctx);
  // "Due this week / today / tomorrow" narrows the waiting list to a window.
  if (/\bdue\b/.test(q) && /\b(this week|today|tomorrow|soon|this month)\b/.test(q)) return answerGeneralDueWindow(ctx);
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
 * no token: a connected agent already has its own access from the Connect
 * page, and the prompt says so only for an agent that is already connected.
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
