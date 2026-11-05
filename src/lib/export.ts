import type { Application, ISODate, Settings } from "./types";
import { followUp, daysBetween, hasAction, isTechRole, summarize } from "./metrics";

const STATUS_FILL: Partial<Record<Application["status"], string>> = {
  Rejected: "FFF4CCCC", Offer: "FFB6D7A8", Accepted: "FF93C47D",
  "OA Received": "FFFFF2CC", "OA Completed": "FFFFF2CC",
  "Recruiter Screen": "FFD9EAD3", "Interview Invited": "FFD9EAD3", Interviewing: "FFD9EAD3", "Final Round": "FFD9EAD3",
  Incomplete: "FFEDEDED",
};

const COLUMNS = [
  { header: "Company", key: "company", width: 26 },
  { header: "Role", key: "role", width: 40 },
  { header: "Track", key: "track", width: 12 },
  { header: "Status", key: "status", width: 17 },
  { header: "Date Applied", key: "date_applied", width: 13 },
  { header: "Last Contact", key: "last_contact", width: 13 },
  { header: "Days Quiet", key: "days", width: 11 },
  { header: "Follow-Up", key: "flag", width: 16 },
  { header: "Interviews", key: "interviews_done", width: 11 },
  { header: "Latest Update", key: "latest_update", width: 40 },
  { header: "Action Needed (You)", key: "action_needed", width: 44 },
  { header: "Action Due", key: "action_due", width: 12 },
  { header: "Tech Role", key: "tech", width: 10 },
  { header: "Link", key: "link", width: 30 },
  { header: "Notes", key: "notes", width: 30 },
] as const;

const FLAG_LABEL = { ghosted: "GHOSTED: follow up", soon: "Follow up soon", waiting: "Waiting" } as const;

const toDate = (s: ISODate | null) => {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/**
 * Builds an .xlsx with values and colors written directly onto cells (no formulas,
 * no conditional rules), so it looks the same in Excel, Numbers, Google Sheets and phone previews.
 */
export async function buildWorkbook(apps: Application[], settings: Settings, today: ISODate): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Pulse Find";
  wb.created = new Date();

  const sum = summarize(apps, today, settings.ghost_days);
  const s = wb.addWorksheet("Summary");
  s.columns = [{ width: 34 }, { width: 14 }];
  s.addRow(["Pulse Find export", ""]).font = { bold: true, size: 14 };
  s.addRow([`As of ${today}`, ""]).font = { color: { argb: "FF666666" } };
  s.addRow([]);
  const lines: [string, number | string][] = [
    ["Total applications", sum.total],
    ["Applied this week", sum.thisWeek],
    ["Tech roles", sum.tech],
    ["Response rate", `${Math.round(sum.responseRate * 100)}%`],
    ["Reached an assessment", sum.oas],
    ["Interviews completed", sum.interviews],
    ["Offers", sum.offers],
    ["Rejections", sum.rejected],
    [`Ghosted (quiet ${settings.ghost_days}+ days)`, sum.ghosted],
    ["Waiting on you", sum.actions],
  ];
  for (const [k, v] of lines) s.addRow([k, v]);

  const ws = wb.addWorksheet("Applications", { views: [{ state: "frozen", xSplit: 1, ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14213D" } }));

  for (const a of apps) {
    const flag = followUp(a, today, settings.ghost_days);
    const tech = isTechRole(a.role);
    const row = ws.addRow({
      ...a,
      date_applied: toDate(a.date_applied),
      last_contact: toDate(a.last_contact),
      action_due: toDate(a.action_due),
      days: a.last_contact ? daysBetween(a.last_contact, today) : null,
      flag: flag ? FLAG_LABEL[flag] : "",
      tech: tech ? "Tech" : "",
      link: a.link ? { text: a.link, hyperlink: a.link } : "",
    });
    const base = STATUS_FILL[a.status];
    row.eachCell({ includeEmpty: true }, (c, col) => {
      const key = COLUMNS[col - 1]?.key;
      let fill = base;
      if ((key === "company" || key === "role" || key === "tech") && tech) fill = "FFCFE2F3";
      if (key === "flag" && flag === "ghosted") fill = "FFE06666";
      if (key === "flag" && flag === "soon") fill = "FFF6B26B";
      if ((key === "action_needed" || key === "action_due") && hasAction(a)) {
        fill = "FFC00000";
        c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      }
      if ((key === "company" || key === "role") && hasAction(a)) c.font = { bold: true, color: { argb: "FFC00000" } };
      if (fill) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      if (key === "date_applied" || key === "last_contact" || key === "action_due") c.numFmt = "mmm d, yyyy";
      c.alignment = { vertical: "top", wrapText: key === "latest_update" || key === "action_needed" || key === "notes" };
    });
  }
  ws.autoFilter = { from: "A1", to: { row: 1, column: COLUMNS.length } };
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

export function toCsv(apps: Application[]): string {
  const cols = ["company", "role", "track", "status", "date_applied", "last_contact", "interviews_done", "latest_update", "action_needed", "action_due", "link", "notes"] as const;
  const head = ["Company", "Role", "Track", "Status", "Date Applied", "Last Contact", "Interviews Done", "Latest Update", "Action Needed", "Action Due", "Link", "Notes"];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    // neutralise spreadsheet formula injection
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [head.join(","), ...apps.map((a) => cols.map((c) => esc(a[c])).join(","))].join("\n");
}

export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
