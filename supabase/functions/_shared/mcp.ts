// Pulse Find MCP server core: JSON-RPC handling and the tools agents can call.
// Pure and storage-agnostic: the edge function passes a Store scoped to one user.
// Implements the MCP "Streamable HTTP" transport in its simplest form (JSON responses, no SSE).

import { checkScam, classifyEmail, planUpdate, type Status, type TrackedApp } from "./email.ts";

export const SERVER_INFO = { name: "pulse-find", title: "Pulse Find", version: "1.0.0" };
export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const STATUSES: Status[] = [
  "Applied", "Incomplete", "OA Received", "OA Completed", "Recruiter Screen", "Interview Invited",
  "Interviewing", "Final Round", "Offer", "Accepted", "Rejected", "Withdrawn",
];
const TRACKS = ["Internship", "New Grad", "Full-Time", "Part-Time", "Other"];
const CLOSED: Status[] = ["Rejected", "Offer", "Accepted", "Withdrawn"];

export interface AppRow extends TrackedApp {
  track: string;
  date_applied: string | null;
  last_contact: string | null;
  latest_update: string;
  action_due: string | null;
  interviews_done: number;
  oa_received: boolean;
  link: string;
  notes: string;
}

export interface JobRow { company: string; title: string; location: string; remote: boolean; url: string; track: string; posted_at: string | null }

export interface LeadRow {
  id: string;
  company: string;
  role: string;
  track: string;
  location: string;
  pay: string;
  url: string;
  source: string;
  status: string;
  fit_note: string;
  date_found: string;
}

export interface ContactRow {
  id: string;
  person_name: string;
  company: string;
  status: string;
  next_step: string;
  next_step_on: string | null;
  notes: string;
}

/** Data access for ONE user. Every implementation must scope reads and writes to that user. */
export interface Store {
  listApps(): Promise<AppRow[]>;
  insertApp(fields: Record<string, unknown>): Promise<AppRow>;
  updateApp(id: string, fields: Record<string, unknown>): Promise<AppRow | null>;
  /** Returns false when sourceRef was already recorded (duplicate email). */
  addEvent(e: { application_id: string; kind: string; details: string; event_date: string; source_ref: string | null }): Promise<boolean>;
  hasEvent(sourceRef: string): Promise<boolean>;
  searchJobs(p: { query?: string; track?: string; remote?: boolean; tech_only?: boolean; limit: number }): Promise<JobRow[]>;
  ghostDays(): Promise<number>;
  listLeads(): Promise<LeadRow[]>;
  insertLead(fields: Record<string, unknown>): Promise<LeadRow>;
  updateLead(id: string, fields: Record<string, unknown>): Promise<LeadRow | null>;
  listContacts(): Promise<ContactRow[]>;
  insertContact(fields: Record<string, unknown>): Promise<ContactRow>;
  updateContact(id: string, fields: Record<string, unknown>): Promise<ContactRow | null>;
}

const LEAD_STATUSES = ["New", "Queued", "Applied", "Problem", "Not eligible", "Closed"];

function leadBrief(l: LeadRow) {
  return {
    id: l.id, company: l.company, role: l.role || null, track: l.track, location: l.location || null,
    pay: l.pay || null, url: l.url || null, source: l.source || null, status: l.status,
    fit_note: l.fit_note || null, date_found: l.date_found,
  };
}

function contactBrief(c: ContactRow) {
  return {
    id: c.id, person_name: c.person_name, company: c.company || null, status: c.status || null,
    next_step: c.next_step || null, next_step_on: c.next_step_on, notes: c.notes || null,
  };
}

// ---------- tiny input validation ----------

