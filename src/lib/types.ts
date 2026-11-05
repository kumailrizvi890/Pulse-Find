export const STATUSES = [
  "Applied",
  "Incomplete",
  "OA Received",
  "OA Completed",
  "Recruiter Screen",
  "Interview Invited",
  "Interviewing",
  "Final Round",
  "Offer",
  "Accepted",
  "Rejected",
  "Withdrawn",
] as const;
export type Status = (typeof STATUSES)[number];

export const TRACKS = ["Internship", "New Grad", "Full-Time", "Part-Time", "Other"] as const;
export type Track = (typeof TRACKS)[number];

/** Dates are plain ISO calendar dates ("2026-10-28") so they never shift across time zones. */
export type ISODate = string;

export interface Application {
  id: string;
  company: string;
  role: string;
  track: Track;
  status: Status;
  date_applied: ISODate | null;
  last_contact: ISODate | null;
  oa_received: boolean;
  interviews_done: number;
  latest_update: string;
  link: string;
  notes: string;
  action_needed: string;
  action_due: ISODate | null;
  created_at?: string;
  updated_at?: string;
}

export type ApplicationInput = Omit<Application, "id" | "created_at" | "updated_at">;

export interface TrackerEvent {
  id: string;
  application_id: string;
  event_date: ISODate;
  kind: string;
  details: string;
}

export interface Settings {
  display_name: string | null;
  ghost_days: number;
  weekly_goal: number;
}

export const DEFAULT_SETTINGS: Settings = { display_name: null, ghost_days: 21, weekly_goal: 25 };

export function emptyApplication(today: ISODate): ApplicationInput {
  return {
    company: "",
    role: "",
    track: "Internship",
    status: "Applied",
    date_applied: today,
    last_contact: today,
    oa_received: false,
    interviews_done: 0,
    latest_update: "",
    link: "",
    notes: "",
    action_needed: "",
    action_due: null,
  };
}
