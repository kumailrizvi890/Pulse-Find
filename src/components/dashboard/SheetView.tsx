"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Application, ApplicationInput, Settings, Status } from "@/lib/types";
import { DEFAULT_SETTINGS, STATUSES } from "@/lib/types";
import { dedupeImport, filterSheet, sheetColumnWidths, sheetRows, sortSheet, SHEET_COLUMNS, visibleSheetColumns, type SheetKey, type SortDir } from "@/lib/sheet";
import { hasAction, summarize, todayISO } from "@/lib/metrics";
import { LOAD_TIMEOUT_MS, withLoadTimeout } from "@/lib/load-timeout";
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

// Sheet columns are 4-9% of a 1240px table, so a cell shows roughly
// fifteen characters: anything past forty is certainly truncated. Long
// cell text gets a Show more toggle that expands it in place, and every
// truncated cell carries the full text as a hover tooltip, so the value
// is readable without opening the editor. Same pattern as the networking
// ContactNote toggle, with a lower limit for the narrow sheet columns.
// The forty-character limit is only a fallback: a shorter value can
// still truncate in the narrowest column ("Backend Engineer Intern" is
// 23 characters and already ellipsised), so the toggle also appears
// whenever the rendered text actually overflows its cell (scrollWidth
// past clientWidth, re-measured on resize). A value that fits shows
// neither toggle nor tooltip trouble: the title is always there.
const CELL_EXPAND_LIMIT = 40;

