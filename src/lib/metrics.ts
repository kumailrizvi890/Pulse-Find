import type { Application, ISODate, Status } from "./types";

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
export const hasAction = (a: Application) => a.action_needed.trim().length > 0;

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
  const responded = apps.filter((a) => a.status !== "Applied" && a.status !== "Incomplete").length;
  return {
    total: apps.length,
    thisWeek: apps.filter((a) => a.date_applied && a.date_applied >= wk && a.date_applied <= today).length,
    tech: apps.filter((a) => isTechRole(a.role)).length,
    responseRate: apps.length ? responded / apps.length : 0,
    oas: apps.filter(reachedOA).length,
    interviews: apps.reduce((s, a) => s + a.interviews_done, 0),
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
    { label: "Assessment", value: apps.filter(reachedOA).length },
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

/** Applications that need the user, soonest deadline first, undated after dated. */
export function actionQueue(apps: Application[]): Application[] {
  return apps
    .filter(hasAction)
    .sort((a, b) => (a.action_due ?? "9999") .localeCompare(b.action_due ?? "9999") || a.company.localeCompare(b.company));
}

export type Filter = "all" | "action" | "tech" | "active" | "ghosted" | "closed";

export function applyFilter(apps: Application[], f: Filter, today: ISODate, ghostDays: number, query = ""): Application[] {
  const q = query.trim().toLowerCase();
  return apps.filter((a) => {
    if (q && !`${a.company} ${a.role}`.toLowerCase().includes(q)) return false;
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
