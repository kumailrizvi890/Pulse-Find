import type { Application, Contact, ISODate, Status } from "./types";

// ---------- dates ----------

export function todayISO(now: Date = new Date()): ISODate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseISO(s: ISODate): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return todayISO(d);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000);
}

/** Monday of the week containing `s`. */
export function weekStart(s: ISODate): ISODate {
  const d = parseISO(s);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return todayISO(d);
}

// ---------- classification ----------

// Shared with the job refresh function so tracker and job feed tag tech roles the same way.
export { isTechRole } from "../../supabase/functions/_shared/jobs";
import { isTechRole } from "../../supabase/functions/_shared/jobs";

export const CLOSED: readonly Status[] = ["Rejected", "Offer", "Accepted", "Withdrawn"];
export const OA_STAGE: readonly Status[] = ["OA Received", "OA Completed"];
export const INTERVIEW_STAGE: readonly Status[] = ["Recruiter Screen", "Interview Invited", "Interviewing", "Final Round"];
export const OFFER_STAGE: readonly Status[] = ["Offer", "Accepted"];

export type FollowUp = "ghosted" | "soon" | "waiting" | null;

/** Mirrors the spreadsheet's Follow-Up Flag: past the threshold = ghosted, past half = follow up soon. */
export function followUp(app: Application, today: ISODate, ghostDays: number): FollowUp {
  if (CLOSED.includes(app.status) || !app.last_contact) return null;
  const quiet = daysBetween(app.last_contact, today);
  if (quiet >= ghostDays) return "ghosted";
  if (quiet >= ghostDays / 2) return "soon";
  return "waiting";
}

export const reachedInterview = (a: Application) =>
  a.interviews_done > 0 || INTERVIEW_STAGE.includes(a.status) || OFFER_STAGE.includes(a.status);
export const reachedOA = (a: Application) => a.oa_received || OA_STAGE.includes(a.status) || reachedInterview(a);
/** An application that actually received an assessment — the tracker's "OA". Unlike reachedOA, this does not fold interview-stage applications in, so the OA count on the dashboard matches the tracker's OA Received column. */
export const hasOA = (a: Application) => a.oa_received || OA_STAGE.includes(a.status);
export const hasAction = (a: Application) => a.action_needed.trim().length > 0;

/**
 * Response rate, one definition everywhere. An application counts as
 * responded once its status moved forward from the starting state — any
 * later stage (OA, interview, offer, rejection, withdrawal) means the
 * company engaged, even when no written reply arrived. A later
 * last-contact date alone does not count: Sable Studio in the demo was
 * contacted 12 days after applying while still sitting at Applied, and
 * the old date rule counted it as a reply while the rate did not, so the
 * dashboard showed "11 replies" next to a 45% rate (10 of 22). The
 * dashboard's rate, its replies count, and the Networking page all read
 * these helpers, so they cannot drift apart again.
 */
export const hasResponded = (a: Application) => a.status !== "Applied" && a.status !== "Incomplete";

/** { responded, total, rate } for applications, from hasResponded. */
export function applicationResponseRate(apps: Application[]): { responded: number; total: number; rate: number } {
  const responded = apps.filter(hasResponded).length;
  return { responded, total: apps.length, rate: apps.length ? responded / apps.length : 0 };
}

/**
 * The same "any forward movement counts" rule for networking contacts. A
 * contact's status is free text in the shape "Stage — detail", so the
 * leading stage decides: "Connected — replied Nov 9" moved forward, while
 * "Messaged — awaiting reply" only records the outreach itself. The detail
 * after the dash is never read, so "awaiting reply" can never count as a
 * reply. A status that names no forward movement (Requested, Messaged,
 * blank, anything unrecognised) never counts, so the rate never overstates.
 */
const CONTACT_PENDING = [
  "awaiting reply", "waiting for reply", "waiting to hear",
  "no reply", "not replied", "no response", "hasn't replied", "haven't replied",
  "no answer", "ghosted", "unanswered", "pending",
];
// Outreach-only stages, matched at the start of the head so they cannot
// swallow a forward stage that mentions them ("Accepted my request"
// starts with "accepted", not "request"; "Replied to my message" does
// not start with "messag").
const CONTACT_PENDING_START = ["request", "messag", "sent"];
const CONTACT_FORWARD = [
  "connect", "accept", "repli", "respond", "met", "talk", "spoke",
  "call", "chat", "refer", "introduc", "interview", "coffee", "thank",
  "in touch", "caught up",
];

export function contactResponded(c: Pick<Contact, "status">): boolean {
  const head = c.status.split(/[—\-:]/)[0]?.trim().toLowerCase() ?? "";
  if (!head) return false;
  if (CONTACT_PENDING.some((p) => head.includes(p))) return false;
  if (CONTACT_PENDING_START.some((p) => head.startsWith(p))) return false;
  return CONTACT_FORWARD.some((m) => head.includes(m));
}