export function TruncatedCellText({
  value,
  expanded,
  onToggle,
  className,
}: {
  value: string;
  expanded: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const long = value.length > CELL_EXPAND_LIMIT;
  useEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [value, expanded]);
  // Expanded cells keep their Show less button; collapsed cells get one
  // when the value is long or actually overflowing. In a server render
  // there is no layout to measure, so only the long rule applies there.
  const showToggle = expanded || long || overflowing;
  return (
    <>
      <span
        ref={ref}
        className={cx("block", expanded ? "whitespace-normal break-words" : "truncate", className)}
        title={value}
      >
        {value}
      </span>
      {showToggle && (
        <button
          type="button"
          className="mt-0.5 text-xs font-medium text-accent hover:underline"
          aria-expanded={expanded}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </>
  );
}

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
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [onlyActions, setOnlyActions] = useState(false);
  const [status, setStatus] = useState<Status | "All">("All");
  const [sort, setSort] = useState<{ key: SheetKey; dir: SortDir }>({ key: "last_contact", dir: "desc" });
  const [editing, setEditing] = useState<Editing>(null);
  const [expanded, setExpanded] = useState<Editing>(null); // One expanded cell at a time.
  const [draft, setDraft] = useState("");
  const [showEmpty, setShowEmpty] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { toast, toastNode } = useToast();
  const today = todayISO();

  useEffect(() => {
    let alive = true;
    // A hung load used to sit on the skeleton forever; after 15s the
    // timeout rejects and the error panel offers "Try again". Retrying
    // bumps `attempt`, so a fresh load gets a fresh timer.
    withLoadTimeout(store.load(), LOAD_TIMEOUT_MS)
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
  }, [store, attempt]);

  const retry = () => {
    setState("loading");
    setAttempt((n) => n + 1);
  };

  const sum = useMemo(() => summarize(apps, today, settings.ghost_days), [apps, today, settings.ghost_days]);
  const rows = useMemo(
    () => sortSheet(filterSheet(sheetRows(apps, today, settings.ghost_days), query, onlyActions, status), sort.key, sort.dir),
    [apps, today, settings.ghost_days, query, onlyActions, status, sort],
  );

  // Columns with nothing in any visible row (the demo's Email column: no
  // seed has a link) are hidden instead of sitting there as blank stripes.
  // The footer offers them back, so the first value in a hidden column is
  // never unreachable from the sheet.
  const { visibleColumns, hiddenCount } = useMemo(() => {
    const shown = visibleSheetColumns(rows);
    return {
      visibleColumns: showEmpty ? SHEET_COLUMNS : shown,
      hiddenCount: SHEET_COLUMNS.length - shown.length,
    };
  }, [rows, showEmpty]);
  const colWidths = useMemo(() => sheetColumnWidths(visibleColumns), [visibleColumns]);

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
    setExpanded(null);
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
      <main className="gutter mx-auto w-full max-w-none pb-16 pt-6">
        <Panel title="Your sheet didn't load">
          <p className="text-sm text-muted">{loadError}</p>
          <button className={cx(btn.primary, "mt-4")} onClick={retry}>Try again</button>
        </Panel>
      </main>
    );
  }

  return (
    <main className="gutter rise mx-auto flex w-full max-w-none flex-col gap-4 pb-16 pt-6" data-tour="sheet">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-[28px]">Sheet</h1>
          <p className="mt-1 text-sm text-muted">
            Your tracker as a spreadsheet — the same columns as your Excel sheet. Click an editable cell to change it;{store.kind === "demo" ? " nothing is saved in the demo." : " it saves right away."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btn.secondary} onClick={() => setImportOpen(true)}>Import sheet</button>
          <button className={btn.secondary} onClick={exportXlsx} disabled={!apps.length}>Export .xlsx</button>
          <button className={btn.ghost} onClick={() => download(`pulse-find-sheet-${today}.csv`, toCsv(rows.map((r) => r.app)), "text/csv")} disabled={!apps.length}>CSV</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm" data-tour="sheet-tools">
        {state === "loading" ? (
          // The counts come from the tracker data, so while it is still
          // loading the chips are skeleton pills, not zeros.
          <>
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className="h-8 w-28 animate-pulse rounded-lg bg-surface-2" aria-hidden="true" />
            ))}
          </>
        ) : (
          <>
        <span className="tnum rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-xs"><b>{sum.total}</b> applications</span>
        <span className="tnum rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-xs"><b>{sum.tech}</b> tech</span>
        <span className="tnum rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-xs"><b>{sum.actions}</b> waiting on you</span>
        <span className="tnum rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-xs"><b>{sum.ghosted}</b> ghosted</span>
        <span className="tnum rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-xs"><b>{sum.rejected}</b> rejections</span>
          </>
        )}
        <span className="ml-auto flex items-center gap-2">
          <select
            className={cx(field, "w-40")}
            value={status}
            onChange={(e) => setStatus(e.target.value as Status | "All")}
            aria-label="Filter by status"
          >
            <option value="All">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {status !== "All" && (
            <button
              onClick={() => setStatus("All")}
              aria-label={`Clear status filter ${status}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-danger/40 bg-danger-soft px-2.5 py-1.5 text-xs font-semibold text-danger transition hover:brightness-110"
            >
              Status: {status} · {apps.filter((a) => a.status === status).length}
              <span aria-hidden="true">×</span>
            </button>
          )}
          <input
            type="search"
            className={cx(field, "w-52")}
            placeholder="Filter the sheet"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter the sheet"
          />
          <button
            className={cx("whitespace-nowrap rounded-lg border px-3 py-1.5 font-mono text-xs transition", onlyActions ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-ink")}
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
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-muted">
              {apps.length === 0 ? "Nothing here yet. Import your Excel sheet or add applications on the Tracker tab." : "No rows match this filter."}
            </p>
            {apps.length > 0 && (
              <button
                className={cx(btn.secondary, "mt-3")}
                onClick={() => {
                  setQuery("");
                  setStatus("All");
                  setOnlyActions(false);
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="max-h-[70dvh] overflow-auto">
            <table className="w-full min-w-[1240px] table-fixed border-collapse text-[13px]">
              <colgroup>
                {colWidths.map((c) => (
                  <col key={c.key} style={{ width: `${c.pct}%` }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {visibleColumns.map((col, ci) => (
                    <th
                      key={col.key}
                      scope="col"
                      aria-sort={sort.key === col.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                      className={cx(
                        "sheet-sticky sticky top-0 z-10 border-b border-line px-3 py-2.5 text-left font-mono text-[10.5px] uppercase tracking-[0.08em] text-faint",
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
                      {visibleColumns.map((col, ci) => {
                        const isEditing = editing?.id === a.id && editing.key === col.key;
                        const isExpanded = expanded?.id === a.id && expanded?.key === col.key;
                        const base = cx(
                          "px-3 py-2 align-top",
                          ci === 0 && "sticky left-0 z-[5] border-r border-line sheet-sticky font-semibold",
                          col.numeric && "tnum text-right font-mono text-xs",
                          col.editable && "group",
                          col.editable && !isEditing && "cursor-text",
                        );
                        // Empty editable cells stay quiet: a faint dash, and the
                        // "Click to edit" hint only while the cell is hovered.
                      // Touch screens have no hover, so on coarse pointers
                      // the hint shows instead of the dash (see globals.css).
                        // The old per-cell title tooltip put that hint on all
                        // 264 editable cells at once, which was the noise.
                        const isEmptyEditable = !!col.editable && r.values[col.key] === "";
                        // Text editors float wider than the narrow cell, so a long
                        // value is visible while editing instead of clipping inside
                        // the column width. Date and number editors stay cell width:
                        // their values are short.
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
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") (e.target as HTMLSelectElement).blur();
                                    if (e.key === "Escape") setEditing(null);
                                  }}
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
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") (e.target as HTMLSelectElement).blur();
                                    if (e.key === "Escape") setEditing(null);
                                  }}
                                >
                                  <option value="Y">Y</option>
                                  <option value="N">N</option>
                                </select>
                              ) : (
                                <input
                                  autoFocus
                                  type={col.editable === "date" ? "date" : col.editable === "number" ? "number" : "text"}
                                  className={cx(field, "px-2 py-1 text-[13px]", col.editable === "text" && "relative shadow-panel")}
                                  style={col.editable === "text" ? { width: "min(360px, 72vw)" } : undefined}
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
                              <p className="mt-1 whitespace-nowrap text-[11px] text-faint">Enter to save · Esc to cancel</p>
                            </td>
                          );
                        }
                        return (
                          <td
                            key={col.key}
                            className={base}
                            onClick={col.editable ? () => startEdit(a, col.key) : undefined}
                          >
                            {isEmptyEditable ? (
                              <span className="block truncate">
                                <span aria-hidden="true" className="text-faint group-hover:hidden touch-edit-dash">—</span>
                                <span className="hidden text-faint group-hover:inline touch-edit-hint">Click to edit</span>
                              </span>
                            ) : col.key === "status" ? (
                              <StatusPill status={a.status} />
                            ) : col.key === "flag" ? (
                              r.flag === "ghosted" ? <Tag tone="danger">{r.flagLabel}</Tag> : r.flag === "soon" ? <Tag tone="warn">{r.flagLabel}</Tag> : r.flag ? <span className="text-muted">{r.flagLabel}</span> : ""
                            ) : col.key === "tech" ? (
                              r.tech ? <Tag tone="tech">Tech</Tag> : ""
                            ) : col.key === "date_applied" || col.key === "last_contact" || col.key === "action_due" ? (
                              <span className="tnum font-mono text-xs">{fmtDate(r.values[col.key] || null)}</span>
                            ) : col.key === "action_needed" ? (
                              <TruncatedCellText
                                value={r.values[col.key]}
                                expanded={isExpanded}
                                onToggle={() => setExpanded(isExpanded ? null : { id: a.id, key: col.key })}
                                className={actionRow ? "font-semibold text-danger" : undefined}
                              />
                            ) : col.key === "company" ? (
                              <span className={cx(actionRow && "text-danger")}>{r.values[col.key]}</span>
                            ) : (
                              <TruncatedCellText
                                value={r.values[col.key]}
                                expanded={isExpanded}
                                onToggle={() => setExpanded(isExpanded ? null : { id: a.id, key: col.key })}
                              />
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
          {state === "loading" ? (
            "Loading your sheet…"
          ) : (
            <>
          Showing {rows.length} of {apps.length} rows · Days Since Contact and Follow-Up Flag are worked out from Last Contact ({settings.ghost_days}+ quiet days = ghosted) · click a header to sort
          {hiddenCount > 0 && (
            <>
              {" · "}
              <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={() => setShowEmpty((v) => !v)}>
                {showEmpty
                  ? "Hide empty columns"
                  : `${hiddenCount} empty column${hiddenCount === 1 ? "" : "s"} hidden · Show all`}
              </button>
            </>
          )}
            </>
          )}
        </p>
      </section>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImport={importRows} />
      {toastNode}
    </main>
  );
}
