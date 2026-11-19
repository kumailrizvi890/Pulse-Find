import type { Application, ApplicationInput, ISODate, Status } from "./types";
import { daysBetween, followUp, hasAction, isTechRole, type FollowUp } from "./metrics";

/**
 * The Sheet view: the user's applications as a proper spreadsheet grid with
 * the same columns as the Excel tracker. Pure logic lives here (derivation,
 * sorting, filtering, import dedupe) so it is unit-testable without the UI.
 */

export type SheetKey =
  | "company" | "role" | "track" | "date_applied" | "status" | "last_contact"
  | "days_quiet" | "flag" | "oa_received" | "interviews_done" | "latest_update"
  | "email" | "notes" | "action_needed" | "action_due" | "tech";

export interface SheetColumn {
  key: SheetKey;
  header: string;
  /** Editable cells write straight back to the tracker store. Computed columns are read-only. */
  editable: "text" | "date" | "status" | "number" | "bool" | null;
  numeric?: boolean;
}

export const SHEET_COLUMNS: SheetColumn[] = [
  { key: "company", header: "Company", editable: "text" },
  { key: "role", header: "Role", editable: "text" },
  { key: "track", header: "Track", editable: null },
  { key: "date_applied", header: "Date Applied", editable: "date" },
  { key: "status", header: "Status", editable: "status" },
  { key: "last_contact", header: "Last Contact", editable: "date" },
  { key: "days_quiet", header: "Days Since Contact", editable: null, numeric: true },
  { key: "flag", header: "Follow-Up Flag", editable: null },
  { key: "oa_received", header: "OA Received", editable: "bool" },
  { key: "interviews_done", header: "Interviews Done", editable: "number", numeric: true },
  { key: "latest_update", header: "Latest Update", editable: "text" },
  { key: "email", header: "Email", editable: "text" },
  { key: "notes", header: "Notes", editable: "text" },
  { key: "action_needed", header: "Action Needed", editable: "text" },
  { key: "action_due", header: "Action Due", editable: "date" },
  { key: "tech", header: "Tech Role", editable: null },
];

/**
 * Fixed-layout widths for the sheet table (percent of the table width).
 * They sum to 100 across all sixteen columns, so the table fills the page
 * at desktop width instead of sizing each column to its longest cell and
 * forcing a horizontal scroll on a 1920px screen. The visible columns are
 * renormalized to 100 by sheetColumnWidths when some are hidden.
 */
export const SHEET_COLUMN_WIDTH_PCT: Record<SheetKey, number> = {
  company: 7,
  role: 8,
  track: 6,
  date_applied: 5,
  status: 6,
  last_contact: 5,
  days_quiet: 6,
  flag: 9,
  oa_received: 4,
  interviews_done: 4,
  latest_update: 8,
  email: 7,
  notes: 7,
  action_needed: 9,
  action_due: 5,
  tech: 4,
};

/**
 * Columns that carry anything in the rows on screen. A column whose cells
 * are all empty in the current filtered rows (the demo's Email column: no
 * seed has a link) is hidden instead of sitting there as a blank stripe;
 * it comes back the moment any visible row has a value.
 */
export function visibleSheetColumns(rows: SheetRow[]): SheetColumn[] {
  return SHEET_COLUMNS.filter((col) => rows.some((r) => r.values[col.key] !== ""));
}

/**
 * Column widths for the visible columns, renormalized so they always sum
 * to 100 and the table fills its container exactly, even when a column
 * (or several) is hidden.
 */
export function sheetColumnWidths(columns: SheetColumn[]): { key: SheetKey; pct: number }[] {
  const total = columns.reduce((n, c) => n + SHEET_COLUMN_WIDTH_PCT[c.key], 0);
  if (total === 0) return [];
  return columns.map((c) => ({ key: c.key, pct: (SHEET_COLUMN_WIDTH_PCT[c.key] / total) * 100 }));
}

export interface SheetRow {
  app: Application;
  days_quiet: number | null;
  flag: FollowUp;
  flagLabel: string;
  tech: boolean;
  values: Record<SheetKey, string>;
}

const FLAG_LABEL: Record<Exclude<FollowUp, null>, string> = {
  ghosted: "GHOSTED - follow up",
  soon: "Follow up soon",
  waiting: "Awaiting reply",
};

export function sheetRow(app: Application, today: ISODate, ghostDays: number): SheetRow {
  const flag = followUp(app, today, ghostDays);
  const days_quiet = app.last_contact ? daysBetween(app.last_contact, today) : null;
  return {
    app,
    days_quiet,
    flag,
    flagLabel: flag ? FLAG_LABEL[flag] : "",
    tech: isTechRole(app.role),
    values: {
      company: app.company,
      role: app.role,
      track: app.track,
      date_applied: app.date_applied ?? "",
      status: app.status,
      last_contact: app.last_contact ?? "",
      days_quiet: days_quiet === null ? "" : String(days_quiet),
      flag: flag ? FLAG_LABEL[flag] : "",
      oa_received: app.oa_received ? "Y" : "N",
      interviews_done: String(app.interviews_done),
      latest_update: app.latest_update,
      email: app.link,
      notes: app.notes,
      action_needed: app.action_needed,
      action_due: app.action_due ?? "",
      tech: isTechRole(app.role) ? "Tech" : "",
    },
  };
}

