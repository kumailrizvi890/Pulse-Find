import Papa from "papaparse";
import { STATUSES, TRACKS, type ApplicationInput, type ISODate, type Status, type Track } from "./types";
import { todayISO } from "./metrics";

/** Header names people actually use in their own trackers, mapped to our fields. */
const HEADER_ALIASES: Record<keyof ApplicationInput, string[]> = {
  company: ["company", "employer", "organization", "organisation", "company name"],
  role: ["role", "position", "title", "job title", "job", "position title"],
  track: ["track", "type", "job type", "category", "level"],
  status: ["status", "stage", "application status", "state"],
  date_applied: ["date applied", "applied", "applied on", "application date", "date"],
  last_contact: ["last contact", "last update", "last heard", "last activity", "updated"],
  oa_received: ["oa received", "oa received (y/n)", "oa", "assessment", "online assessment"],
  interviews_done: ["interviews done", "interviews", "interview count", "# interviews"],
  latest_update: ["latest update", "update", "last message", "summary"],
  link: ["link", "url", "email", "posting", "job link", "apply link", "email link"],
  notes: ["notes", "note", "comments"],
  action_needed: ["action needed", "action needed (you)", "next step", "to do", "todo", "action"],
  action_due: ["action due", "due", "deadline", "due date"],
};

const STATUS_ALIASES: Record<string, Status> = {
  applied: "Applied", submitted: "Applied", "application sent": "Applied", pending: "Applied",
  incomplete: "Incomplete", started: "Incomplete", draft: "Incomplete",
  oa: "OA Received", "oa received": "OA Received", assessment: "OA Received", "online assessment": "OA Received",
  "oa completed": "OA Completed", "oa done": "OA Completed", "assessment completed": "OA Completed",
  screen: "Recruiter Screen", "phone screen": "Recruiter Screen", "recruiter screen": "Recruiter Screen",
  "interview invited": "Interview Invited", "interview scheduled": "Interview Invited",
  interview: "Interviewing", interviewing: "Interviewing", onsite: "Final Round", "final round": "Final Round",
  offer: "Offer", "offer received": "Offer", accepted: "Accepted",
  rejected: "Rejected", rejection: "Rejected", declined: "Rejected", "not selected": "Rejected",
  withdrawn: "Withdrawn", withdrew: "Withdrawn",
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const pad = (n: number) => String(n).padStart(2, "0");
function valid(y: number, m: number, d: number): ISODate | null {
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** Accepts 2026-10-28, 10/28/2026, 10/28/26, Oct 28 2026, 28 Oct 2026. Returns null if it can't tell. */
export function parseDate(raw: string): ISODate | null {
  const s = raw.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return valid(y, +m[1], +m[2]);
  }
  m = s.match(/^([a-z]{3})[a-z]* (\d{1,2}) (\d{4})$/);
  if (m && MONTHS.includes(m[1])) return valid(+m[3], MONTHS.indexOf(m[1]) + 1, +m[2]);
  m = s.match(/^(\d{1,2}) ([a-z]{3})[a-z]* (\d{4})$/);
  if (m && MONTHS.includes(m[2])) return valid(+m[3], MONTHS.indexOf(m[2]) + 1, +m[1]);
  return null;
}

export function normalizeStatus(raw: string): Status {
  const s = raw.trim().toLowerCase();
  const exact = STATUSES.find((x) => x.toLowerCase() === s);
  return exact ?? STATUS_ALIASES[s] ?? "Applied";
}

export function normalizeTrack(raw: string, role = ""): Track {
  const s = raw.trim().toLowerCase();
  const exact = TRACKS.find((t) => t.toLowerCase() === s);
  if (exact) return exact;
  const hay = `${s} ${role.toLowerCase()}`;
  if (hay.includes("intern")) return "Internship";
  if (hay.includes("new grad") || hay.includes("entry level") || hay.includes("early career")) return "New Grad";
  if (hay.includes("part")) return "Part-Time";
  if (hay.includes("full")) return "Full-Time";
  return "Other";
}

const yes = (s: string) => ["y", "yes", "true", "1", "x"].includes(s.trim().toLowerCase());

export interface ImportResult {
  rows: ApplicationInput[];
  skipped: { line: number; reason: string }[];
  mapped: Partial<Record<keyof ApplicationInput, string>>;
}

/**
 * Shared row importer for CSV and .xlsx: maps header aliases to fields and
 * normalizes every row. `line` numbers in skipped entries are 1-based sheet
 * rows (header = line 1), matching what the user sees in Excel.
 */
export function importRecords(headers: string[], data: Record<string, string>[], today: ISODate = todayISO()): ImportResult {
  const mapped: ImportResult["mapped"] = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [keyof ApplicationInput, string[]][]) {
    const hit = headers.find((h) => aliases.includes(h.trim().toLowerCase()));
    if (hit) mapped[field] = hit;
  }
  const get = (row: Record<string, string>, f: keyof ApplicationInput) => (mapped[f] ? (row[mapped[f]!] ?? "").trim() : "");

  const rows: ApplicationInput[] = [];
  const skipped: ImportResult["skipped"] = [];
  if (!mapped.company) {
    return { rows, skipped: [{ line: 1, reason: "No Company column found. Name one column “Company”." }], mapped };
  }
  data.forEach((row, i) => {
    const line = i + 2;
    const company = get(row, "company");
    if (!company) {
      skipped.push({ line, reason: "Missing company" });
      return;
    }
    const role = get(row, "role");
    const status = normalizeStatus(get(row, "status"));
    const applied = parseDate(get(row, "date_applied"));
    const interviews = parseInt(get(row, "interviews_done"), 10);
    const rawLink = get(row, "link");
    // The tracker column is "Email": it holds posting URLs and, in the user's
    // own sheet, contact email addresses. Keep either; drop anything else.
    const link = /^https?:\/\//i.test(rawLink) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawLink) ? rawLink.slice(0, 2000) : "";
    rows.push({
      company: company.slice(0, 200),
      role: role.slice(0, 300),
      track: normalizeTrack(get(row, "track"), role),
      status,
      date_applied: applied,
      last_contact: parseDate(get(row, "last_contact")) ?? applied ?? today,
      oa_received: yes(get(row, "oa_received")) || status === "OA Received" || status === "OA Completed",
      interviews_done: Number.isFinite(interviews) ? Math.min(Math.max(interviews, 0), 50) : 0,
      latest_update: get(row, "latest_update").slice(0, 1000),
      link,
      notes: get(row, "notes").slice(0, 4000),
      action_needed: get(row, "action_needed").slice(0, 500),
      action_due: parseDate(get(row, "action_due")),
    });
  });
  return { rows, skipped, mapped };
}

export function importCsv(text: string, today: ISODate = todayISO()): ImportResult {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  return importRecords(parsed.meta.fields ?? [], parsed.data, today);
}

export const CSV_TEMPLATE =
  "Company,Role,Track,Status,Date Applied,Last Contact,Action Needed,Action Due,Link,Notes\n" +
  "Example Corp,Software Engineer Intern,Internship,Applied,2026-10-01,2026-10-01,,,https://example.com/jobs/123,\n";
