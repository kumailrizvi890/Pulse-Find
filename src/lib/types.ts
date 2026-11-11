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

// ---------- leads pipeline ----------

/** Mirrors the Leads tab of the Excel tracker: found roles moving toward an application. */
export const LEAD_STATUSES = ["New", "Queued", "Applied", "Problem", "Not eligible", "Closed"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface Lead {
  id: string;
  company: string;
  role: string;
  track: Track;
  location: string;
  pay: string;
  url: string;
  source: string;
  status: LeadStatus;
  fit_note: string;
  date_found: ISODate;
  created_at?: string;
  updated_at?: string;
}

export type LeadInput = Omit<Lead, "id" | "created_at" | "updated_at">;

export function emptyLead(today: ISODate): LeadInput {
  return {
    company: "",
    role: "",
    track: "Internship",
    location: "",
    pay: "",
    url: "",
    source: "",
    status: "New",
    fit_note: "",
    date_found: today,
  };
}

// ---------- networking ----------

/** One person to follow up with, mirroring the Networking Tracker sheet. */
export interface Contact {
  id: string;
  person_name: string;
  company: string;
  status: string;
  next_step: string;
  next_step_on: ISODate | null;
  notes: string;
  created_at?: string;
  updated_at?: string;
}

export type ContactInput = Omit<Contact, "id" | "created_at" | "updated_at">;

export function emptyContact(): ContactInput {
  return { person_name: "", company: "", status: "", next_step: "", next_step_on: null, notes: "" };
}

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
