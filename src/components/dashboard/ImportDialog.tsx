"use client";

import { useState } from "react";
import { CSV_TEMPLATE, importCsv, type ImportResult } from "@/lib/csv";
import type { ApplicationInput } from "@/lib/types";
import { btn } from "./ui";
import { download } from "@/lib/export";

export function ImportDialog({ open, onClose, onImport }: { open: boolean; onClose: () => void; onImport: (rows: ApplicationInput[]) => Promise<void> }) {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!open) return null;

  async function onFile(f: File | undefined) {
    setError("");
    setResult(null);
    if (!f) return;
    if (f.size > 2_000_000) return setError("That file is over 2 MB. Split it into smaller CSVs.");
    setFileName(f.name);
    if (/\.xlsx?$/i.test(f.name)) return setError("Save the sheet as CSV first (File → Save As → CSV), then pick that file.");
    setResult(importCsv(await f.text()));
  }

  async function confirm() {
    if (!result?.rows.length) return;
    setBusy(true);
    try {
      await onImport(result.rows);
      setResult(null);
      setFileName("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <button aria-label="Close" className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative m-4 w-full max-w-lg rounded-2xl border border-line bg-surface p-5 shadow-panel">
        <h2 id="import-title" className="font-display text-lg font-bold tracking-tight">Import from a spreadsheet</h2>
        <p className="mt-1 text-sm text-muted">
          Upload a CSV from Excel, Google Sheets or Notion. Pulse Find matches common column names like Company, Role, Status and Date Applied.
        </p>
        <label className="mt-4 flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-line bg-surface-2 px-4 py-6 text-center text-sm hover:border-accent">
          <span className="font-medium">{fileName || "Choose a .csv file"}</span>
          <span className="text-xs text-faint">Up to 2 MB</span>
          <input id="import-file" type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <button type="button" className="mt-2 text-xs text-accent underline-offset-2 hover:underline" onClick={() => download("pulse-find-template.csv", CSV_TEMPLATE, "text/csv")}>
          Download a blank template
        </button>

        {result && (
          <div className="mt-4 rounded-xl border border-line p-3 text-sm">
            <p>
              <b>{result.rows.length}</b> application{result.rows.length === 1 ? "" : "s"} ready to import
              {result.skipped.length > 0 && <span className="text-muted">, {result.skipped.length} skipped</span>}.
            </p>
            <p className="mt-1 text-xs text-muted">
              Matched columns: {Object.entries(result.mapped).map(([k, v]) => `${v} → ${k.replace("_", " ")}`).join(", ") || "none"}
            </p>
            {result.skipped.slice(0, 4).map((s) => (
              <p key={s.line} className="mt-1 text-xs text-danger">Row {s.line}: {s.reason}</p>
            ))}
          </div>
        )}
        {error && <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={btn.secondary} onClick={onClose}>Cancel</button>
          <button type="button" className={btn.primary} disabled={!result?.rows.length || busy} onClick={confirm}>
            {busy ? "Importing…" : `Import ${result?.rows.length ?? ""}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