class InvalidParams extends Error {}
type Args = Record<string, unknown>;
const str = (a: Args, k: string, max: number, required = false): string | undefined => {
  const v = a[k];
  if (v === undefined || v === null || v === "") {
    if (required) throw new InvalidParams(`"${k}" is required`);
    return undefined;
  }
  if (typeof v !== "string") throw new InvalidParams(`"${k}" must be text`);
  return v.slice(0, max);
};
const date = (a: Args, k: string): string | null | undefined => {
  const v = a[k];
  if (v === null) return null;
  const s = str(a, k, 40);
  if (s === undefined) return undefined;
  const m = s.match(/^\d{4}-\d{2}-\d{2}/);
  if (!m) throw new InvalidParams(`"${k}" must be a date like 2026-11-05`);
  return m[0];
};
const oneOf = (a: Args, k: string, options: string[]): string | undefined => {
  const s = str(a, k, 40);
  if (s === undefined) return undefined;
  const hit = options.find((o) => o.toLowerCase() === s.toLowerCase());
  if (!hit) throw new InvalidParams(`"${k}" must be one of: ${options.join(", ")}`);
  return hit;
};
const bool = (a: Args, k: string): boolean | undefined => {
  const v = a[k];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "boolean") throw new InvalidParams(`"${k}" must be true or false`);
  return v;
};
const int = (a: Args, k: string, min: number, max: number): number | undefined => {
  const v = a[k];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v)) throw new InvalidParams(`"${k}" must be a whole number`);
  return Math.min(max, Math.max(min, v));
};

const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

function brief(a: AppRow, ghost: number) {
  const quiet = a.last_contact && !CLOSED.includes(a.status) ? daysBetween(a.last_contact, today()) : null;
  return {
    id: a.id, company: a.company, role: a.role, status: a.status, track: a.track,
    date_applied: a.date_applied, last_contact: a.last_contact,
    waiting_on_you: a.action_needed || null, due: a.action_due,
    ghosted: quiet !== null && quiet >= ghost,
    latest_update: a.latest_update || null, link: a.link || null,
  };
}

// ---------- tools ----------

type ToolDef = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
  run: (s: Store, a: Args) => Promise<unknown>;
};

const dateProp = { type: "string", description: "Calendar date, YYYY-MM-DD" };

