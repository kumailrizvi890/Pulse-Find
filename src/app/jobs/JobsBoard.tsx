"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ago, calendarDaysBetween } from "@/lib/dates";
import { isConfigured } from "@/lib/env";
import { todayISO } from "@/lib/metrics";
import { readJobPicks, writeJobPicks, type JobPick, type JobPickMark } from "@/lib/job-picks";
import { LOAD_TIMEOUT_MS, withLoadTimeout } from "@/lib/load-timeout";
import { accountPipelineStore, isAlreadyTracked, leadKey } from "@/lib/pipeline";
import { accountStore } from "@/lib/store";
import { TRACKS, type Application, type Track } from "@/lib/types";
import { Tag, btn, cx, field, useToast } from "@/components/dashboard/ui";
import { IconExternalLink, IconX } from "@/components/icons";
import { PulseDot } from "@/components/PulseBrand";
import { JobDetails } from "./JobDetails";
import { initials, SwipeDeck } from "./SwipeDeck";

type Job = JobPick;
type TrackFilter = "Internship" | "New Grad" | "all";
type Mark = JobPickMark;

const PAGE = 40;
const COLS = "id,company,title,location,remote,url,track,tech,posted_at";

/** "Last refresh" reads better with a time when the refresh was today
 * or yesterday: "today at 2:35 pm", "yesterday at 10:17 pm", instead
 * of a bare "today" or "1d ago". The timestamp is already in
 * meta.refreshed, so no new data source is needed. */
export function refreshLabel(iso: string | null) {
  if (!iso) return "";
  const days = calendarDaysBetween(new Date(iso), new Date());
  if (days > 1) return ago(iso);
  const time = new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).toLowerCase();
  return days <= 0 ? `today at ${time}` : `yesterday at ${time}`;
}

