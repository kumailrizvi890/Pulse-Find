import type ExcelJS from "exceljs";
import { importRecords, type ImportResult } from "./csv";
import { todayISO } from "./metrics";
import type { ISODate } from "./types";

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
    skipped: [{ line: 1, reason: "No sheet with a Company column found. Name one column “Company”." }],
    mapped: {},
  };
}