export const TOOLS: ToolDef[] = [
  {
    name: "get_summary",
    title: "Job search summary",
    description: "Overview of the user's job search: totals, response rate, interviews, offers, ghosted companies, and everything waiting on the user (soonest deadline first). Call this first to orient yourself.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    run: async (s) => {
      const [apps, ghost] = await Promise.all([s.listApps(), s.ghostDays()]);
      const rows = apps.map((a) => brief(a, ghost));
      const responded = apps.filter((a) => a.status !== "Applied" && a.status !== "Incomplete").length;
      return {
        total: apps.length,
        response_rate: apps.length ? Math.round((responded / apps.length) * 100) / 100 : 0,
        interviews_done: apps.reduce((n, a) => n + (a.interviews_done || 0), 0),
        offers: apps.filter((a) => a.status === "Offer" || a.status === "Accepted").length,
        ghosted: rows.filter((r) => r.ghosted).map((r) => `${r.company} (${r.role || "role not set"})`),
        waiting_on_you: rows
          .filter((r) => r.waiting_on_you)
          .sort((x, y) => (x.due ?? "9999").localeCompare(y.due ?? "9999"))
          .map((r) => ({ id: r.id, company: r.company, action: r.waiting_on_you, due: r.due })),
      };
    },
  },
  {
    name: "list_applications",
    title: "List applications",
    description: "List the user's tracked applications, optionally filtered.",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string", enum: ["all", "waiting_on_me", "active", "ghosted", "closed"], default: "all" },
        company: { type: "string", description: "Only applications whose company contains this text" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    run: async (s, a) => {
      const filter = oneOf(a, "filter", ["all", "waiting_on_me", "active", "ghosted", "closed"]) ?? "all";
      const company = str(a, "company", 100)?.toLowerCase();
      const [apps, ghost] = await Promise.all([s.listApps(), s.ghostDays()]);
      const rows = apps.map((x) => brief(x, ghost)).filter((r) => {
        if (company && !r.company.toLowerCase().includes(company)) return false;
        if (filter === "waiting_on_me") return !!r.waiting_on_you;
        if (filter === "active") return !CLOSED.includes(r.status as Status);
        if (filter === "ghosted") return r.ghosted;
        if (filter === "closed") return CLOSED.includes(r.status as Status);
        return true;
      });
      return { count: rows.length, applications: rows };
    },
  },
  {
    name: "add_application",
    title: "Add application",
    description: "Track a new application the user submitted.",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string" },
        role: { type: "string" },
        track: { type: "string", enum: TRACKS },
        status: { type: "string", enum: STATUSES, default: "Applied" },
        date_applied: dateProp,
        link: { type: "string", description: "Posting or email URL (https)" },
        notes: { type: "string" },
      },
      required: ["company"],
      additionalProperties: false,
    },
    run: async (s, a) => {
      const applied = date(a, "date_applied") ?? today();
      const link = str(a, "link", 2000);
      if (link && !/^https:\/\//i.test(link)) throw new InvalidParams(`"link" must start with https://`);
      const row = await s.insertApp({
        company: str(a, "company", 200, true),
        role: str(a, "role", 300) ?? "",
        track: oneOf(a, "track", TRACKS) ?? "Internship",
        status: oneOf(a, "status", STATUSES) ?? "Applied",
        date_applied: applied,
        last_contact: applied,
        link: link ?? "",
        notes: str(a, "notes", 4000) ?? "",
      });
      await s.addEvent({ application_id: row.id, kind: "Applied", details: "Added by your agent", event_date: applied, source_ref: null });
      return { created: brief(row, await s.ghostDays()) };
    },
  },
  {
    name: "update_application",
    title: "Update application",
    description: "Change an application's status, latest update, or what's waiting on the user. Set action_needed to an empty string to mark it done.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Application id from list_applications" },
        status: { type: "string", enum: STATUSES },
        last_contact: dateProp,
        latest_update: { type: "string" },
        action_needed: { type: "string", description: "What the user needs to do next; empty string clears it" },
        action_due: { ...dateProp, nullable: true },
        interviews_done: { type: "integer", minimum: 0, maximum: 50 },
        notes: { type: "string" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    run: async (s, a) => {
      const id = str(a, "id", 64, true)!;
      const fields: Record<string, unknown> = {};
      const st = oneOf(a, "status", STATUSES); if (st) fields.status = st;
      const lc = date(a, "last_contact"); if (lc !== undefined) fields.last_contact = lc;
      const lu = str(a, "latest_update", 1000); if (lu !== undefined) fields.latest_update = lu;
      if (typeof a.action_needed === "string") fields.action_needed = a.action_needed.slice(0, 500);
      const due = date(a, "action_due"); if (due !== undefined) fields.action_due = due;
      const iv = int(a, "interviews_done", 0, 50); if (iv !== undefined) fields.interviews_done = iv;
      const nt = str(a, "notes", 4000); if (nt !== undefined) fields.notes = nt;
      if (!Object.keys(fields).length) throw new InvalidParams("Nothing to change");
      const row = await s.updateApp(id, fields);
      if (!row) throw new InvalidParams("No application with that id. Call list_applications to find it.");
      if (st) await s.addEvent({ application_id: id, kind: st, details: lu ?? "Updated by your agent", event_date: today(), source_ref: null });
      return { updated: brief(row, await s.ghostDays()) };
    },
  },
  {
    name: "process_job_email",
    title: "Process a job email",
    description:
      "Give Pulse Find one email from the user's inbox. It decides whether it's about a job application (confirmation, assessment, interview, reminder, rejection, offer), updates or creates the matching application, sets what's waiting on the user with any deadline, and checks it for job-scam signs. Job alerts and unrelated mail are skipped. Safe to call twice: pass message_id and duplicates are ignored. Use dry_run to preview.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Sender, e.g. \"Stripe Recruiting <no-reply@stripe.com>\"" },
        subject: { type: "string" },
        body: { type: "string", description: "Plain-text body or a long snippet" },
        date: { type: "string", description: "When it was received (ISO date or datetime)" },
        message_id: { type: "string", description: "The email's unique id, used to skip duplicates" },
        dry_run: { type: "boolean", default: false },
      },
      required: ["from", "subject", "body"],
      additionalProperties: false,
    },
    run: async (s, a) => {
      const email = {
        from: str(a, "from", 300, true)!,
        subject: str(a, "subject", 500, true)!,
        body: str(a, "body", 20000, true)!,
        date: str(a, "date", 40) ?? new Date().toISOString(),
      };
      const ref = str(a, "message_id", 300) ?? null;
      const dry = bool(a, "dry_run") ?? false;
      if (ref && (await s.hasEvent(ref))) return { result: "duplicate", note: "This email was already processed." };

      const classification = classifyEmail(email);
      const scam = checkScam(email);
      if (scam.risk === "high") {
        return { result: "flagged_scam", classification, scam, note: "Looks like a fake job offer. Nothing was added. Warn the user and don't reply with personal or bank details." };
      }
      const apps = await s.listApps();
      const plan = planUpdate(apps, email, classification);
      if (dry || plan.action === "skip") return { result: dry ? "preview" : "skipped", classification, scam, plan };

      let appId = plan.applicationId;
      if (plan.action === "create") {
        const row = await s.insertApp({ track: "Internship", ...plan.fields });
        appId = row.id;
      } else {
        await s.updateApp(appId!, plan.fields);
      }
      if (plan.event) {
        const fresh = await s.addEvent({ application_id: appId!, kind: plan.event.kind, details: plan.event.details, event_date: (plan.fields.last_contact as string) ?? today(), source_ref: ref });
        if (!fresh) return { result: "duplicate", note: "This email was already processed." };
      }
      return { result: plan.action === "create" ? "created" : "updated", application_id: appId, note: plan.note, classification, scam: scam.risk === "low" ? undefined : scam };
    },
  },
  {
    name: "check_job_scam",
    title: "Check for a job scam",
    description: "Check an email or job post for common fake-job-offer signs (check deposits, equipment purchases, chat-app interviews, fees, requests for bank details). Returns low/medium/high risk with reasons.",
    inputSchema: {
      type: "object",
      properties: { from: { type: "string" }, subject: { type: "string" }, body: { type: "string" } },
      required: ["body"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    run: async (_s, a) => checkScam({ from: str(a, "from", 300) ?? "", subject: str(a, "subject", 500) ?? "", body: str(a, "body", 20000, true)! }),
  },
  {
    name: "search_jobs",
    title: "Search open jobs",
    description: "Search live internship and new-grad openings pulled from 50+ company career pages (refreshed every 6 hours). Results link to the company's own posting.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words in the title, company or location" },
        track: { type: "string", enum: ["Internship", "New Grad", "Full-Time", "any"], default: "Internship" },
        remote: { type: "boolean" },
        tech_only: { type: "boolean", default: true },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 15 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    run: async (s, a) => {
      const track = oneOf(a, "track", ["Internship", "New Grad", "Full-Time", "any"]) ?? "Internship";
      const jobs = await s.searchJobs({
        query: str(a, "query", 60),
        track: track === "any" ? undefined : track,
        remote: bool(a, "remote"),
        tech_only: bool(a, "tech_only") ?? true,
        limit: int(a, "limit", 1, 50) ?? 15,
      });
      return { count: jobs.length, jobs };
    },
  },
  {
    name: "list_leads",
    title: "List job leads",
    description: "List the user's saved job leads (roles found but not yet applied to), optionally filtered by pipeline status.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: LEAD_STATUSES, description: "Only leads in this pipeline status" },
        company: { type: "string", description: "Only leads whose company contains this text" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    run: async (s, a) => {
      const status = oneOf(a, "status", LEAD_STATUSES);
      const company = str(a, "company", 100)?.toLowerCase();
      const rows = (await s.listLeads())
        .map(leadBrief)
        .filter((l) => (!status || l.status === status) && (!company || l.company.toLowerCase().includes(company)));
      return { count: rows.length, leads: rows };
    },
  },
  {
    name: "add_lead",
    title: "Save a job lead",
    description: "Save a role the user is considering as a lead in their pipeline. This does NOT apply to anything — it only records the lead for the user's own decision later. If the same company + role is already a lead, returns the existing one instead of duplicating.",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string" },
        role: { type: "string" },
        track: { type: "string", enum: TRACKS },
        location: { type: "string" },
        pay: { type: "string", description: "Pay as shown on the posting, e.g. \"$48/hr\"" },
        url: { type: "string", description: "Posting URL (https)" },
        source: { type: "string", description: "Where it was found, e.g. \"Job board\"" },
        fit_note: { type: "string", description: "Why it fits (or doesn't)" },
      },
      required: ["company"],
      additionalProperties: false,
    },
    run: async (s, a) => {
      const company = str(a, "company", 200, true)!;
      const role = str(a, "role", 300) ?? "";
      const existing = (await s.listLeads()).find(
        (l) => l.company.toLowerCase() === company.toLowerCase() && l.role.toLowerCase() === role.toLowerCase(),
      );
      if (existing) return { existing: true, lead: leadBrief(existing) };
      const url = str(a, "url", 2000);
      if (url && !/^https:\/\//i.test(url)) throw new InvalidParams(`"url" must start with https://`);
      const row = await s.insertLead({
        company,
        role,
        track: oneOf(a, "track", TRACKS) ?? "Internship",
        location: str(a, "location", 200) ?? "",
        pay: str(a, "pay", 120) ?? "",
        url: url ?? "",
        source: str(a, "source", 120) ?? "",
        status: "New",
        fit_note: str(a, "fit_note", 1000) ?? "",
        date_found: today(),
      });
      return { created: leadBrief(row) };
    },
  },
  {
    name: "update_lead",
    title: "Update a job lead",
    description: "Move a lead through the pipeline (New, Queued, Applied, Problem, Not eligible, Closed) or edit its details. Marking a lead Applied only records that the user applied — it never applies for them.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Lead id from list_leads" },
        status: { type: "string", enum: LEAD_STATUSES },
        fit_note: { type: "string" },
        location: { type: "string" },
        pay: { type: "string" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    run: async (s, a) => {
      const id = str(a, "id", 64, true)!;
      const fields: Record<string, unknown> = {};
      const st = oneOf(a, "status", LEAD_STATUSES); if (st) fields.status = st;
      const fn = str(a, "fit_note", 1000); if (fn !== undefined) fields.fit_note = fn;
      const loc = str(a, "location", 200); if (loc !== undefined) fields.location = loc;
      const pay = str(a, "pay", 120); if (pay !== undefined) fields.pay = pay;
      if (!Object.keys(fields).length) throw new InvalidParams("Nothing to change");
      const row = await s.updateLead(id, fields);
      if (!row) throw new InvalidParams("No lead with that id. Call list_leads to find it.");
      return { updated: leadBrief(row) };
    },
  },
  {
    name: "list_contacts",
    title: "List networking contacts",
    description: "List the user's networking contacts with their next steps. Due and overdue next steps come first.",
    inputSchema: {
      type: "object",
      properties: {
        due_only: { type: "boolean", description: "Only contacts whose next step is due today or overdue", default: false },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    run: async (s, a) => {
      const dueOnly = bool(a, "due_only") ?? false;
      const t = today();
      const rows = (await s.listContacts())
        .map(contactBrief)
        .filter((c) => !dueOnly || (c.next_step && c.next_step_on && c.next_step_on <= t))
        .sort((x, y) => (x.next_step_on ?? "9999").localeCompare(y.next_step_on ?? "9999") || x.person_name.localeCompare(y.person_name));
      return { count: rows.length, contacts: rows };
    },
  },
  {
    name: "add_contact",
    title: "Add a networking contact",
    description: "Record a person in the user's networking tracker, with the next step they owe them. This never contacts the person — it only tracks the follow-up.",
    inputSchema: {
      type: "object",
      properties: {
        person_name: { type: "string" },
        company: { type: "string" },
        status: { type: "string", description: "e.g. \"Connected — thanked Nov 4\"" },
        next_step: { type: "string" },
        next_step_on: { ...dateProp, nullable: true },
        notes: { type: "string" },
      },
      required: ["person_name"],
      additionalProperties: false,
    },
    run: async (s, a) => {
      const row = await s.insertContact({
        person_name: str(a, "person_name", 120, true),
        company: str(a, "company", 200) ?? "",
        status: str(a, "status", 200) ?? "",
        next_step: str(a, "next_step", 500) ?? "",
        next_step_on: date(a, "next_step_on") ?? null,
        notes: str(a, "notes", 2000) ?? "",
      });
      return { created: contactBrief(row) };
    },
  },
  {
    name: "update_contact",
    title: "Update a networking contact",
    description: "Update a contact's status, next step, or next-step date. Set next_step to an empty string when the follow-up is done.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Contact id from list_contacts" },
        status: { type: "string" },
        next_step: { type: "string" },
        next_step_on: { ...dateProp, nullable: true },
        notes: { type: "string" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    run: async (s, a) => {
      const id = str(a, "id", 64, true)!;
      const fields: Record<string, unknown> = {};
      const st = str(a, "status", 200); if (st !== undefined) fields.status = st;
      if (typeof a.next_step === "string") fields.next_step = a.next_step.slice(0, 500);
      const on = date(a, "next_step_on"); if (on !== undefined) fields.next_step_on = on;
      const nt = str(a, "notes", 2000); if (nt !== undefined) fields.notes = nt;
      if (!Object.keys(fields).length) throw new InvalidParams("Nothing to change");
      const row = await s.updateContact(id, fields);
      if (!row) throw new InvalidParams("No contact with that id. Call list_contacts to find it.");
      return { updated: contactBrief(row) };
    },
  },
];

// ---------- prompts ----------

export const PROMPTS = [
  {
    name: "scan_inbox",
    title: "Scan my inbox for job updates",
    description: "Have your agent read recent job emails with its own email tools and update Pulse Find.",
    arguments: [{ name: "days", description: "How many days back to look (default 7)", required: false }],
  },
  {
    name: "daily_digest",
    title: "What's waiting on me?",
    description: "A digest of everything that needs the user, deadlines called out separately, plus who has gone quiet.",
    arguments: [],
  },
  {
    name: "find_leads",
    title: "Find me new roles to consider",
    description: "Search live openings, dedupe against the tracker, and present new leads for the user's decision. Never applies.",
    arguments: [
      { name: "track", description: "Internship, New Grad, Full-Time, Part-Time or Other (default: any)", required: false },
      { name: "query", description: "Keyword, company or location to search for", required: false },
    ],
  },
];

export function scanInboxPrompt(days: number) {
  return `Update my Pulse Find job tracker from my email.

1. Call get_summary to see what I'm tracking.
2. Using your email tools, search the last ${days} days for job-application email: confirmations ("thank you for applying", "application received"), assessments (HackerRank, CodeSignal, "online assessment"), interview scheduling, "are you still interested" reminders, rejections, and offers. Also search for each company in my tracker. Skip job alerts and newsletters (LinkedIn alerts, Handshake, Indeed, ZipRecruiter digests).
3. For each matching email, call process_job_email with from, subject, the plain-text body, the received date and the email's message id. Process oldest first.
4. If a result is flagged_scam, warn me clearly and don't reply to that sender.
5. Finish with 3-6 lines: new applications, status changes, what's now waiting on me with due dates, and anything flagged as a possible scam.

Rules: read-only in my inbox. Never send, reply to, forward or delete email, and never apply to anything.`;
}

export function dailyDigestPrompt() {
  return `Give me my Pulse Find digest for today.

1. Call get_summary.
2. Lead with deadlines, in their own section, never buried: every assessment or interview-related action with a due date, soonest first, overdue ones first of all and clearly marked.
3. Then list everything else waiting on me (replies, forms, unfinished portals), soonest due first, undated items last.
4. Then tell me who has ghosted me: applications with no contact in 21+ days (use the ghosted list from get_summary; if it's empty, say so in one line).
5. Keep it short: counts first (total tracked, waiting on me, overdue), then the lists. No preamble, no advice I didn't ask for.

Rules: this is read-only. Never send email, never apply to anything, never contact a recruiter.`;
}

export function findLeadsPrompt(track?: string, query?: string) {
  const scope = [track ? `track: ${track}` : "any track", query ? `matching "${query}"` : "no keyword filter"].join(", ");
  return `Find me new roles to consider in Pulse Find.

1. Call list_applications to see what I'm already tracking.
2. Call search_jobs with ${scope}. Prefer the most recently posted roles.
3. Drop anything whose company + role is already in my tracker, and anything I've clearly already seen in this list.
4. Present what's left as a short lead list: company, role, location/remote, when it was posted, and the link. Group by track if there's a mix.
5. If I pick some to keep an eye on, save those with add_lead so they land in my leads pipeline on the website. If I name the ones I applied to, add those with add_application and mark the matching lead Applied with update_lead.
6. Stop there. These are leads for MY decision: never apply for me, and never contact anyone.

Rules: never send email, never apply on my behalf, never contact recruiters.`;
}

// ---------- JSON-RPC ----------

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const err = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export async function handleRpc(msg: Rpc, store: Store): Promise<object | null> {
  const isNotification = msg.id === undefined;
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return isNotification ? null : err(msg.id, -32600, "Invalid request");
  if (msg.method.startsWith("notifications/")) return null;
  try {
    switch (msg.method) {
      case "initialize": {
        const asked = String(msg.params?.protocolVersion ?? "");
        return ok(msg.id, {
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions:
            "Pulse Find is the user's job application tracker. Start with get_summary. To keep it current from email, use the scan_inbox prompt or call process_job_email once per job email. For a briefing use the daily_digest prompt; to surface new roles use find_leads. Leads the user picks are saved with add_lead; people they are following up with live in list_contacts. The website is the home for the data; you are the engine that keeps it current. Never send email, apply, or contact recruiters on the user's behalf.",
        });
      }
      case "ping":
        return ok(msg.id, {});
      case "tools/list":
        return ok(msg.id, { tools: TOOLS.map(({ run: _r, ...t }) => t) });
      case "tools/call": {
        const name = String(msg.params?.name ?? "");
        const tool = TOOLS.find((t) => t.name === name);
        if (!tool) return err(msg.id, -32602, `Unknown tool: ${name}`);
        const args = (msg.params?.arguments ?? {}) as Args;
        if (typeof args !== "object" || Array.isArray(args)) return err(msg.id, -32602, "arguments must be an object");
        try {
          const data = await tool.run(store, args);
          return ok(msg.id, { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data, isError: false });
        } catch (e) {
          // Tool-level problems go back to the model as readable errors so it can correct itself.
          const text = e instanceof InvalidParams ? e.message : "Pulse Find couldn't complete that. Try again shortly.";
          if (!(e instanceof InvalidParams)) console.error(e);
          return ok(msg.id, { content: [{ type: "text", text }], isError: true });
        }
      }
      case "prompts/list":
        return ok(msg.id, { prompts: PROMPTS });
      case "prompts/get": {
        const name = String(msg.params?.name ?? "");
        const meta = PROMPTS.find((p) => p.name === name);
        if (!meta) return err(msg.id, -32602, "Unknown prompt");
        const args = (msg.params?.arguments ?? {}) as Args;
        let text: string;
        if (name === "scan_inbox") {
          const raw = Number(args.days ?? 7);
          const days = Number.isFinite(raw) ? Math.min(60, Math.max(1, Math.round(raw))) : 7;
          text = scanInboxPrompt(days);
        } else if (name === "daily_digest") {
          text = dailyDigestPrompt();
        } else {
          const track = typeof args.track === "string" && args.track.trim() ? args.track.trim().slice(0, 40) : undefined;
          const query = typeof args.query === "string" && args.query.trim() ? args.query.trim().slice(0, 60) : undefined;
          text = findLeadsPrompt(track, query);
        }
        return ok(msg.id, {
          description: meta.description,
          messages: [{ role: "user", content: { type: "text", text } }],
        });
      }
      default:
        return err(msg.id, -32601, `Method not found: ${msg.method}`);
    }
  } catch (e) {
    console.error(e);
    return err(msg.id, -32603, "Internal error");
  }
}

/** Handles a POST body, which may be a single message or a batch. Returns null when nothing needs a reply. */
export async function handleBody(body: unknown, store: Store): Promise<object | object[] | null> {
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handleRpc(m as Rpc, store)))).filter(Boolean) as object[];
    return out.length ? out : null;
  }
  if (!body || typeof body !== "object") return err(null, -32700, "Parse error");
  return handleRpc(body as Rpc, store);
}