/** { responded, total, rate } for contacts, from contactResponded. */
export function contactResponseRate(contacts: Contact[]): { responded: number; total: number; rate: number } {
  const responded = contacts.filter(contactResponded).length;
  return { responded, total: contacts.length, rate: contacts.length ? responded / contacts.length : 0 };
}

// ---------- summaries ----------

export interface Summary {
  total: number;
  thisWeek: number;
  tech: number;
  responseRate: number; // 0..1
  oas: number;
  interviews: number;
  offers: number;
  rejected: number;
  ghosted: number;
  actions: number;
  overdue: number;
}

export function summarize(apps: Application[], today: ISODate, ghostDays: number): Summary {
  const wk = weekStart(today);
  const responded = apps.filter(hasResponded).length;
  return {
    total: apps.length,
    thisWeek: apps.filter((a) => a.date_applied && a.date_applied >= wk && a.date_applied <= today).length,
    tech: apps.filter((a) => isTechRole(a.role)).length,
    responseRate: apps.length ? responded / apps.length : 0,
    oas: apps.filter(reachedOA).length,
    // Interviews counts applications at interview stage, not the sum of
    // interviews_done: the tracker leaves interviews_done at 0 on almost
    // every row (3 interview-stage applications summed to 0), so the old
    // sum read 0 while the funnel said 3. The count now matches the
    // funnel's Interview step exactly.
    interviews: apps.filter(reachedInterview).length,
    offers: apps.filter((a) => OFFER_STAGE.includes(a.status)).length,
    rejected: apps.filter((a) => a.status === "Rejected").length,
    ghosted: apps.filter((a) => followUp(a, today, ghostDays) === "ghosted").length,
    actions: apps.filter(hasAction).length,
    overdue: apps.filter((a) => hasAction(a) && a.action_due && a.action_due < today).length,
  };
}

export interface FunnelStep { label: string; value: number }

/** Each application counts at every stage it has reached. */
export function funnel(apps: Application[]): FunnelStep[] {
  return [
    { label: "Applied", value: apps.length },
    { label: "OA", value: apps.filter(reachedOA).length },
    { label: "Interview", value: apps.filter(reachedInterview).length },
    { label: "Offer", value: apps.filter((a) => OFFER_STAGE.includes(a.status)).length },
  ];
}

export interface WeekBucket { start: ISODate; tech: number; other: number }

/** The last `weeks` Monday-start weeks ending with the current one, oldest first. */
export function weekly(apps: Application[], today: ISODate, weeks = 12): WeekBucket[] {
  const current = weekStart(today);
  const buckets: WeekBucket[] = Array.from({ length: weeks }, (_, i) => ({
    start: addDays(current, -7 * (weeks - 1 - i)),
    tech: 0,
    other: 0,
  }));
  const first = buckets[0].start;
  for (const a of apps) {
    if (!a.date_applied || a.date_applied < first || a.date_applied > addDays(current, 6)) continue;
    const idx = Math.floor(daysBetween(first, a.date_applied) / 7);
    const b = buckets[idx];
    if (!b) continue;
    if (isTechRole(a.role)) b.tech++;
    else b.other++;
  }
  return buckets;
}

export interface MonthBucket { start: ISODate; tech: number; other: number }

/**
 * The rolling 7-day pace: applications per day over the last 7 days
 * ending on `today`, compared with the 7 days before. This is the same
 * window the dashboard's 7-day pace chart counts (Overview's trailing
 * memo), so the landing card and the dashboard can never disagree — the
 * old calendar-week version read 1 on a Monday while the dashboard read
 * 6. Both the landing page (server render) and the Showcase (browser
 * recompute after mount) call this one function, so the window can never
 * drift apart again the way the chatbot beat and the tour did.
 */
export function rollingWeekPace(apps: Application[], today: ISODate): {
  days: { label: string; sub: string; value: number }[];
  total: number;
  change: number | null;
} {
  const start = addDays(today, -6);
  const days = Array.from({ length: 7 }, (_, i) => {
    const iso = addDays(start, i);
    const date = parseISO(iso);
    return {
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      sub: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      value: apps.filter((a) => a.date_applied === iso).length,
    };
  });
  const total = days.reduce((s, d) => s + d.value, 0);
  const prevStart = addDays(start, -7);
  const prevTotal = apps.filter((a) => a.date_applied && a.date_applied >= prevStart && a.date_applied < start).length;
  const change = prevTotal === 0 ? null : Math.round(((total - prevTotal) / prevTotal) * 100);
  return { days, total, change };
}

/**
 * The last `months` calendar months ending with the current one, oldest
 * first. `start` is the first day of each month. Follows weekly() — the
 * same { start, tech, other } shape, so the same WeeklyBars chart draws
 * it with a monthly goal line.
 */
