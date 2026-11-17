import type ExcelJS from "exceljs";
import { importRecords, parseDate, type ImportResult } from "./csv";
import { todayISO } from "./metrics";
import type { ContactInput, ISODate } from "./types";

/**
 * .xlsx import, built on the same ExcelJS the export uses. Shares the CSV
 * importer's header mapping and normalization (importRecords), so a sheet
 * behaves identically whether it arrives as .csv or .xlsx — including a
 * Pulse Find export, whose "Applications" sheet is picked out from the
 * "Summary" sheet in front of it.
 */

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const v = value as { hyperlink?: string; text?: string; richText?: { text: string }[]; result?: unknown; error?: unknown };
    if (v.hyperlink) return v.hyperlink;
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if (typeof v.text === "string") return v.text;
    if (v.result !== undefined) return cellText(v.result as ExcelJS.CellValue);
  }
  return "";
}

function sheetGrid(ws: ExcelJS.Worksheet): { headers: string[]; records: Record<string, string>[] } {
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = cellText(cell.value).trim();
  });
  while (headers.length && headers[headers.length - 1] === "") headers.pop();
  const records: Record<string, string>[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const rec: Record<string, string> = {};
    let any = false;
    headers.forEach((h, i) => {
      if (!h) return;
      const text = cellText(ws.getRow(r).getCell(i + 1).value);
      if (text) any = true;
      if (!(h in rec)) rec[h] = text;
    });
    if (any) records.push(rec);
  }
  return { headers, records };
}

const hasCompanyHeader = (headers: string[]) => headers.some((h) => /company|employer|organization|organisation/.test(h.trim().toLowerCase()));

export async function importXlsx(data: ArrayBuffer | Uint8Array, today: ISODate = todayISO()): Promise<ImportResult> {
  const ExcelJSModule = (await import("exceljs")).default;
  const wb = new ExcelJSModule.Workbook();
  await wb.xlsx.load(data as ArrayBuffer);

  const named = wb.getWorksheet("Applications");
  const candidates = named ? [named, ...wb.worksheets.filter((w) => w !== named)] : wb.worksheets;
  for (const ws of candidates) {
    const { headers, records } = sheetGrid(ws);
    if (hasCompanyHeader(headers)) return importRecords(headers, records, today);
  }
  return {
    rows: [],
    skipped: [{ line: 1, reason: "No sheet with a Company column found. Name one column “Company”.” }],
    mapped: {},
  };
}

export interface NetworkingImportResult {
  rows: ContactInput[];
  skipped: { line: number; reason: string }[];
}

/*
 * The Networking Tracker workbook: its "Connections" sheet maps onto
 * networking_contacts. Only the fields the app stores are read — Their
 * Role, Type, Request Sent and Accepted have no app column and are
 * ignored. A Profile URL that is not an http(s) link is dropped, and a
 * blank Profile URL or Last Touch leaves the field empty: the sync never
 * wipes a value the user entered by hand in the app.
 */
const NETWORKING_ALIASES: Record<keyof Omit<ContactInput, "created_at" | "updated_at">, string[]> = {
  person_name: ["name", "person", "contact", "contact name"],
  company: ["company", "employer", "organization", "organisation"],
  status: ["status", "stage"],
  next_step: ["next step", "to do", "todo", "action"],
  next_step_on: ["next step date", "next step on", "due", "due date"],
  notes: ["note / hook", "note", "notes", "hook", "note/hook"],
  linkedin_url: ["profile url", "linkedin", "linkedin url", "linkedin profile", "linkedin profile url"],
  last_contacted: ["last touch", "last contacted", "last contact", "last touched"],
};

export async function importNetworkingXlsx(data: ArrayBuffer | Uint8Array): Promise<NetworkingImportResult> {
  const ExcelJSModule = (await import("exceljs")).default;
  const wb = new ExcelJSModule.Workbook();
  await wb.xlsx.load(data as ArrayBuffer);

  const named = wb.getWorksheet("Connections");
  const candidates = named ? [named, ...wb.worksheets.filter((w) => w !== named)] : wb.worksheets;
  for (const ws of candidates) {
    const { headers, records } = sheetGrid(ws);
    const lower = headers.map((h) => h.trim().toLowerCase());
    if (!lower.includes("name")) continue;
    const mapped: Partial<Record<keyof ContactInput, string>> = {};
    for (const [field, aliases] of Object.entries(NETWORKING_ALIASES) as [keyof ContactInput, string[]][]) {
      const hit = headers.find((h) => aliases.includes(h.trim().toLowerCase()));
      if (hit) mapped[field] = hit;
    }
    const get = (row: Record<string, string>, f: keyof ContactInput) => (mapped[f] ? (row[mapped[f]!] ?? "").trim() : "");
    const rows: ContactInput[] = [];
    const skipped: NetworkingImportResult["skipped"] = [];
    records.forEach((row, i) => {
      const line = i + 2;
      const person_name = get(row, "person_name");
      if (!person_name) {
        skipped.push({ line, reason: "Missing name" });
        return;
      }
      const rawUrl = get(row, "linkedin_url");
      const linkedin_url = /^https?:\/\//i.test(rawUrl) ? rawUrl.slice(0, 2000) : "";
      rows.push({
        person_name: person_name.slice(0, 120),
        company: get(row, "company").slice(0, 200),
        status: get(row, "status").slice(0, 200),
        next_step: get(row, "next_step").slice(0, 500),
        next_step_on: parseDate(get(row, "next_step_on")),
        notes: get(row, "notes").slice(0, 2000),
        linkedin_url,
        last_contacted: parseDate(get(row, "last_contacted")),
      });
    });
    return { rows, skipped };
  }
  return {
    rows: [],
    skipped: [{ line: 1, reason: "No sheet with a Name column found. Name one column “Name”.” }],
  };
}
