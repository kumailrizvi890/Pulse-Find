"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Application, ApplicationInput, Settings, Status, TrackerEvent } from "@/lib/types";
import { DEFAULT_SETTINGS, emptyApplication, STATUSES } from "@/lib/types";
import {
  actionQueue, applyFilter, daysBetween, followUp, funnel, hasAction, isTechRole, sortForTable,
  summarize, todayISO, CLOSED, type Filter,
} from "@/lib/metrics";
import type { TrackerStore } from "@/lib/store";
import { LOAD_TIMEOUT_MS, withLoadTimeout } from "@/lib/load-timeout";
import { dedupeImport } from "@/lib/sheet";
import { buildWorkbook, download, toCsv } from "@/lib/export";
import { Overview } from "./Overview";
import { ApplicationDrawer } from "./ApplicationDrawer";
import { TaskChatPanel } from "./TaskChatPanel";
import { ImportDialog } from "./ImportDialog";
import { Panel, StatusPill, Tag, btn, cx, field, fmtDate, useToast } from "./ui";
import { PulseDot, WaitingSignal } from "@/components/PulseBrand";

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

export function Dashboard({ store, banner, headerActions, extras, userId, openGeneralChat }: { store: TrackerStore; banner?: ReactNode; headerActions?: ReactNode; extras?: ReactNode; userId?: string; openGeneralChat?: boolean; }) {
  const [apps, setApps] = useState<Application[]>([]);
  const [events, setEvents] = useState<TrackerEvent[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status | "All">("All");
  const [drawer, setDrawer] = useState<{ open: boolean; editing: Application | null }>({ open: false, editing: null });
  const [chatOpen, setChatOpen] = useState(false);
  const [generalChatOpen, setGeneralChatOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { toast, toastNode } = useToast();
  // The "All applications" list the Overview's "View all waiting items"
  // button scrolls to (see showWaiting below).
  const allAppsRef = useRef<HTMLDivElement>(null);
  const today = todayISO();

  // The header date and greeting come from the visitor's clock, not the
    // server's: the server renders on UTC, so a server-rendered date or
    // part of day is already tomorrow, or the wrong part of the day, for
    // a visitor west of UTC, and React throws the server tree away and
    // re-renders on the client (hydration failed). The header renders a
    // blank line until mount, so the server and client first renders
    // match and the visitor's own date and greeting appear one tick
    // later. Same deferred pattern as the Showcase and ChatBeat.
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
          const t = window.setTimeout(() => setMounted(true), 0);
          return () => window.clearTimeout(t);
    }, []);
  
  

  const [attempt, setAttempt] = useState(0);
  // A hung load used to sit on the skeleton forever (seen live Nov 16:
  // ~a minute of grey pulsing blocks on first load). After 15s the
  // timeout rejects and the existing error panel offers "Try again".
  // Retrying bumps `attempt`, so a fresh load gets a fresh timer.
  useEffect(() => {
    let alive = true;
    withLoadTimeout(store.load(), LOAD_TIMEOUT_MS)
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
  const rows = useMemo(() => sortForTable(applyFilter(apps, filter, today, settings.ghost_days, query, status)), [apps, filter, today, settings.ghost_days, query, status]);
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, applyFilter(apps, f.id, today, settings.ghost_days).length])) as Record<Filter, number>,
    [apps, today, settings.ghost_days],
  );
  // Per-status counts for the status dropdown options ("OA Received (10)").
  const statusCounts = useMemo(
    () => Object.fromEntries(STATUSES.map((s) => [s, apps.filter((a) => a.status === s).length])) as Record<Status, number>,
    [apps],
  );
  const initial = useMemo<ApplicationInput>(() => {
    if (!drawer.editing) return emptyApplication(today);
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = drawer.editing;
    return rest;
  }, [drawer.editing, today]);

  const closeDrawer = useCallback(() => {
    setDrawer({ open: false, editing: null });
    setChatOpen(false);
  }, []);

  // Opening a task also opens its chat on wide screens, where there is room
  // for the chat next to the drawer. On phones the chat stays one tap away
  // in the drawer header so it never covers the form uninvited.
  const openTask = useCallback((a: Application) => {
    setGeneralChatOpen(false);
    setDrawer({ open: true, editing: a });
    if (typeof window !== "undefined" && window.innerWidth >= 1024) setChatOpen(true);
  }, []);

  const [generalChatPending, setGeneralChatPending] = useState(false);

  // The general chat answers from the whole tracker, with no task attached.
  // It closes the drawer and the task chat first: the two panels share the
  // same dock, so only one can be open at a time. If the tracker is still
  // loading, the open waits for the load: opening it with an empty app
  // list would greet with "nothing is waiting" while the real items are
  // still arriving.
  const openGeneralChatPanel = useCallback(() => {
    setDrawer({ open: false, editing: null });
    setChatOpen(false);
    if (state === "ready") setGeneralChatOpen(true);
    else setGeneralChatPending(true);
  }, [state]);

  // "View all waiting items" used to only flip the filter, so the filtered
  // list sat below the fold and the click looked like it did nothing.
  // Scroll the list into view (clear of the sticky header) and move focus
  // to it, so keyboard and screen-reader users land on the results too.
  const showWaiting = useCallback(() => {
    setFilter("action");
    // A status filter would hide waiting items at other stages, so the
    // waiting list always starts unfiltered by status.
    setStatus("All");
    const el = allAppsRef.current;
    if (!el) return;
    const reduceMotion =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
  }, []);

  // A general chat requested while the tracker is still loading waits for
  // the load (see above). This is the React "adjusting state during
  // render" pattern: when a pending request and the ready state meet
  // during a render, the chat opens and React re-renders once
  // immediately. (An effect would work too, but calling setState
  // synchronously in an effect is a lint error here.)
  if (generalChatPending && state === "ready") {
    setGeneralChatPending(false);
    setGeneralChatOpen(true);
  }

  // The demo navbar links here with ?chat=1 (see DemoNav / DemoDashboard):
  // a fresh false-to-true edge opens the general chat once. The ref keeps a
  // re-render with the prop still true from opening it again.
  const prevOpenGeneralRef = useRef(false);
  useEffect(() => {
    if (openGeneralChat && !prevOpenGeneralRef.current) openGeneralChatPanel();
    prevOpenGeneralRef.current = !!openGeneralChat;
  }, [openGeneralChat, openGeneralChatPanel]);

  // The floating Pulse button (see FloatingPulseButton) opens this same
  // general chat from anywhere on the page. It dispatches
  // "pulsefind:assistant-open" / "pulsefind:assistant-close" on window;
  // the state below answers with "pulsefind:assistant-state" so the
  // button knows when the chat is open, when a drawer owns the corner,
  // and how many things are waiting (the badge reuses the same queue
  // count the "Waiting on you" panel shows). The open request also
  // answers while the tracker is still loading (pending), so the button
  // does not mistake a slow load for "no chat on this page" and
  // navigate away.
  useEffect(() => {
    const onOpen = () => openGeneralChatPanel();
    const onClose = () => setGeneralChatOpen(false);
    window.addEventListener("pulsefind:assistant-open", onOpen);
    window.addEventListener("pulsefind:assistant-close", onClose);
    return () => {
      window.removeEventListener("pulsefind:assistant-open", onOpen);
      window.removeEventListener("pulsefind:assistant-close", onClose);
    };
  }, [openGeneralChatPanel]);

  useEffect(() => {
    const dispatchState = () => {
      window.dispatchEvent(
        new CustomEvent("pulsefind:assistant-state", {
          detail: {
            open: generalChatOpen,
            pending: generalChatPending,
            overlayOpen: drawer.open || chatOpen,
            waiting: queue.length,
          },
        }),
      );
    };
    // The button asks for the current state when it mounts (its
    // listener attaches after this Dashboard already mounted, so it
    // would otherwise miss the first dispatch and show no badge).
    window.addEventListener("pulsefind:assistant-ping", dispatchState);
    dispatchState();
    return () => window.removeEventListener("pulsefind:assistant-ping", dispatchState);
  }, [generalChatOpen, generalChatPending, drawer.open, chatOpen, queue.length]);


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
             {mounted
                    ? new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
                            : "\u00A0"}
          </p>
          <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight sm:text-[28px]">{mounted ? greeting(settings.display_name) : "\u00A0"}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btn.primary} onClick={() => setDrawer({ open: true, editing: null })}>+ Add application</button>
          <button className={btn.secondary} onClick={openGeneralChatPanel} aria-label="Ask Pulse about your tracker" data-tour="ask-pulse">
            <PulseDot />
            Ask Pulse
          </button>
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
          <WaitingSignal className="mt-2" />
          <div className="mt-4 flex flex-wrap gap-2">
            <button className={btn.primary} onClick={() => setDrawer({ open: true, editing: null })}>Add your first application</button>
            <button className={btn.secondary} onClick={() => setImportOpen(true)}>Import a sheet</button>
          </div>
        </Panel>
        {extras}
        </>
      ) : (
        <>
                <Overview apps={apps} sum={sum} queue={queue} steps={steps} loading={loading} userId={userId} weeklyGoal={settings.weekly_goal} ghostDays={settings.ghost_days} onDone={markDone} onOpen={openTask} onShowWaiting={showWaiting} />

          {extras}

          <div ref={allAppsRef} tabIndex={-1} className="scroll-mt-32 outline-none">
          <Panel
            title="All applications"
            hint="Red tag marks a tech role. Red company names have something waiting on you."
            action={
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <select
                  className={cx(field, "w-full sm:w-44")}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Status | "All")}
                  aria-label="Filter by status"
                >
                  <option value="All">All statuses</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s} ({statusCounts[s] ?? 0})</option>
                  ))}
                </select>
                <input
                  id="search"
                  type="search"
                  className={cx(field, "w-full sm:w-56")}
                  placeholder="Search anything"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            }
          >
            <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  aria-pressed={filter === f.id}
                  className={cx(
                    "whitespace-nowrap rounded-lg border px-3 py-1.5 font-mono text-xs transition",
                    filter === f.id ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-ink",
                  )}
                >
                  {f.label} <span className="tnum opacity-70">{counts[f.id] ?? 0}</span>
                </button>
              ))}
            </div>
            {status !== "All" && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setStatus("All")}
                  aria-label={`Clear status filter ${status}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-danger/40 bg-danger-soft px-2.5 py-1 text-xs font-semibold text-danger transition hover:brightness-110"
                >
                  Status: {status} · {statusCounts[status] ?? 0}
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            )}
            {loading ? (
              <Skeleton lines={6} />
            ) : rows.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-muted">No applications match this filter.</p>
                <button
                  className={cx(btn.secondary, "mt-3")}
                  onClick={() => {
                    setQuery("");
                    setStatus("All");
                    setFilter("all");
                  }}
                >
                  Clear filters
                </button>
                <WaitingSignal className="mt-2 justify-center" />
              </div>
            ) : (
              <AppList rows={rows} today={today} ghostDays={settings.ghost_days} onOpen={openTask} />
            )}
          </Panel>
          </div>

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
          chatOpen={chatOpen}
          onToggleChat={() => setChatOpen((o) => !o)}
        />
      )}
      {drawer.open && drawer.editing && chatOpen && (
        <TaskChatPanel
          key={`chat-${drawer.editing.id}`}
          application={drawer.editing}
          events={events}
          userId={userId}
          onClose={() => setChatOpen(false)}
        />
      )}
      {generalChatOpen && (
        <TaskChatPanel
          key="chat-general"
          general={{ apps, ghostDays: settings.ghost_days, weeklyGoal: settings.weekly_goal }}
          events={events}
          userId={userId}
          onClose={() => setGeneralChatOpen(false)}
        />
      )}
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImport={importRows} />
      {settingsOpen && <SettingsDialog
        settings={settings}
        userId={userId}
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

function SettingsDialog({ settings, userId, onClose, onSave }: { settings: Settings; userId?: string; onClose: () => void; onSave: (s: Settings) => Promise<void> }) {
  const [s, setS] = useState(settings);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <button aria-label="Close" className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative m-4 w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-panel">
        <h2 id="settings-title" className="font-display text-lg font-bold">Settings</h2>
        <form
          onSubmit={(e) => { e.preventDefault(); onSave(s); }}
        >
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
        <div className="mt-5 border-t border-line pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">Account and agent</h3>
          <div className="mt-2 flex flex-col gap-1">
            <Link href={userId ? "/app/connect" : "/demo/connect"} className="rounded-lg px-2 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2">Connect your agent →</Link>
            <Link href={userId ? "/app/setup" : "/demo/connect"} className="rounded-lg px-2 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2">Get set up in 3 steps →</Link>
            {userId && (
              <form action="/auth/signout" method="post">
                <button type="submit" className="w-full rounded-lg px-2 py-1.5 text-left text-sm font-medium text-danger transition hover:bg-surface-2">Sign out</button>
              </form>
            )}
          </div>
        </div>
      </div>
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
