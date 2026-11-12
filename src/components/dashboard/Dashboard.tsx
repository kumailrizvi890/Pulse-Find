"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Application, ApplicationInput, Settings, TrackerEvent } from "@/lib/types";
import { DEFAULT_SETTINGS, emptyApplication } from "@/lib/types";
import {
  actionQueue, applyFilter, daysBetween, followUp, funnel, hasAction, isTechRole, sortForTable,
  summarize, todayISO, CLOSED, type Filter,
} from "@/lib/metrics";
import type { TrackerStore } from "@/lib/store";
import { dedupeImport } from "@/lib/sheet";
import { buildWorkbook, download, toCsv } from "@/lib/export";
import { Overview } from "./Overview";
import { ApplicationDrawer } from "./ApplicationDrawer";
import { ImportDialog } from "./ImportDialog";
import { Panel, StatusPill, Tag, btn, cx, field, fmtDate, useToast } from "./ui";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "action", label: "Waiting on you" },
  { id: "tech", label: "Tech" },
  { id: "active", label: "Active" },
  { id: "ghosted", label: "Ghosted" },
  { id: "closed", label: "Closed" },
];

function greeting(name: string | null) {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name}` : part;
}

export function Dashboard({ store, banner, headerActions, extras, userId }: { store: TrackerStore; banner?: ReactNode; headerActions?: ReactNode; extras?: ReactNode; userId?: string; }) {
  const [apps, setApps] = useState<Application[]>([]);
  const [events, setEvents] = useState<TrackerEvent[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<{ open: boolean; editing: Application | null }>({ open: false, editing: null });
  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { toast, toastNode } = useToast();
  const today = todayISO();

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    store
      .load()
      .then((d) => {
        if (!alive) return;
        setApps(d.apps);
        setEvents(d.events);
        setSettings(d.settings);
        setState("ready");
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setLoadError(e instanceof Error ? e.message : "Couldn't load your tracker.");
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
  const queue = useMemo(() => actionQueue(apps), [apps]);
  const steps = useMemo(() => funnel(apps), [apps]);
  const rows = useMemo(() => sortForTable(applyFilter(apps, filter, today, settings.ghost_days, query)), [apps, filter, today, settings.ghost_days, query]);
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, applyFilter(apps, f.id, today, settings.ghost_days).length])) as Record<Filter, number>,
    [apps, today, settings.ghost_days],
  );
  const initial = useMemo<ApplicationInput>(() => {
    if (!drawer.editing) return emptyApplication(today);
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = drawer.editing;
    return rest;
  }, [drawer.editing, today]);

  const closeDrawer = useCallback(() => setDrawer({ open: false, editing: null }), []);

  const logEvent = async (application_id: string, kind: string, details: string) => {
    try {
      const ev = await store.addEvent({ application_id, event_date: today, kind, details });
      setEvents((p) => [ev, ...p]);
    } catch {
      /* the application itself saved; a missing history line isn't worth interrupting for */
    }
  };

  async function save(v: ApplicationInput) {
    const before = drawer.editing;
    if (before) {
      const next = await store.update(before.id, v);
      setApps((p) => p.map((a) => (a.id === next.id ? next : a)));
      if (before.status !== next.status) await logEvent(next.id, next.status, next.latest_update);
      else if (hasAction(before) && !hasAction(next)) await logEvent(next.id, "Action done", before.action_needed);
      toast("Saved");
    } else {
      const made = await store.create(v);
      setApps((p) => [made, ...p]);
      await logEvent(made.id, "Applied", made.role || "Application added");
      toast(`Added ${made.company}`);
    }
    setDrawer({ open: false, editing: null });
  }

  async function remove() {
    const a = drawer.editing;
    if (!a) return;
    try {
      await store.remove(a.id);
      setApps((p) => p.filter((x) => x.id !== a.id));
      setEvents((p) => p.filter((e) => e.application_id !== a.id));
      setDrawer({ open: false, editing: null });
      toast(`Deleted ${a.company}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't delete that.", "error");
    }
  }

  async function markDone(a: Application) {
    try {
      const next = await store.update(a.id, { action_needed: "", action_due: null, last_contact: today });
      setApps((p) => p.map((x) => (x.id === next.id ? next : x)));
      await logEvent(a.id, "Action done", a.action_needed);
      toast("Marked done");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't update that.", "error");
    }
  }

  async function importRows(inputs: ApplicationInput[]) {
    const { fresh, duplicates } = dedupeImport(inputs, apps);
    const made = fresh.length ? await store.createMany(fresh) : [];
    setApps((p) => [...made, ...p]);
    toast(
      duplicates.length
        ? `Imported ${made.length}; skipped ${duplicates.length} already in your tracker`
        : `Imported ${made.length} application${made.length === 1 ? "" : "s"}`,
    );
  }

  async function exportXlsx() {
    try {
      const buf = await buildWorkbook(sortForTable(apps), settings, today);
      download(`pulse-find-${today}.xlsx`, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    } catch {
      toast("Couldn't build the spreadsheet. Try CSV instead.", "error");
    }
  }

  if (state === "error") {
    return (
      <Shell banner={banner}>
        <Panel title="Your tracker didn't load">
          <p className="text-sm text-muted">{loadError}</p>
          <button className={cx(btn.primary, "mt-4")} onClick={retry}>Try again</button>
        </Panel>
      </Shell>
    );
  }

  const loading = state === "loading";

  return (
    <Shell banner={banner}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-faint">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight sm:text-[28px]">{greeting(settings.display_name)}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btn.primary} onClick={() => setDrawer({ open: true, editing: null })}>+ Add application</button>
          {headerActions}
          <button className={btn.secondary} onClick={() => setImportOpen(true)}>Import sheet</button>
          <ExportMenu onXlsx={exportXlsx} onCsv={() => download(`pulse-find-${today}.csv`, toCsv(sortForTable(apps)), "text/csv")} disabled={!apps.length} />
          <button className={btn.ghost} onClick={() => setSettingsOpen(true)} aria-label="Settings">Settings</button>
        </div>
      </div>

      {!loading && apps.length === 0 ? (
        <>
        <Panel title="Start your tracker">
          <p className="max-w-prose text-sm text-muted">
            Add the applications you&apos;ve already sent, or import the spreadsheet you&apos;ve been keeping. Pulse Find keeps track of who went quiet and what&apos;s waiting on you.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className={btn.primary} onClick={() => setDrawer({ open: true, editing: null })}>Add your first application</button>
            <button className={btn.secondary} onClick={() => setImportOpen(true)}>Import a sheet</button>
          </div>
        </Panel>
        {extras}
        </>
      ) : (
        <>
                <Overview apps={apps} sum={sum} queue={queue} steps={steps} loading={loading} userId={userId} onDone={markDone} onOpen={(a) => setDrawer({ open: true, editing: a })} onShowWaiting={() => setFilter("action")} />

          {extras}

          <Panel
            title="All applications"
            hint="Teal tag marks a tech role. Red company names have something waiting on you."
            action={
              <input
                id="search"
                type="search"
                className={cx(field, "w-full sm:w-56")}
                placeholder="Search company or role"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            }
          >
            <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  aria-pressed={filter === f.id}
                  className={cx(
                    "whitespace-nowrap rounded-full border px-3 py-1.5 font-mono text-xs transition",
                    filter === f.id ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-ink",
                  )}
                >
                  {f.label} <span className="tnum opacity-70">{counts[f.id] ?? 0}</span>
                </button>
              ))}
            </div>
            {loading ? (
              <Skeleton lines={6} />
            ) : rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No applications match this filter.</p>
            ) : (
              <AppList rows={rows} today={today} ghostDays={settings.ghost_days} onOpen={(a) => setDrawer({ open: true, editing: a })} />
            )}
          </Panel>

          <Panel title="Recent activity">
            {loading ? (
              <Skeleton lines={4} />
            ) : events.length === 0 ? (
              <p className="text-sm text-muted">Changes you make show up here.</p>
            ) : (
              <ol className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm md:grid-cols-2">
                {events.slice(0, 12).map((e) => {
                  const app = apps.find((a) => a.id === e.application_id);
                  return (
                    <li key={e.id} className="grid grid-cols-[60px_minmax(0,1fr)] gap-2">
                      <span className="tnum pt-0.5 font-mono text-xs text-faint">{fmtDate(e.event_date)}</span>
                      <span className="min-w-0">
                        <b className="font-semibold">{app?.company ?? "Removed"}</b> <span className="text-accent">{e.kind}</span>
                        {e.details && <span className="block truncate text-muted">{e.details}</span>}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </Panel>
        </>
      )}

      {drawer.open && (
        <ApplicationDrawer
          key={drawer.editing?.id ?? "new"}
          initial={initial}
          editing={drawer.editing}
          events={events}
          onClose={closeDrawer}
          onSave={save}
          onDelete={remove}
        />
      )}
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImport={importRows} />
      {settingsOpen && <SettingsDialog
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={async (s) => {
          try {
            setSettings(await store.saveSettings(s));
            setSettingsOpen(false);
            toast("Settings saved");
          } catch (e) {
            toast(e instanceof Error ? e.message : "Couldn't save settings.", "error");
          }
        }}
      />}
      {toastNode}
    </Shell>
  );
}

function Shell({ banner, children }: { banner?: ReactNode; children: ReactNode }) {
  return (
    <>
      {banner}
      <main className="gutter rise mx-auto flex w-full max-w-[1180px] flex-col gap-4 pb-16 pt-6">{children}</main>
    </>
  );
}

function AppList({ rows, today, ghostDays, onOpen }: { rows: Application[]; today: string; ghostDays: number; onOpen: (a: Application) => void }) {
  const flagTag = (a: Application) => {
    const f = followUp(a, today, ghostDays);
    if (f === "ghosted") return <Tag tone="danger">Ghosted</Tag>;
    if (f === "soon") return <Tag tone="warn">Follow up soon</Tag>;
    return null;
  };
  return (
    <>
      {/* phones: cards */}
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((a) => (
          <li key={a.id}>
            <button onClick={() => onOpen(a)} className="w-full rounded-xl border border-line bg-surface-2 p-3 text-left">
              <div className="flex items-start justify-between gap-2">
                <span className={cx("min-w-0 font-semibold", hasAction(a) && "text-danger")}>{a.company}</span>
                <StatusPill status={a.status} />
              </div>
              <p className="mt-0.5 truncate text-sm text-muted">{a.role || "Role not set"}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-faint">
                {isTechRole(a.role) && <Tag tone="tech">Tech</Tag>}
                {flagTag(a)}
                <span className="tnum font-mono">Applied {fmtDate(a.date_applied)}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
      {/* wider screens: table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">
              <th className="py-2 pr-3 font-medium">Company / role</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Applied</th>
              <th className="py-2 pr-3 font-medium">Last contact</th>
              <th className="py-2 pr-3 font-medium">Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const quiet = a.last_contact && !CLOSED.includes(a.status) ? daysBetween(a.last_contact, today) : null;
              return (
                <tr key={a.id} onClick={() => onOpen(a)} className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="max-w-[360px] py-2.5 pr-3">
                    <button onClick={(e) => { e.stopPropagation(); onOpen(a); }} className={cx("text-left font-semibold", hasAction(a) && "text-danger")}>
                      {a.company}
                    </button>
                    <p className="truncate text-xs text-muted">{a.role || "Role not set"}</p>
                    {hasAction(a) && <p className="truncate text-xs text-danger">→ {a.action_needed}</p>}
                  </td>
                  <td className="py-2.5 pr-3"><StatusPill status={a.status} /></td>
                  <td className="tnum whitespace-nowrap py-2.5 pr-3 font-mono text-xs">{fmtDate(a.date_applied)}</td>
                  <td className="tnum whitespace-nowrap py-2.5 pr-3 font-mono text-xs">
                    {fmtDate(a.last_contact)}
                    {quiet !== null && <span className="ml-1 text-faint">{quiet}d</span>}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="flex flex-wrap gap-1">
                      {isTechRole(a.role) && <Tag tone="tech">Tech</Tag>}
                      {flagTag(a)}
                      {a.interviews_done > 0 && <Tag tone="muted">{a.interviews_done} int</Tag>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ExportMenu({ onXlsx, onCsv, disabled }: { onXlsx: () => void; onCsv: () => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button className={btn.secondary} onClick={() => setOpen((o) => !o)} disabled={disabled} aria-expanded={open} aria-haspopup="menu">
        Export
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-52 rounded-xl border border-line bg-surface p-1 shadow-panel" onMouseLeave={() => setOpen(false)}>
          <button role="menuitem" className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2" onClick={() => { setOpen(false); onXlsx(); }}>
            Excel (.xlsx) with colors
          </button>
          <button role="menuitem" className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2" onClick={() => { setOpen(false); onCsv(); }}>
            CSV
          </button>
        </div>
      )}
    </div>
  );
}

function SettingsDialog({ settings, onClose, onSave }: { settings: Settings; onClose: () => void; onSave: (s: Settings) => Promise<void> }) {
  const [s, setS] = useState(settings);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <button aria-label="Close" className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} />
      <form
        className="relative m-4 w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-panel"
        onSubmit={(e) => { e.preventDefault(); onSave(s); }}
      >
        <h2 id="settings-title" className="font-display text-lg font-bold">Settings</h2>
        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted" htmlFor="s-name">
            Your first name
            <input id="s-name" className={field} value={s.display_name ?? ""} maxLength={60} onChange={(e) => setS({ ...s, display_name: e.target.value || null })} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted" htmlFor="s-ghost">
            Call it ghosted after this many quiet days
            <input id="s-ghost" type="number" min={3} max={120} className={field} value={s.ghost_days} onChange={(e) => setS({ ...s, ghost_days: Math.max(3, Math.min(120, Number(e.target.value) || 21)) })} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted" htmlFor="s-goal">
            Weekly application goal
            <input id="s-goal" type="number" min={1} max={200} className={field} value={s.weekly_goal} onChange={(e) => setS({ ...s, weekly_goal: Math.max(1, Math.min(200, Number(e.target.value) || 25)) })} />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={btn.secondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={btn.primary}>Save</button>
        </div>
      </form>
    </div>
  );
}

function Skeleton({ lines }: { lines: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-surface-2" style={{ width: `${90 - i * 9}%` }} />
      ))}
    </div>
  );
}
