// Pure, dependency-free logic for turning a job-related email into a tracker update.
// Shared by the MCP server (Deno edge function), the web app and the unit tests. No imports.
//
// Two jobs:
//   classifyEmail()  - what kind of job email is this, for which company, any deadline?
//   checkScam()      - does this look like a fake job offer? (adapted from Qmail's scam detector)
// planUpdate() then decides what to change in the user's tracker.

export type EmailKind =
  | "confirmation" | "assessment" | "interview" | "nudge" | "rejection" | "offer" | "ignore";

export type Status =
  | "Applied" | "Incomplete" | "OA Received" | "OA Completed" | "Recruiter Screen" | "Interview Invited"
  | "Interviewing" | "Final Round" | "Offer" | "Accepted" | "Rejected" | "Withdrawn";

export interface EmailInput {
  from: string;     // "Stripe Recruiting <no-reply@stripe.com>"
  subject: string;
  body: string;     // plain text; a snippet is fine
  date: string;     // ISO date or datetime the email was received
}

export interface Classification {
  kind: EmailKind;
  company: string | null;
  role: string | null;
  deadline: string | null; // YYYY-MM-DD
  reason: string;          // one line explaining the decision, shown to the user/agent
}

const lower = (s: string) => s.toLowerCase();
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

function baseDate(date: string): Date {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00Z` : date);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

// ---------- what to ignore ----------

const ALERT_SENDERS = /(jobalerts?|jobs-noreply|jobs-listings|alerts?@|noreply@(glassdoor|indeed|ziprecruiter|handshake|joinhandshake|wellfound|dice|monster)|@(email\.)?(glassdoor|ziprecruiter|joinhandshake|wellfound|dice|monster|ihire)\.)/i;
const ALERT_SUBJECTS = /(jobs? (for|matching) you|new jobs?|recommended (jobs|for you)|job alert|jobs? you may|apply now to|is hiring|people viewed|your weekly|newsletter|webinar|career fair|we('| a)re hiring)/i;

// ---------- kinds, most decisive first ----------

const RULES: { kind: Exclude<EmailKind, "ignore">; re: RegExp; reason: string }[] = [
  { kind: "offer", re: /(pleased to (extend|offer)|offer letter|extend (you )?an offer|congratulations[^.]{0,60}offer|your offer|offer of employment)/i, reason: "Mentions an offer" },
  { kind: "rejection", re: /(unfortunately|not (be )?(moving|proceeding) forward|move forward with other|other candidates|decided not to|no longer (being )?consider|position has been filled|not selected|regret to inform|will not be (moving|proceeding))/i, reason: "Reads as a rejection" },
  { kind: "assessment", re: /(hackerrank|codesignal|codility|coderpad|hirevue|karat|online assessment|coding (challenge|assessment|test)|technical assessment|take[- ]home|complete (the|your|an) assessment|assessment (invitation|link|expires))/i, reason: "Contains an online assessment" },
  { kind: "interview", re: /(interview (invitation|invite|request|confirmation)|invit(e|ation) to interview|schedule (an|your|a) (interview|call|chat)|phone screen|recruiter (call|screen)|next (round|step)s? (in|of) (the|our) (interview|process)|onsite|super ?day|calendly\.com|goodtime\.io|share your availability|your availability)/i, reason: "Asks to schedule or confirm an interview" },
  { kind: "nudge", re: /(still interested|are you interested|complete your application|finish your application|application (is )?incomplete|haven'?t (yet )?(completed|finished)|reminder: your application|action required)/i, reason: "Asks you to finish or confirm something" },
  { kind: "confirmation", re: /(thank(s| you) for (applying|your application|your interest)|application (has been )?(received|submitted)|we('ve| have) received your application|received your application|successfully (applied|submitted))/i, reason: "Application confirmation" },
];

// ---------- company and role ----------

const ATS_DOMAINS = /(greenhouse|lever|ashbyhq|myworkday(jobs)?|workday|smartrecruiters|icims|jobvite|taleo|successfactors|bamboohr|recruitee|workable|hackerrank|codesignal|gmail|outlook|yahoo|hotmail|linkedin|indeed|ziprecruiter|handshake|joinhandshake|hire\.lever|eightfold|avature|oraclecloud|paradox|phenom)/i;
const NOISE_WORDS = /\b(recruiting|recruitment|careers?|talent( acquisition)?|team|hiring|jobs?|university|campus|hr|people|no[- ]?reply|notifications?|inc\.?|llc|ltd|corp\.?|corporation)\b/gi;

function tidyCompany(s: string): string | null {
  const t = s.replace(NOISE_WORDS, " ").replace(/[|•·"<>@]/g, " ").replace(/\s+/g, " ").trim().replace(/^[-–:,\s]+|[-–:,\s]+$/g, "");
  return t.length >= 2 && t.length <= 60 ? t : null;
}

export function extractCompany(from: string, subject: string, body = ""): string | null {
  // 1. "at Stripe" / "with Stripe" / "to Stripe" in the subject
  const m = subject.match(/\b(?:at|with|to|from|joining)\s+([A-Z][A-Za-z0-9&.'\- ]{1,40}?)(?=\s*(?:[!.,:;|)(\-–]|$| for | -| has | is | team\b))/);
  if (m) {
    const c = tidyCompany(m[1]);
    if (c) return c;
  }
  const name = from.match(/^\s*"?([^"<]+?)"?\s*</)?.[1] ?? "";
  const domain = from.match(/@([a-z0-9.-]+)/i)?.[1] ?? "";
  const viaPlatform = ATS_DOMAINS.test(domain) && !/(gmail|outlook|yahoo|hotmail)/i.test(domain);
  // 2. "Roblox: your assessment" / "Roblox - Interview" style subject prefix
  const pre = subject.match(/^([A-Z][A-Za-z0-9&.' ]{1,40}?)\s*[:|–-]\s+\S/);
  // only short, name-like prefixes: "Roblox:" yes, "Your application for SDE Intern -" no
  const STOP = /\b(re|fwd?|reminder|update|action|required|important|your|you|thank|thanks|congratulations|invitation|interview|application|applying|for|the|offer|assessment|next|steps?|status|regarding|position|role)\b/i;
  if (pre && pre[1].trim().split(/\s+/).length <= 3 && !STOP.test(pre[1])) {
    const c = tidyCompany(pre[1]);
    if (c) return c;
  }
  // 3. sender display name: trusted when it says "recruiting"/"careers", or when the email was sent
  //    through a hiring platform (Workday, HackerRank, Greenhouse...) on the company's behalf
  if (name && !ATS_DOMAINS.test(name) && !/no[- ]?reply|notification/i.test(name) &&
      (viaPlatform || /(recruit|career|talent|team|hiring|jobs|hr|university)/i.test(name))) {
    const c = tidyCompany(name);
    if (c) return c;
  }
  // 4. sender domain, unless it's an ATS or webmail
  if (domain && !ATS_DOMAINS.test(domain)) {
    const parts = domain.toLowerCase().split(".").filter((p) => !["mail", "email", "em", "careers", "jobs", "recruiting", "talent", "hire", "notifications", "us", "co", "com", "io", "ai", "org", "net", "uk"].includes(p));
    const root = parts[parts.length - 1];
    if (root && root.length > 1) return root.charAt(0).toUpperCase() + root.slice(1);
  }
  // 5. "Thank you for applying to Stripe" in the body
  const b = body.match(/\b(?:applying|application) (?:to|at|with) ([A-Z][A-Za-z0-9&.'\- ]{1,40}?)(?=[!.,]| for | and )/);
  return b ? tidyCompany(b[1]) : null;
}

export function extractRole(subject: string, body = ""): string | null {
  const pats = [
    /\b(?:for|re:?)\s+(?:the\s+)?([A-Z][^,.!|]{3,80}?(?:intern(ship)?|engineer|developer|analyst|scientist|manager|designer|associate|co-?op|representative|specialist|consultant)[^,.!|]{0,40}?)(?=\s*(?:position|role|opening|at|with|[-–|,.!]|$))/i,
    /^(?:your application(?: for| to)?:?\s*)([^|–-]{4,90}?)(?:\s*[-–|]|$)/i,
  ];
  for (const p of pats) {
    const m = subject.match(p) ?? body.slice(0, 600).match(p);
    if (m && m[1]) return m[1].replace(/\s+/g, " ").trim();
  }
  return null;
}

// ---------- deadlines ----------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function extractDeadline(text: string, received: string): string | null {
  const base = baseDate(received);
  const t = text.replace(/\s+/g, " ");
  // "within 7 days" / "in 5 days" / "expires in 72 hours"
  const rel = t.match(/\b(?:within|in|expires? in|valid for|next)\s+(\d{1,3})\s*(day|days|hours|hrs)\b/i);
  // "by November 7" / "before Nov 7, 2026" / "expires on 11/07/2026" / "deadline: Friday, Nov 7"
  const abs = t.match(/\b(?:by|before|until|expires?(?: on)?|deadline:?|due(?: by| on)?|no later than)\s+(?:\w+day,?\s+)?([a-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}-\d{2}-\d{2})/i);
  if (abs) {
    const s = abs[1].toLowerCase().replace(/(st|nd|rd|th)\b/, "").replace(",", "").replace(".", "");
    let d: Date | null = null;
    let m: RegExpMatchArray | null;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/))) {
      const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : base.getUTCFullYear();
      d = new Date(Date.UTC(y, +m[1] - 1, +m[2]));
    } else if ((m = s.match(/^([a-z]{3})[a-z]*\s+(\d{1,2})(?:\s+(\d{4}))?$/)) && MONTHS.includes(m[1])) {
      d = new Date(Date.UTC(m[3] ? +m[3] : base.getUTCFullYear(), MONTHS.indexOf(m[1]), +m[2]));
    }
    if (d && !Number.isNaN(d.getTime())) {
      // a year-less date that already passed most likely means next year
      if (d.getTime() < base.getTime() - 2 * 86_400_000 && !/\d{4}/.test(abs[1])) d.setUTCFullYear(d.getUTCFullYear() + 1);
      return ymd(d);
    }
  }
  if (rel) {
    const n = +rel[1];
    const days = /hour|hr/i.test(rel[2]) ? Math.max(1, Math.floor(n / 24)) : n;
    if (days > 0 && days <= 90) return ymd(new Date(base.getTime() + days * 86_400_000));
  }
  return null;
}

// ---------- classify ----------

export function classifyEmail(e: EmailInput): Classification {
  const text = `${e.subject}\n${e.body}`;
  if (ALERT_SENDERS.test(e.from) || (ALERT_SUBJECTS.test(e.subject) && !RULES.slice(0, 5).some((r) => r.re.test(text)))) {
    return { kind: "ignore", company: null, role: null, deadline: null, reason: "Job alert or newsletter, not about an application" };
  }
  const hit = RULES.find((r) => r.re.test(text));
  if (!hit) return { kind: "ignore", company: null, role: null, deadline: null, reason: "Doesn't look like an update on an application" };
  const needsDeadline = hit.kind === "assessment" || hit.kind === "nudge" || hit.kind === "offer" || hit.kind === "interview";
  return {
    kind: hit.kind,
    company: extractCompany(e.from, e.subject, e.body),
    role: extractRole(e.subject, e.body),
    deadline: needsDeadline ? extractDeadline(text, e.date) : null,
    reason: hit.reason,
  };
}

// ---------- scam check (adapted from Qmail) ----------

export interface ScamResult { risk: "low" | "medium" | "high"; score: number; reasons: string[] }

const SCAM_SIGNALS: { re: RegExp; weight: number; reason: string }[] = [
  { re: /(send|mail|deposit)[^.]{0,40}(check|cheque)|(check|cheque)[^.]{0,40}(deposit|purchase|equipment)/i, weight: 3, reason: "Mentions depositing a check, the core move in fake-check job scams" },
  { re: /(purchase|buy|order)[^.]{0,40}(equipment|laptop|software|supplies)[^.]{0,60}(reimburs|vendor|refund)/i, weight: 3, reason: "Asks you to buy equipment and get reimbursed later" },
  { re: /\b(telegram|whatsapp|signal app|wechat|google hangouts|teams chat interview|text[- ]based interview|interview via (chat|text))\b/i, weight: 2, reason: "Moves the interview to a chat app, which real employers rarely do" },
  { re: /(social security|ssn|bank (account|routing|details)|direct deposit form|copy of your (id|passport|driver'?s license))/i, weight: 2, reason: "Asks for bank or identity details before a real offer" },
  { re: /(gift card|bitcoin|crypto(currency)? wallet|wire transfer|zelle|cash ?app|western union)/i, weight: 3, reason: "Involves an untraceable payment method" },
  { re: /(no (prior )?experience (needed|required)|work from home)[^.]{0,80}\$\s?\d{2,3}(\.\d+)?\s*(\/|per)\s*(hour|hr)/i, weight: 2, reason: "Unusually high pay for a no-experience remote role" },
  { re: /(you('ve| have) been (selected|shortlisted|hired)|offer[^.]{0,30}without (an )?interview|immediate(ly)? hire)/i, weight: 2, reason: "Offers a job without a real interview" },
  { re: /(act now|respond within (24|48) hours|limited (slots|positions)|urgent(ly)? (hiring|need))/i, weight: 1, reason: "Pressures you to respond fast" },
  { re: /(registration|training|onboarding|background check|application) fee/i, weight: 3, reason: "Asks you to pay a fee to get the job" },
];
const FREEMAIL = /@(gmail|yahoo|outlook|hotmail|aol|proton(mail)?|icloud|gmx|mail)\.(com|me|net)/i;

export function checkScam(e: { from: string; subject: string; body: string }): ScamResult {
  const text = `${e.subject}\n${e.body}`;
  const reasons: string[] = [];
  let score = 0;
  for (const s of SCAM_SIGNALS) if (s.re.test(text)) { score += s.weight; reasons.push(s.reason); }
  const claimsCompany = /\b(hr|recruit(er|ing)|hiring manager|talent)\b/i.test(text) && /\b(inc|llc|corp|company|corporation)\b/i.test(text);
  if (FREEMAIL.test(e.from) && (claimsCompany || score > 0)) {
    score += 2;
    reasons.push("A recruiter writing from a free personal email address instead of a company domain");
  }
  const risk = score >= 5 ? "high" : score >= 2 ? "medium" : "low";
  return { risk, score, reasons: reasons.length ? reasons : ["No common job-scam patterns found"] };
}

// ---------- decide the tracker change ----------

const STAGE: Record<Status, number> = {
  Incomplete: 0, Applied: 1, "OA Received": 2, "OA Completed": 3, "Recruiter Screen": 4, "Interview Invited": 5,
  Interviewing: 6, "Final Round": 7, Offer: 8, Accepted: 9, Rejected: 10, Withdrawn: 10,
};

export interface TrackedApp { id: string; company: string; role: string; status: Status; action_needed: string }

export interface Plan {
  action: "create" | "update" | "skip";
  applicationId?: string;
  fields: Partial<{
    company: string; role: string; status: Status; date_applied: string; last_contact: string;
    latest_update: string; oa_received: boolean; action_needed: string; action_due: string | null;
  }>;
  event: { kind: string; details: string } | null;
  note: string;
}

export const normalizeCompany = (s: string) =>
  lower(s).replace(NOISE_WORDS, " ").replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

const tokens = (s: string) => new Set(lower(s).split(/[^a-z0-9]+/).filter((t) => t.length > 1));

/** Share of the application's role words that appear in the email text (0..1). */
function roleOverlap(appRole: string, hint: string): number {
  const want = tokens(appRole);
  if (!want.size) return 0;
  const have = tokens(hint);
  let n = 0;
  for (const t of want) if (have.has(t)) n++;
  return n / want.size;
}

/**
 * Finds the tracked application an email is about. `hint` is any text that may name the role
 * (the extracted role plus the subject). With several applications at one company, the best
 * role-word overlap wins; ties go to the most advanced application that's still open.
 */
export function matchApplication(apps: TrackedApp[], company: string | null, hint: string | null): TrackedApp | null {
  if (!company) return null;
  const c = normalizeCompany(company);
  if (!c) return null;
  const same = apps.filter((a) => {
    const ac = normalizeCompany(a.company);
    return ac === c || ac.startsWith(`${c} `) || c.startsWith(`${ac} `);
  });
  if (same.length <= 1) return same[0] ?? null;
  const open = (a: TrackedApp) => (STAGE[a.status] >= 10 ? 0 : 1);
  return [...same].sort(
    (x, y) =>
      (hint ? roleOverlap(y.role, hint) - roleOverlap(x.role, hint) : 0) ||
      open(y) - open(x) ||
      STAGE[y.status] - STAGE[x.status],
  )[0];
}

const STATUS_FOR: Record<Exclude<EmailKind, "ignore" | "nudge">, Status> = {
  confirmation: "Applied", assessment: "OA Received", interview: "Interview Invited", rejection: "Rejected", offer: "Offer",
};

export function planUpdate(apps: TrackedApp[], e: EmailInput, c: Classification): Plan {
  const day = ymd(baseDate(e.date));
  const subject = e.subject.slice(0, 200);
  if (c.kind === "ignore") return { action: "skip", fields: {}, event: null, note: c.reason };

  const existing = matchApplication(apps, c.company, `${c.role ?? ""} ${e.subject}`);
  const fields: Plan["fields"] = { last_contact: day, latest_update: subject };
  const kindLabel = { confirmation: "Applied", assessment: "Assessment", interview: "Interview invite", nudge: "Reminder", rejection: "Rejected", offer: "Offer" }[c.kind];

  if (c.kind !== "nudge") {
    const next = STATUS_FOR[c.kind];
    // never move backward, except that rejections and offers always land
    if (!existing || c.kind === "rejection" || c.kind === "offer" || STAGE[next] > STAGE[existing.status]) fields.status = next;
  }
  if (c.kind === "assessment") {
    fields.oa_received = true;
    fields.action_needed = c.deadline ? `Finish the assessment by ${c.deadline}` : "Finish the online assessment";
    fields.action_due = c.deadline;
  } else if (c.kind === "interview") {
    fields.action_needed = "Reply with your availability or confirm the interview";
    fields.action_due = c.deadline;
  } else if (c.kind === "nudge") {
    fields.action_needed = "Reply or finish the application they asked about";
    fields.action_due = c.deadline;
  } else if (c.kind === "offer") {
    fields.action_needed = c.deadline ? `Respond to the offer by ${c.deadline}` : "Respond to the offer";
    fields.action_due = c.deadline;
  } else if (c.kind === "rejection") {
    fields.action_needed = "";
    fields.action_due = null;
  }

  if (existing) {
    return { action: "update", applicationId: existing.id, fields, event: { kind: kindLabel, details: subject }, note: `${kindLabel} for ${existing.company}` };
  }
  if (!c.company) {
    return { action: "skip", fields: {}, event: null, note: `${kindLabel}, but couldn't tell which company it's from. Add it by hand.` };
  }
  return {
    action: "create",
    fields: { ...fields, company: c.company, role: c.role ?? "", date_applied: day, status: fields.status ?? "Applied" },
    event: { kind: kindLabel, details: subject },
    note: `New application: ${c.company}${c.role ? `, ${c.role}` : ""}`,
  };
}