export function JobsBoard({ userId }: { userId: string | null }) {
  const supabase = useMemo(() => (isConfigured() ? createClient() : null), []);
  const [track, setTrack] = useState<TrackFilter>("Internship");
  const [techOnly, setTechOnly] = useState(true);
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [saved, setSaved] = useState<Record<string, Job>>({});
  const [history, setHistory] = useState<{ job: Job; prev: Mark | undefined }[]>([]);
  const [view, setView] = useState<"swipe" | "list" | "saved">("swipe");
  // A saved job whose title is expanded in place, so the full title is
  // readable without leaving the Saved tab.
  const [expandedSavedTitle, setExpandedSavedTitle] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ companies: number; refreshed: string | null }>({ companies: 0, refreshed: null });
  const [leadKeys, setLeadKeys] = useState<ReadonlySet<string>>(new Set());
  // which of these jobs are already in the user's tracker (company + role)
  const [trackedApps, setTrackedApps] = useState<Pick<Application, "company" | "role">[]>([]);
  // a tap already in flight for this job, so a double-tap cannot insert twice:
  // the marks state only updates after the insert below resolves
  const applying = useRef(new Set<string>());
  const trackedKeys = useMemo(() => new Set(trackedApps.map((a) => leadKey(a))), [trackedApps]);
  const { toast, toastNode } = useToast();
  // The list row a visitor tapped to jump back to in the deck.
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  // Details panel: always synced to the front card on desktop; on phones
  // it stays hidden until the deck's Details button opens it.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsRef = useRef<HTMLElement | null>(null);

  // which of these jobs are already in the user's leads pipeline
  useEffect(() => {
    if (!supabase || !userId) return;
    let alive = true;
    accountPipelineStore(supabase, userId)
      .loadLeads()
      .then((leads) => {
        if (alive) setLeadKeys(new Set(leads.map(leadKey)));
      })
      .catch(() => undefined); // leads are a bonus here; the board works without them
    return () => { alive = false; };
  }, [supabase, userId]);

  // which of these jobs are already in the user's tracker, so "I applied"
  // never offers to track the same application twice
  useEffect(() => {
    if (!supabase || !userId) return;
    let alive = true;
    accountStore(supabase, userId)
      .load()
      .then(({ apps }) => {
        if (alive) setTrackedApps(apps);
      })
      .catch(() => undefined); // the board works without it; setMark re-checks fresh
    return () => { alive = false; };
  }, [supabase, userId]);

  /** Saves a board job into the user's leads pipeline (their decision list — never an application). Silent when a save action already toasts its own word. */
  async function saveLead(job: Job, silent = false) {
    if (!supabase || !userId) return;
    const key = leadKey({ company: job.company, role: job.title });
    if (leadKeys.has(key)) {
      if (!silent) toast(`${job.company} is already in your leads`);
      return;
    }
    try {
      await accountPipelineStore(supabase, userId).createLead({
        company: job.company,
        role: job.title,
        track: (TRACKS as readonly string[]).includes(job.track) ? (job.track as Track) : "Other",
        location: job.location,
        pay: "",
        url: job.url,
        source: "Job board",
        status: "New",
        fit_note: "",
        date_found: todayISO(),
      });
      setLeadKeys((prev) => new Set(prev).add(key));
      if (!silent) toast(`Saved ${job.company} to your Leads`);
    } catch {
      if (!silent) toast("Couldn't save that lead. Try again.", "error");
    }
  }

  // debounce the search box
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    Promise.all([
      supabase.from("job_boards").select("slug", { count: "exact", head: true }).eq("active", true),
      supabase.from("job_refresh_runs").select("finished_at").not("finished_at", "is", null).order("id", { ascending: false }).limit(1).maybeSingle(),
    ]).then(([b, r]) => {
      if (alive) setMeta({ companies: b.count ?? 0, refreshed: (r.data as { finished_at: string } | null)?.finished_at ?? null });
    });
    if (userId) {
      supabase.from("saved_jobs").select(`job_id,state,jobs(${COLS})`).eq("user_id", userId).then(({ data }) => {
        if (!alive || !data) return;
        const rows = data as unknown as { job_id: string; state: Mark; jobs: Job | null }[];
        setMarks(Object.fromEntries(rows.map((d) => [d.job_id, d.state])));
        setSaved(Object.fromEntries(rows.filter((d) => d.state === "saved" && d.jobs).map((d) => [d.job_id, d.jobs!])));
      });
    } else {
      Promise.resolve().then(() => {
        if (!alive) return;
        const local = readJobPicks();
        setMarks(local.marks);
        setSaved(local.saved);
      });
    }
    Promise.resolve().then(() => {
      try { if (alive && localStorage.getItem("pf_jobs_view") === "list") setView("list"); } catch {}
    });
    return () => { alive = false; };
  }, [supabase, userId]);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    let req = supabase.from("jobs").select(COLS, { count: "exact" }).eq("active", true);
    if (track !== "all") req = req.eq("track", track);
    if (techOnly) req = req.eq("tech", true);
    if (remoteOnly) req = req.eq("remote", true);
    if (query) {
      const safe = query.replace(/[%_,()*]/g, " ").slice(0, 60);
      req = req.or(`title.ilike.%${safe}%,company.ilike.%${safe}%,location.ilike.%${safe}%`);
    }
    // A hung query used to leave the board on skeletons forever, and a
    // failed query had no catch at all, so it never even reached the error
    // line. After 15s the timeout rejects, any failure lands on the error
    // line, and "Try again" re-runs this same query with a fresh timer.
    withLoadTimeout(
      req.order("posted_at", { ascending: false, nullsFirst: false }).range(page * PAGE, page * PAGE + PAGE - 1),
      LOAD_TIMEOUT_MS,
      "Openings are taking longer than usual to load. Check your connection and try again.",
    )
      .then(({ data, count, error }) => {
        if (!alive) return;
        if (error) { setState("error"); return; }
        setJobs((prev) => (page === 0 ? (data as Job[]) : [...prev, ...(data as Job[])]));
        setTotal(count ?? null);
        setState("ready");
      })
      .catch(() => {
        if (alive) setState("error");
      });
    return () => { alive = false; };
  }, [supabase, track, techOnly, remoteOnly, query, page, attempt]);

  const retry = () => {
    setState("loading");
    setAttempt((n) => n + 1);
  };

  /** Clears the search box and every filter, so an empty result set
   * recovers to the full feed instead of re-reviewing the same empty
   * filter. The feed refetches from the effect on track / techOnly /
   * remoteOnly / query, and the debounced query follows the cleared box. */
  function clearFilters() {
    setPage(0);
    setState("loading");
    setQ("");
    setTrack("all");
    setTechOnly(false);
    setRemoteOnly(false);
  }

  // any filter change starts from page 0
  const resetTo = <T,>(set: (v: T) => void) => (v: T) => { setPage(0); setState("loading"); set(v); };

  /** Sets (or clears, with null) what the user decided about a job. Returns false if it didn't stick. */
  async function setMark(job: Job, next: Mark | null): Promise<boolean> {
    const nextMarks = { ...marks };
    const nextSaved = { ...saved };
    if (next) nextMarks[job.id] = next; else delete nextMarks[job.id];
    if (next === "saved") nextSaved[job.id] = job; else delete nextSaved[job.id];

    if (!userId) {
      if (next === "applied") return false;
      writeJobPicks(nextMarks, nextSaved);
    } else if (supabase) {
      if (next === "applied") {
        const key = leadKey({ company: job.company, role: job.title });
        // A second tap while the first is still in flight would insert
        // twice: the marks state only updates after the await below.
        if (applying.current.has(key)) return false;
        if (isAlreadyTracked(trackedApps, { company: job.company, role: job.title })) {
          toast(`${job.company} is already in your tracker.`, "error");
          return false;
        }
        applying.current.add(key);
        try {
          // The tracker can gain an application after this page loaded (the
          // agent syncs in the background), so re-check fresh before
          // inserting. A failed re-check falls through: the insert itself
          // would fail too if the connection is down, and blocking the tap
          // on a failed read would be worse than the duplicate it guards.
          let fresh = trackedApps;
          try {
            fresh = (await accountStore(supabase, userId).load()).apps;
            setTrackedApps(fresh);
          } catch {
            // Fall through with the loaded set.
          }
          if (isAlreadyTracked(fresh, { company: job.company, role: job.title })) {
            toast(`${job.company} is already in your tracker.`, "error");
            return false;
          }
          const { error } = await supabase.from("saved_jobs").upsert({ user_id: userId, job_id: job.id, state: next });
          if (error) { toast("Couldn't save that. Try again.", "error"); return false; }
          const today = todayISO();
          const { error: appErr } = await supabase.from("applications").insert({
            user_id: userId, company: job.company, role: job.title,
            track: job.track === "Internship" || job.track === "New Grad" ? job.track : "Full-Time",
            status: "Applied", date_applied: today, last_contact: today, link: job.url,
            latest_update: "Applied through the posting",
          });
          if (appErr) toast("Saved, but couldn't add it to your tracker.", "error");
          else {
            toast(`Added ${job.company} to your tracker`);
            setTrackedApps((prev) => [...prev, { company: job.company, role: job.title }]);
          }
        } finally {
          applying.current.delete(key);
        }
      } else {
        const { error } = next
          ? await supabase.from("saved_jobs").upsert({ user_id: userId, job_id: job.id, state: next })
          : await supabase.from("saved_jobs").delete().eq("user_id", userId).eq("job_id", job.id);
        if (error) { toast("Couldn't save that. Try again.", "error"); return false; }
      }
    }
    setMarks(nextMarks);
    setSaved(nextSaved);
    return true;
  }

  async function mark(job: Job, next: Mark) {
    if (await setMark(job, next)) {
      // A save is a shortlist, and a shortlist belongs in leads without
      // a second manual step (the demo path lands there through the
      // local picks the demo leads page reads).
      if (next === "saved") await saveLead(job, true);
      if (next !== "applied") toast(next === "saved" ? "Saved" : "Hidden");
    }
  }

  async function swipe(job: Job, choice: "saved" | "hidden") {
    const prev = marks[job.id];
    if (await setMark(job, choice)) {
      if (choice === "saved") await saveLead(job, true);
      setHistory((h) => [...h.slice(-30), { job, prev }]);
      setPinnedId((p) => (p === job.id ? null : p));
      toast(choice === "saved" ? "Saved" : "Hidden");
    }
  }

  async function undo() {
    const last = history[history.length - 1];
    if (!last) return;
    if (await setMark(last.job, last.prev ?? null)) {
      setHistory((h) => h.slice(0, -1));
      toast("Undone");
    }
  }

  async function removeSaved(job: Job) {
    if (await setMark(job, null)) toast("Removed");
  }

  /** Re-reviews the passed jobs in this view: clears the hidden marks, keeps saves.
   * One batched update, not a setMark loop: each setMark rebuilds from the
   * marks captured at render time, so a loop would re-hide the jobs the
   * earlier calls had just cleared. */
  async function reviewAgain() {
    const hidden = jobs.filter((j) => marks[j.id] === "hidden");
    const nextMarks = { ...marks };
    for (const j of hidden) delete nextMarks[j.id];
    if (userId && supabase && hidden.length) {
      const results = await Promise.all(
        hidden.map((j) => supabase.from("saved_jobs").delete().eq("user_id", userId).eq("job_id", j.id)),
      );
      if (results.some((r) => r.error)) {
        toast("Couldn't reset that. Try again.", "error");
        return;
      }
    } else if (!userId) {
      writeJobPicks(nextMarks, saved);
    }
    setMarks(nextMarks);
    setHistory([]);
    setPinnedId(null);
    toast("Back to the start");
  }

  /** A list or saved row jumps to that job in the deck (saved rows open the Saved tab instead). */
  function jumpToJob(job: Job) {
    if (marks[job.id] === "saved") {
      setView("saved");
      return;
    }
    setPinnedId(job.id);
    setView("swipe");
  }

  /** Opens the details panel for the front card and scrolls it into view.
     * On phones the panel is hidden until this opens it; on desktop it is
     * already beside the deck, so the scroll is the visible response — the
     * old mobile-only gate left the button a no-op on desktop. */
    function openDetails() {
      setDetailsOpen(true);
    if (typeof window !== "undefined") {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() =>
    detailsRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }),
    );
    }
    }

  function changeView(v: "swipe" | "list" | "saved") {
    setView(v);
    try { localStorage.setItem("pf_jobs_view", v); } catch {}
  }

  const baseQueue = jobs.filter((j) => !marks[j.id]);
  const queue = pinnedId
    ? [...baseQueue.filter((j) => j.id === pinnedId), ...baseQueue.filter((j) => j.id !== pinnedId)]
    : baseQueue;
  const topJob = queue[0] ?? null;
  const savedList = Object.values(saved).filter((j) => marks[j.id] === "saved");
  const moreAvailable = total !== null && jobs.length < total;
  // Reviewed counts every decision made, not just the ones on the loaded
  // page, and the percentage is against the whole feed (total), so
  // reviewed + left to review = total. The "left" number below is the
    // same derivation, not the loaded page's arithmetic: the old line
    // subtracted the marks on the loaded page from the total, so a mark
    // on a job outside the loaded page (another filter, a later page, a
    // stale id) made the swipe line and the progress bar disagree — the
    // swipe view said 2 reviewed while the other views' numbers read 1.
  const reviewed = Object.keys(marks).length;
    const leftToReview = total === null ? null : Math.max(0, total - reviewed);
  const progressPct = total === null || total === 0 ? 0 : Math.min(100, Math.round((reviewed / total) * 100));

  // keep the deck stocked: fetch the next page when only a few cards are left
  useEffect(() => {
    if (view === "swipe" && state === "ready" && moreAvailable && queue.length < 6) {
      Promise.resolve().then(() => setPage((p) => p + 1));
    }
  }, [view, state, moreAvailable, queue.length, jobs.length]);

  const visible = jobs.filter((j) => marks[j.id] !== "hidden");
  const toggle = "flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-xs font-medium";

  return (
    <main className="gutter rise mx-auto flex w-full max-w-[1180px] flex-col gap-5 pb-20 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Find openings</h1>
          <p className="mt-1 max-w-[62ch] text-sm text-muted">
            Straight from the career pages of {meta.companies || "50+"} companies, refreshed every 6 hours.
            {meta.refreshed && <> Last refresh {refreshLabel(meta.refreshed)}.</>}
          </p>
        </div>
        {!userId && (
          <Link href="/login?mode=signup&next=/jobs" className={btn.primary}>Sign up to keep your picks</Link>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3 shadow-panel sm:flex-row sm:items-center">
        <input
          id="job-search"
          type="search"
          className={cx(field, "sm:max-w-xs")}
          placeholder="Search role, company or city"
          value={q}
          onChange={(e) => { setPage(0); setState("loading"); setQ(e.target.value); }}
        />
        <div className="flex flex-wrap gap-1.5">
          {(["Internship", "New Grad", "all"] as TrackFilter[]).map((t) => (
            <button
              key={t}
              aria-pressed={track === t}
              onClick={() => resetTo(setTrack)(t)}
              className={cx(
                "rounded-lg border px-3 py-1.5 font-mono text-xs transition",
                track === t ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-ink",
              )}
            >
              {t === "all" ? "All roles" : t === "Internship" ? "Internships" : "New grad"}
            </button>
          ))}
          <label className={toggle} htmlFor="tech-only">
            <input id="tech-only" type="checkbox" className="accent-[var(--accent)]" checked={techOnly} onChange={(e) => resetTo(setTechOnly)(e.target.checked)} />
            Tech only
          </label>
          <label className={toggle} htmlFor="remote-only">
            <input id="remote-only" type="checkbox" className="accent-[var(--accent)]" checked={remoteOnly} onChange={(e) => resetTo(setRemoteOnly)(e.target.checked)} />
            Remote
          </label>
        </div>
        <div className="flex items-center gap-3 sm:ml-auto">
          <p className="tnum font-mono text-xs text-faint">{total === null ? "…" : `${total.toLocaleString()} open`}</p>
        </div>
      </div>

      {/* Swipe / List / Saved tabs, centred on the deck column. */}
      <div className="mx-auto flex w-full max-w-[430px] flex-col items-center gap-2">
        <div className="flex w-full rounded-full border border-line p-0.5" role="tablist" aria-label="View">
          {(["swipe", "list", "saved"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => changeView(v)}
              className={cx("flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition", view === v ? "bg-accent text-accent-ink" : "text-muted hover:text-ink")}>
              {v === "swipe" ? "Swipe" : v === "list" ? "List" : `Saved (${savedList.length})`}
            </button>
          ))}
        </div>
        <div className="h-[5px] w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100} aria-label="Reviewed so far">
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${progressPct}%` }} />
        </div>
        {/* The count in words, next to the bar, so every view reads the
          same numbers: the bar alone only carries a percentage (2 of
          266 rounds to 1%), and the swipe view used to be the only
          place the count appeared at all. The parenthetical says what
          counts as reviewed, since a bare number left visitors
          guessing whether a save, a pass, or just looking counted. */}
          {total !== null && (
          <p className="font-mono text-[11px] text-faint">
            {total === 0 ? "0 openings match" : <>{reviewed} reviewed (saved, hidden or applied) · {leftToReview} left of {total}</>}
          </p>

        )}
      </div>

      {!supabase ? (
        <p className="text-sm text-muted">Job search isn&apos;t connected on this copy of Pulse Find.</p>
      ) : state === "error" ? (
        <div className="rounded-xl bg-danger-soft px-4 py-3">
          <p className="text-sm text-danger">Couldn&apos;t load openings.</p>
          <button className={cx(btn.primary, "mt-3")} onClick={retry}>Try again</button>
        </div>
      ) : state === "loading" && page === 0 ? (
        <ul className="flex flex-col gap-2" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => <li key={i} className="h-[74px] animate-pulse rounded-xl border border-line bg-surface" />)}
        </ul>
      ) : view === "swipe" ? (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,430px)_minmax(0,336px)] lg:justify-center" data-tour="jobs">
          <div>
            {/* The pulsing dot is the same live-status mark as the
              "Waiting on you" panel header: it only shows while there
              are jobs left to review. */}
            <p className="mb-3 flex items-center justify-center gap-2 text-center font-mono text-xs text-faint">
              {queue.length ? <PulseDot /> : null}
              {queue.length ? <><b className="text-accent">{leftToReview ?? queue.length}</b> left to review</> : " "}
            </p>
            <SwipeDeck
              queue={queue}
              loading={state === "loading"}
              onDecide={swipe}
              onUndo={undo}
              canUndo={history.length > 0}
              emptyText={jobs.length ? "You've reviewed everything that matches. Change a filter for more." : "No openings match. Try turning off a filter."}
              emptyTitle={jobs.length === 0 ? "No openings match" : undefined}
              onClearFilters={jobs.length === 0 ? clearFilters : undefined}
              onDetails={openDetails}
              onReviewAgain={reviewAgain}
              canReviewAgain={reviewed > 0}
            />
          </div>
          {topJob && (
            <section ref={detailsRef} className={cx("rounded-2xl border border-line bg-surface p-4 shadow-panel sm:p-5", !detailsOpen && "hidden lg:block")}>
              <JobDetails job={topJob} onClose={() => setDetailsOpen(false)} />
            </section>
          )}
        </div>
      ) : view === "saved" ? (
        // The saved list uses the full main width, not the 430px deck
        // column: at desktop width a 400px column truncated every title
        // and location. The swipe deck itself stays 430px, and the list
        // stays single-column on phones.
        <div className="flex w-full flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-[15px] font-bold tracking-tight">Saved, ready to apply</h2>
              <p className="mt-0.5 text-xs text-muted">
                Swipe right to add roles here. {userId ? "Mark one applied and it goes straight into your tracker." : "Saved in this browser only."}
              </p>
            </div>
            {savedList.length > 0 && <span className="pf-badge">{savedList.length} saved</span>}
          </div>
          {!userId && (
            <Link href="/login?mode=signup&next=/jobs" className={cx(btn.secondary, "w-full")}>Sign up to keep your picks and track applications</Link>
          )}
          {savedList.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">Nothing saved yet. Swipe right on a role to keep it here.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {savedList.map((j) => (
                <li key={j.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3" onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button")) jumpToJob(j); }}>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-sm font-bold text-accent" aria-hidden="true">
                    {initials(j.company)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <SavedJobTitle
                      title={j.title}
                      expanded={expandedSavedTitle === j.id}
                      onToggle={() => setExpandedSavedTitle(expandedSavedTitle === j.id ? null : j.id)}
                    />
                    <p className="truncate text-xs text-muted" title={`${j.company} · ${j.location || "Location not listed"}`}>{j.company} · {j.location || "Location not listed"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {j.url ? (
                      <a href={j.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink transition hover:opacity-90">View posting <IconExternalLink className="h-3 w-3 shrink-0" /></a>
                    ) : null}
                    {userId && (trackedKeys.has(leadKey({ company: j.company, role: j.title })) ? (
                      <Tag tone="muted">In tracker</Tag>
                    ) : (
                      <button className={btn.ghost} onClick={() => mark(j, "applied")}>Applied</button>
                    ))}
                    <button className={btn.ghost} aria-label={`Remove ${j.title}`} onClick={() => removeSaved(j)}>
                      <IconX className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">No openings match. Try turning off a filter.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((j) => {
            const m = marks[j.id];
            return (
              <li key={j.id} className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-surface p-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button")) jumpToJob(j); }}>
                <div className="min-w-0">
                  {j.url ? (
                    <a href={j.url} target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-accent">{j.title}</a>
                  ) : (
                    <span className="font-semibold">{j.title}</span>
                  )}
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                    <span className="font-medium text-ink">{j.company}</span>
                    {j.location && <span className="truncate" title={j.location}>· {j.location}</span>}
                    {j.remote && <Tag tone="tech">Remote</Tag>}
                    {j.posted_at && <span className="tnum font-mono text-xs text-faint">{ago(j.posted_at)}</span>}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {j.url ? (
                    <a href={j.url} target="_blank" rel="noopener noreferrer" className={btn.secondary}>Open posting <IconExternalLink className="h-3.5 w-3.5 shrink-0" /></a>
                  ) : null}
                  {userId ? (
                    m === "applied" || trackedKeys.has(leadKey({ company: j.company, role: j.title })) ? (
                      <Tag tone="muted">In tracker</Tag>
                    ) : (
                      <>
                        <button className={btn.ghost} onClick={() => mark(j, "saved")} disabled={m === "saved"}>{m === "saved" ? "Saved" : "Save"}</button>
                        <button className={btn.ghost} onClick={() => saveLead(j)}>Lead</button>
                        <button className={btn.ghost} onClick={() => mark(j, "applied")}>I applied</button>
                        <button className={btn.ghost} onClick={() => mark(j, "hidden")} aria-label={`Hide ${j.title}`}>Hide</button>
                      </>
                    )
                  ) : (
                    // Signed-out visitors can already save and pass from
                        // the deck (their picks live in this browser only),
                        // but the list rows offered nothing at all, so the
                        // List tab was a dead end for saving. Save and Hide
                    // take the same local path as the deck; Lead and
                    // I applied stay signed-in only, since they write
                    // to the account's pipeline and tracker.
                    <>
                      <button className={btn.ghost} onClick={() => mark(j, "saved")} disabled={m === "saved"}>{m === "saved" ? "Saved" : "Save"}</button>
                      <button className={btn.ghost} onClick={() => mark(j, "hidden")} aria-label={`Hide ${j.title}`}>Hide</button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {view === "list" && total !== null && jobs.length < total && state !== "error" && (
        <button className={cx(btn.secondary, "self-center")} onClick={() => setPage((p) => p + 1)} disabled={state === "loading"}>
          Show more
        </button>
      )}
      <p className="text-xs text-faint">
        Listings link to each company&apos;s own career page. Pulse Find doesn&apos;t host or edit postings.
      </p>
      {toastNode}
    </main>
  );
}

const SAVED_TITLE_LIMIT = 40;

/** A saved job's title truncates in the narrow row, so the full title
 * carries a hover tooltip and long titles get the same Show more toggle
 * the sheet's TruncatedCellText uses, past the same 40 characters. The
 * toggle stops the click, so it never jumps to the job in the deck. The
 * forty-character limit is only a fallback, as in the sheet: a shorter
 * title can still truncate once the View posting button takes its
 * space ("2027 Mission Operations Engineer" is 32 characters and
 * already ellipsised), so the toggle also appears whenever the rendered
 * title actually overflows (scrollWidth past clientWidth, re-measured
 * on resize). */
export function SavedJobTitle({ title, expanded, onToggle }: { title: string; expanded: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const long = title.length > SAVED_TITLE_LIMIT;
  useEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [title, expanded]);
  // Expanded titles keep their Show less button; collapsed titles get
  // one when long or actually overflowing. In a server render there is
  // no layout to measure, so only the long rule applies there.
  const showToggle = expanded || long || overflowing;
  return (
    <>
      <p ref={ref} className={cx("text-sm font-semibold", expanded ? "whitespace-normal break-words" : "truncate")} title={title}>
        {title}
      </p>
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