export function sheetRows(apps: Application[], today: ISODate, ghostDays: number): SheetRow[] {
  return apps.map((a) => sheetRow(a, today, ghostDays));
}

export type SortDir = "asc" | "desc";

const NUMERIC_KEYS: ReadonlySet<SheetKey> = new Set(["days_quiet", "interviews_done"]);

export function sortSheet(rows: SheetRow[], key: SheetKey, dir: SortDir): SheetRow[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (NUMERIC_KEYS.has(key)) {
      const av = a.values[key] === "" ? null : Number(a.values[key]);
      const bv = b.values[key] === "" ? null : Number(b.values[key]);
      if (av === null && bv === null) return a.app.company.localeCompare(b.app.company);
      if (av === null) return 1; // blanks last either way
      if (bv === null) return -1;
      return (av - bv) * mul || a.app.company.localeCompare(b.app.company);
    }
    const av = a.values[key];
    const bv = b.values[key];
    if (!av && !bv) return a.app.company.localeCompare(b.app.company);
    if (!av) return 1;
    if (!bv) return -1;
    return av.localeCompare(bv) * mul || a.app.company.localeCompare(b.app.company);
  });
}

/**
 * Words that carry no filtering meaning on their own: they describe the
 * tracker itself, not a row. Dropping them lets "tech jobs" find tech roles
 * instead of matching nothing because no row contains the word "jobs".
 * "Internship" is deliberately NOT here: it is a real track value.
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
 * "2026-11-15 november nov 15 2026", so "nov", "nov 15", "2026-11"
 * and "2026" all match it. Non-ISO input passes through unchanged.
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
 * Everything a row can be found by: every visible column value (the sheet's
 * own display strings, so the filter matches what the user sees), plus
 * human-readable forms of the three dates. The applications table has no
 * location field, so there is nothing location-shaped to match.
 */
function rowSearchText(r: SheetRow): string {
  const dates = [r.app.date_applied, r.app.last_contact, r.app.action_due]
    .filter((d): d is string => Boolean(d))
    .map(dateSearchText)
    .join(" ");
  // Derived words the column values alone do not carry: an OA is only a Y/N
  // cell, and an interview count is only a number, so neither answers
  // "oa received" or "interviews 2" without these.
  const derived = [
    r.app.oa_received ? "oa received yes" : "",
    r.app.interviews_done > 0 ? "interviews" : "",
  ].join(" ");
  return `${Object.values(r.values).join(" ")} ${dates} ${derived}`.toLowerCase();
}

/**
 * Global filter: one box, case-insensitive, matching across every field of
 * each row (company, role, track, status, all three dates, days quiet,
 * follow-up flag, OA, interviews done, latest update, link, notes, action
 * needed, action due, tech role). Multi-word queries match when every word
 * matches somewhere in the row, so "tech jobs" finds tech roles and
 * "interview seattle" finds interview-stage rows mentioning Seattle.
 * The onlyActions flag mirrors the tracker's waiting-on-you filter.
 * The status filter narrows to one stored status ("All" keeps every row)
 * and composes with both: search narrows within the selected status.
 * "Ghosted" is not a stored status — it is a derived quiet-days flag —
 * so it is not a status option here; the sheet's ghosted count and
 * Follow-Up Flag column already surface it.
 */
export function filterSheet(rows: SheetRow[], query: string, onlyActions = false, status: Status | "All" = "All"): SheetRow[] {
  const words = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w && !QUERY_STOPWORDS.has(w));
  return rows.filter((r) => {
    if (onlyActions && !hasAction(r.app)) return false;
    if (status !== "All" && r.app.status !== status) return false;
    if (words.length === 0) return true;
    const hay = rowSearchText(r);
    return words.every((w) => hay.includes(w));
  });
}

/** Import identity: same company + role + date applied is the same application. */
export function applicationKey(a: Pick<ApplicationInput, "company" | "role" | "date_applied">): string {
  return `${a.company.trim().toLowerCase()}::${a.role.trim().toLowerCase()}::${a.date_applied ?? ""}`;
}

export interface DedupeResult {
  fresh: ApplicationInput[];
  duplicates: ApplicationInput[];
}

/**
 * Splits parsed import rows into new rows vs duplicates — duplicates are ones
 * already in the tracker, plus repeats inside the import file itself.
 */
export function dedupeImport(rows: ApplicationInput[], existing: Pick<Application, "company" | "role" | "date_applied">[]): DedupeResult {
  const seen = new Set(existing.map(applicationKey));
  const fresh: ApplicationInput[] = [];
  const duplicates: ApplicationInput[] = [];
  for (const r of rows) {
    const k = applicationKey(r);
    if (seen.has(k)) duplicates.push(r);
    else {
      seen.add(k);
      fresh.push(r);
    }
  }
  return { fresh, duplicates };
}
