/**
 * A visitor's picks on the jobs board. Signed-out visitors can still
 * swipe; their picks live in this browser only, under one key shared by
 * the jobs board (which writes it) and the demo Leads page (which reads
 * it, so a saved job is waiting in /demo/leads). One module owns the
 * key so the two sides can never drift apart silently.
 */

export type JobPickMark = "saved" | "applied" | "hidden";

/** A board job as saved in the browser. Mirrors the Job row in JobsBoard. */
export interface JobPick {
  id: string;
  company: string;
  title: string;
  location: string;
  remote: boolean;
  url: string;
  track: string;
  tech: boolean;
  posted_at: string | null;
}

export const JOB_PICKS_KEY = "pf_job_picks_v1";

export interface JobPicks {
  marks: Record<string, JobPickMark>;
  saved: Record<string, JobPick>;
}

const EMPTY: JobPicks = { marks: {}, saved: {} };

const isRecord = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);

/** The saved picks, or empty when there is no browser storage, no entry, or a corrupt one. Never throws. */
export function readJobPicks(): JobPicks {
  try {
    if (typeof localStorage === "undefined") return EMPTY;
    const v: unknown = JSON.parse(localStorage.getItem(JOB_PICKS_KEY) ?? "null");
    if (isRecord(v) && isRecord(v.marks) && isRecord(v.saved)) return v as unknown as JobPicks;
  } catch {}
  return EMPTY;
}

export function writeJobPicks(marks: Record<string, JobPickMark>, saved: Record<string, JobPick>): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(JOB_PICKS_KEY, JSON.stringify({ marks, saved }));
  } catch {}
}

/** Forgets one saved job (both its mark and its saved row). No-op when it was never saved. Never throws. */
export function removeJobPick(jobId: string): void {
  try {
    const { marks, saved } = readJobPicks();
    if (!(jobId in marks) && !(jobId in saved)) return;
    delete marks[jobId];
    delete saved[jobId];
    writeJobPicks(marks, saved);
  } catch {}
}