export function monthly(apps: Application[], today: ISODate, months = 12): MonthBucket[] {
  const d = parseISO(today);
  const starts: ISODate[] = Array.from({ length: months }, (_, i) => {
    const m = new Date(d.getFullYear(), d.getMonth() - (months - 1 - i), 1);
    return todayISO(m);
  });
  const buckets: MonthBucket[] = starts.map((start) => ({ start, tech: 0, other: 0 }));
  const first = buckets[0].start;
  const firstDate = parseISO(first);
  for (const a of apps) {
    if (!a.date_applied || a.date_applied < first || a.date_applied > today) continue;
    const ad = parseISO(a.date_applied);
    const idx = (ad.getFullYear() - firstDate.getFullYear()) * 12 + (ad.getMonth() - firstDate.getMonth());
    const b = buckets[idx];
    if (!b) continue;
    if (isTechRole(a.role)) b.tech++;
    else b.other++;
  }
  return buckets;
}

/** Applications that need the user, soonest deadline first, undated after dated. */
export function actionQueue(apps: Application[]): Application[] {
  return apps
    .filter(hasAction)
    .sort((a, b) => (a.action_due ?? "9999") .localeCompare(b.action_due ?? "9999") || a.company.localeCompare(b.company));
}

export type Filter = "all" | "action" | "tech" | "active" | "ghosted" | "closed";

/**
 * Words that carry no filtering meaning on their own: they describe the
 * tracker itself, not a row. Dropping them lets "tech jobs" find tech roles
 * instead of matching nothing because no row contains the word "jobs".
 * "Internship" is deliberately NOT here: it is a real track value.
 * Mirrors the sheet's list in src/lib/sheet.ts so the two search boxes
 * answer the same queries the same way.
 */
const QUERY_STOPWORDS: ReadonlySet<string> = new Set([
  "job", "jobs", "role", "roles", "application", "applications",
  "app", "apps", "position", "positions", "opening", "openings",
]);

const MONTHS_SHORT = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTHS_LONG = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/**
 * Turns an ISO date into searchable text: "2026-11-15" becomes
 * "2026-11-15 november nov 15 2026", so "nov", "nov 15" and "2026-11"
 * all match it. Same helper as the sheet's, kept here so the tracker
 * search answers date words too.
 */
function dateSearchText(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const mi = Number(mo) - 1;
  if (mi < 0 || mi > 11) return iso;
  const day = String(Number(d));
  return `${iso} ${y} ${mo} ${day} ${MONTHS_SHORT[mi]} ${MONTHS_LONG[mi]} ${MONTHS_SHORT[mi]} ${day} ${y} ${MONTHS_LONG[mi]} ${day} ${y}`;
}

/**
 * Everything a tracker row can be found by: company, role, track, status,
 * latest update, link, notes, action needed, the three dates in
 * human-readable form, and derived words the fields alone do not carry
 * (an OA is only a boolean, an interview count only a number, ghosted
 * only a quiet-days flag). The applications table has no location field,
 * so there is nothing location-shaped to match. A city only matches
 * when it appears in notes or the latest update.
 */
export function applicationSearchText(a: Application, today: ISODate, ghostDays: number): string {
  const dates = [a.date_applied, a.last_contact, a.action_due]
    .filter((d): d is string => Boolean(d))
    .map(dateSearchText)
    .join(" ");
  const flag = followUp(a, today, ghostDays);
  const derived = [
    a.oa_received ? "oa received yes" : "",
    a.interviews_done > 0 ? "interviews" : "",
    flag === "ghosted" ? "ghosted" : "",
    isTechRole(a.role) ? "tech" : "",
  ].join(" ");
  return `${a.company} ${a.role} ${a.track} ${a.status} ${a.latest_update} ${a.link} ${a.notes} ${a.action_needed} ${dates} ${derived}`.toLowerCase();
}

export function applyFilter(apps: Application[], f: Filter, today: ISODate, ghostDays: number, query = "", status: Status | "All" = "All"): Application[] {
  const words = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w && !QUERY_STOPWORDS.has(w));
  return apps.filter((a) => {
    if (status !== "All" && a.status !== status) return false;
    if (words.length > 0) {
      const hay = applicationSearchText(a, today, ghostDays);
      if (!words.every((w) => hay.includes(w))) return false;
    }
    switch (f) {
      case "action": return hasAction(a);
      case "tech": return isTechRole(a.role);
      case "active": return !CLOSED.includes(a.status);
      case "ghosted": return followUp(a, today, ghostDays) === "ghosted";
      case "closed": return CLOSED.includes(a.status);
      default: return true;
    }
  });
}

/** Default table order: things waiting on you first, then most recent contact. */
export function sortForTable(apps: Application[]): Application[] {
  return [...apps].sort(
    (a, b) =>
      Number(hasAction(b)) - Number(hasAction(a)) ||
      (b.last_contact ?? "").localeCompare(a.last_contact ?? "") ||
      a.company.localeCompare(b.company),
  );
}
