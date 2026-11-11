import type { Application, ApplicationInput, ISODate } from "./types";
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
  waiting: "Waiting",
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

/** Free-text filter across company, role, notes and latest update; flag filter mirrors the tracker's. */
export function filterSheet(rows: SheetRow[], query: string, onlyActions = false): SheetRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => {
    if (onlyActions && !hasAction(r.app)) return false;
    if (!q) return true;
    return `${r.app.company} ${r.app.role} ${r.app.notes} ${r.app.latest_update} ${r.app.status}`.toLowerCase().includes(q);
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
