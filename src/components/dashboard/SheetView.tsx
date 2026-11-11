"use client";

import { useEffect, useMemo, useState } from "react";
import type { Application, ApplicationInput, Settings } from "@/lib/types";
import { DEFAULT_SETTINGS, STATUSES } from "@/lib/types";
import { dedupeImport, filterSheet, sheetRows, sortSheet, SHEET_COLUMNS, type SheetKey, type SortDir } from "@/lib/sheet";
import { hasAction, summarize, todayISO } from "@/lib/metrics";
import type { TrackerStore } from "@/lib/store";
import { buildWorkbook, download, toCsv } from "@/lib/export";
import { ImportDialog } from "./ImportDialog";
import { Panel, StatusPill, Tag, btn, cx, field, fmtDate, useToast } from "./ui";

/** Sheet columns that write back to an application field (Email is the tracker's link field). */
const FIELD_FOR: Partial<Record<SheetKey, keyof ApplicationInput>> = {
  company: "company",
  role: "role",
  date_applied: "date_applied",
  status: "status",
  last_contact: "last_contact",
  oa_received: "oa_received",
  interviews_done: "interviews_done",
  latest_update: "latest_update",
  email: "link",
  notes: "notes",
  action_needed: "action_needed",
  action_due: "action_due",
};

type Editing = { id: string; key: SheetKey } | null;

/**
 * The tracker as a proper sheet: the Excel tracker's sixteen columns, a sticky
 * header, a frozen Company column, zebra rows, sortable/filterable columns,
 * and inline editing that saves through the same store as the dashboard.
 */
export function SheetView({ store }: { store: TrackerStore }) {
  const [apps, setApps] = useState<Application[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [onlyActions, setOnlyActions] = useState(false);
  const [sort, setSort] = useState<{ key: SheetKey; dir: SortDir }>({ key: "last_contact", dir: "desc" });
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const { toast, toastNode } = useToast();
  const today = todayISO();

  useEffect(() => {
    let alive = true;
    store
      .load()
      .then((d) => {
        if (!alive) return;
        setApps(d.apps);
        setSettings(d.settings);
        setState("ready");
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setLoadError(e instanceof Error ? e.message : "Couldn't load your sheet.");
        setState("error");
      });
    return () => {
      alive = false;
    };
  }, [store]);

  const sum = useMemo(() => summarize(apps, today, settings.ghost_days), [apps, today, settings.ghost_days]);
  const rows = useMemo(
    () => sortSheet(filterSheet(sheetRows(apps, today, settings.ghost_days), query, onlyActions), sort.key, sort.dir),
    [apps, today, settings.ghost_days, query, onlyActions, sort],
  );

  function toggleSort(key: SheetKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "date_applied" || key === "last_contact" || key === "action_due" ? "desc" : "asc" }));
  }

  function startEdit(app: Application, key: SheetKey) {
    const col = SHEET_COLUMNS.find((c) => c.key === key);
    if (!col?.editable) return;
    const f = FIELD_FOR[key];
    if (!f) return;
    const v = app[f];
    setDraft(typeof v === "boolean" ? (v ? "Y" : "N") : v === null || v === undefined ? "" : String(v));
    setEditing({ id: app.id, key });
  }

  async function commitEdit(app: Application) {
    if (!editing) return;
    const key = editing.key;
    const col = SHEET_COLUMNS.find((c) => c.key === key)!;
    const f = FIELD_FOR[key]!;
    setEditing(null);
    let value: ApplicationInput[keyof ApplicationInput];
    if (col.editable === "bool") value = (draft.trim().toLowerCase() === "y" || draft.trim().toLowerCase() === "yes") as never;
    else if (col.editable === "number") value = Math.min(50, Math.max(0, parseInt(draft, 10) || 0)) as never;
    else if (col.editable === "date") value = (draft.trim() === "" ? null : draft.trim()) as never;
    else value = draft.trim() as never;
    if (String(app[f] ?? "") === String(value ?? "")) return;
    try {
      const next = await store.update(app.id, { [f]: value } as Partial<ApplicationInput>);
      setApps((p) => p.map((a) => (a.id === next.id ? next : a)));
      toast("Saved");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save that cell.", "error");
    }
  }

  async function importRows(inputs: ApplicationInput[]) {
    const { fresh, duplicates } = dedupeImport(inputs, apps);
    if (fresh.length) {
      const made = await store.createMany(fresh);
      setApps((p) => [...made, ...p]);
    }
    toast(
      duplicates.length
        ? `Imported ${fresh.length}; skipped ${duplicates.length} already in your tracker`
        : `Imported ${fresh.length} application${fresh.length === 1 ? "" : "s"}`,
    );
  }

  async function exportXlsx() {
    try {
      const buf = await buildWorkbook(rows.map((r) => r.app), settings, today);
      download(`pulse-find-sheet-${today}.xlsx`, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    } catch {
      toast("Couldn't build the spreadsheet. Try CSV instead.", "error");
    }
  }

  if (state === "error") {
    return (
      <main className="gutter mx-auto w-full max-w-[1180px] pb-16 pt-6">
        <Panel title="Your sheet didn't load">
          <p className="text-sm text-muted">{loadError}</p>
        </Panel>
      </main>
    );
  }

  return (
    <main className="gutter rise mx-auto flex w-full max-w-[1180px] flex-col gap-4 pb-16 pt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-[28px]">Sheet</h1>
          <p className="mt-1 text-sm text-muted">
            Your tracker as a spreadsheet — the same columns as your Excel sheet. Click an editable cell to change it; it saves right away.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btn.secondary} onClick={() => setImportOpen(true)}>Import sheet</button>
          <button className={btn.secondary} onClick={exportXlsx} disabled={!apps.length}>Export .xlsx</button>
          <button className={btn.ghost} onClick={() => download(`pulse-find-sheet-${today}.csv`, toCsv(rows.map((r) => r.app)), "text/csv")} disabled={!apps.length}>CSV</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="tnum rounded-full border border-line bg-surface px-3 py-1.5 font-mono text-xs"><b>{sum.total}</b> applications</span>
        <span className="tnum rounded-full border border-line bg-surface px-3 py-1.5 font-mono text-xs"><b>{sum.tech}</b> tech</span>
        <span className="tnum rounded-full border border-line bg-surface px-3 py-1.5 font-mono text-xs"><b>{sum.actions}</b> waiting on you</span>
        <span className="tnum rounded-full border border-line bg-surface px-3 py-1.5 font-mono text-xs"><b>{sum.ghosted}</b> ghosted</span>
        <span className="tnum rounded-full border border-line bg-surface px-3 py-1.5 font-mono text-xs"><b>{sum.rejected}</b> rejections</span>
        <span className="ml-auto flex items-center gap-2">
          <input
            type="search"
            className={cx(field, "w-52")}
            placeholder="Filter the sheet"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter the sheet"
          />
          <button
            className={cx("rounded-full border px-3 py-1.5 font-mono text-xs transition", onlyActions ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-ink")}
            aria-pressed={onlyActions}
            onClick={() => setOnlyActions((v) => !v)}
          >
            Waiting on you
          </button>
        </span>
      </div>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-panel">
        {state === "loading" ? (
          <div className="flex flex-col gap-2 p-5" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-surface-2" style={{ width: `${92 - i * 7}%` }} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            {apps.length === 0 ? "Nothing here yet. Import your Excel sheet or add applications on the Tracker tab." : "No rows match this filter."}
          </p>
        ) : (
          <div className="max-h-[70dvh] overflow-auto">
            <table className="w-full min-w-[1240px] border-collapse text-[13px]">
              <thead>
                <tr>
                  {SHEET_COLUMNS.map((col, ci) => (
                    <th
                      key={col.key}
                      scope="col"
                      aria-sort={sort.key === col.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                      className={cx(
                        "sticky top-0 z-10 whitespace-nowrap border-b border-line bg-surface px-3 py-2.5 text-left font-mono text-[10.5px] uppercase tracking-[0.08em] text-faint",
                        ci === 0 && "left-0 z-20 border-r",
                      )}
                    >
                      <button className="inline-flex items-center gap-1 hover:text-ink" onClick={() => toggleSort(col.key)} title={`Sort by ${col.header}`}>
                        {col.header}
                        <span aria-hidden="true" className={sort.key === col.key ? "text-accent" : "opacity-30"}>{sort.key === col.key && sort.dir === "asc" ? "▲" : "▼"}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => {
                  const a = r.app;
                  const actionRow = hasAction(a);
                  return (
                    <tr key={a.id} className={cx("border-b border-line last:border-0 hover:bg-accent-soft/40", ri % 2 === 1 && "bg-surface-2/60")}>
                      {SHEET_COLUMNS.map((col, ci) => {
                        const isEditing = editing?.id === a.id && editing.key === col.key;
                        const base = cx(
                          "max-w-[260px] px-3 py-2 align-top",
                          ci === 0 && "sticky left-0 z-[5] border-r border-line bg-surface font-semibold",
                          col.numeric && "tnum text-right font-mono text-xs",
                          col.editable && !isEditing && "cursor-text",
                        );
                        if (isEditing) {
                          return (
                            <td key={col.key} className={base}>
                              {col.editable === "status" ? (
                                <select
                                  autoFocus
                                  className={cx(field, "px-2 py-1 text-[13px]")}
                                  value={draft}
                                  onChange={(e) => setDraft(e.target.value)}
                                  onBlur={() => commitEdit(a)}
                                  onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); }}
                                >
                                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                              ) : col.editable === "bool" ? (
                                <select
                                  autoFocus
                                  className={cx(field, "px-2 py-1 text-[13px]")}
                                  value={draft}
                                  onChange={(e) => setDraft(e.target.value)}
                                  onBlur={() => commitEdit(a)}
                                  onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); }}
                                >
                                  <option value="Y">Y</option>
                                  <option value="N">N</option>
                                </select>
                              ) : (
                                <input
                                  autoFocus
                                  type={col.editable === "date" ? "date" : col.editable === "number" ? "number" : "text"}
                                  className={cx(field, "px-2 py-1 text-[13px]")}
                                  value={draft}
                                  min={col.editable === "number" ? 0 : undefined}
                                  max={col.editable === "number" ? 50 : undefined}
                                  onChange={(e) => setDraft(e.target.value)}
                                  onBlur={() => commitEdit(a)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                    if (e.key === "Escape") setEditing(null);
                                  }}
                                />
                              )}
                            </td>
                          );
                        }
                        return (
                          <td
                            key={col.key}
                            className={base}
                            onClick={col.editable ? () => startEdit(a, col.key) : undefined}
                            title={col.editable ? "Click to edit" : undefined}
                          >
                            {col.key === "status" ? (
                              <StatusPill status={a.status} />
                            ) : col.key === "flag" ? (
                              r.flag === "ghosted" ? <Tag tone="danger">{r.flagLabel}</Tag> : r.flag === "soon" ? <Tag tone="warn">{r.flagLabel}</Tag> : r.flag ? <span className="text-muted">{r.flagLabel}</span> : ""
                            ) : col.key === "tech" ? (
                              r.tech ? <Tag tone="tech">Tech</Tag> : ""
                            ) : col.key === "date_applied" || col.key === "last_contact" || col.key === "action_due" ? (
                              <span className="tnum font-mono text-xs">{fmtDate(r.values[col.key] || null)}</span>
                            ) : col.key === "action_needed" ? (
                              <span className={cx("block truncate", actionRow && "font-semibold text-danger")}>{r.values[col.key]}</span>
                            ) : col.key === "company" ? (
                              <span className={cx(actionRow && "text-danger")}>{r.values[col.key]}</span>
                            ) : (
                              <span className="block truncate">{r.values[col.key]}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-line px-4 py-2.5 font-mono text-[11px] text-faint">
          Showing {rows.length} of {apps.length} rows · Days Since Contact and Follow-Up Flag are worked out from Last Contact ({settings.ghost_days}+ quiet days = ghosted) · click a header to sort
        </p>
      </section>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImport={importRows} />
      {toastNode}
    </main>
  );
}
