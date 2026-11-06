"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isConfigured } from "@/lib/env";
import { todayISO } from "@/lib/metrics";
import { Tag, btn, cx, field, useToast } from "@/components/dashboard/ui";
import { SwipeDeck } from "./SwipeDeck";

type Job = {
  id: string;
  company: string;
  title: string;
  location: string;
  remote: boolean;
  url: string;
  track: string;
  tech: boolean;
  posted_at: string | null;
};
type TrackFilter = "Internship" | "New Grad" | "all";
type Mark = "saved" | "applied" | "hidden";

// Signed-out visitors can still swipe; their picks live in this browser only.
const LOCAL_KEY = "pf_job_picks_v1";
function readLocal(): { marks: Record<string, Mark>; saved: Record<string, Job> } {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "null");
    if (v && typeof v === "object" && v.marks && v.saved) return v;
  } catch {}
  return { marks: {}, saved: {} };
}
function writeLocal(marks: Record<string, Mark>, saved: Record<string, Job>) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ marks, saved })); } catch {}
}

const PAGE = 40;
const COLS = "id,company,title,location,remote,url,track,tech,posted_at";

function ago(iso: string | null) {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
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
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [saved, setSaved] = useState<Record<string, Job>>({});
  const [history, setHistory] = useState<{ job: Job; prev: Mark | undefined }[]>([]);
  const [view, setView] = useState<"swipe" | "list">("swipe");
  const [meta, setMeta] = useState<{ companies: number; refreshed: string | null }>({ companies: 0, refreshed: null });
  const { toast, toastNode } = useToast();

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
      supabase.from("saved_jobs").select(`job_id,state,jobs(${COLS})`).then(({ data }) => {
        if (!alive || !data) return;
        const rows = data as unknown as { job_id: string; state: Mark; jobs: Job | null }[];
        setMarks(Object.fromEntries(rows.map((d) => [d.job_id, d.state])));
        setSaved(Object.fromEntries(rows.filter((d) => d.state === "saved" && d.jobs).map((d) => [d.job_id, d.jobs!])));
      });
    } else {
      Promise.resolve().then(() => {
        if (!alive) return;
        const local = readLocal();
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
    req
      .order("posted_at", { ascending: false, nullsFirst: false })
      .range(page * PAGE, page * PAGE + PAGE - 1)
      .then(({ data, count, error }) => {
        if (!alive) return;
        if (error) { setState("error"); return; }
        setJobs((prev) => (page === 0 ? (data as Job[]) : [...prev, ...(data as Job[])]));
        setTotal(count ?? null);
        setState("ready");
      });
    return () => { alive = false; };
  }, [supabase, track, techOnly, remoteOnly, query, page]);

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
      writeLocal(nextMarks, nextSaved);
    } else if (supabase) {
      const { error } = next
        ? await supabase.from("saved_jobs").upsert({ user_id: userId, job_id: job.id, state: next })
        : await supabase.from("saved_jobs").delete().eq("user_id", userId).eq("job_id", job.id);
      if (error) { toast("Couldn't save that. Try again.", "error"); return false; }
      if (next === "applied") {
        const today = todayISO();
        const { error: appErr } = await supabase.from("applications").insert({
          user_id: userId, company: job.company, role: job.title,
          track: job.track === "Internship" || job.track === "New Grad" ? job.track : "Full-Time",
          status: "Applied", date_applied: today, last_contact: today, link: job.url,
          latest_update: "Applied through the posting",
        });
        if (appErr) toast("Saved, but couldn't add it to your tracker.", "error");
        else toast(`Added ${job.company} to your tracker`);
      }
    }
    setMarks(nextMarks);
    setSaved(nextSaved);
    return true;
  }

  async function mark(job: Job, next: Mark) {
    if (await setMark(job, next)) {
      if (next !== "applied") toast(next === "saved" ? "Saved" : "Hidden");
    }
  }

  async function swipe(job: Job, choice: "saved" | "hidden") {
    const prev = marks[job.id];
    if (await setMark(job, choice)) setHistory((h) => [...h.slice(-30), { job, prev }]);
  }

  async function undo() {
    const last = history[history.length - 1];
    if (!last) return;
    if (await setMark(last.job, last.prev ?? null)) setHistory((h) => h.slice(0, -1));
  }

  function changeView(v: "swipe" | "list") {
    setView(v);
    try { localStorage.setItem("pf_jobs_view", v); } catch {}
  }

  const queue = jobs.filter((j) => !marks[j.id]);
  const savedList = Object.values(saved).filter((j) => marks[j.id] === "saved");
  const moreAvailable = total !== null && jobs.length < total;

  // keep the deck stocked: fetch the next page when only a few cards are left
  useEffect(() => {
    if (view === "swipe" && state === "ready" && moreAvailable && queue.length < 6) {
      Promise.resolve().then(() => setPage((p) => p + 1));
    }
  }, [view, state, moreAvailable, queue.length, jobs.length]);

  const visible = jobs.filter((j) => marks[j.id] !== "hidden");
  const toggle = "flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs font-medium";

  return (
    <main className="gutter mx-auto flex w-full max-w-[1180px] flex-col gap-5 pb-20 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Find openings</h1>
          <p className="mt-1 max-w-[62ch] text-sm text-muted">
            Straight from the career pages of {meta.companies || "50+"} companies, refreshed every 6 hours.
            {meta.refreshed && <> Last refresh {ago(meta.refreshed)}.</>}
          </p>
        </div>
        {!userId && (
          <Link href="/login?mode=signup&next=/jobs" className={btn.primary}>Sign up to save jobs</Link>
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
                "rounded-full border px-3 py-1.5 font-mono text-xs transition",
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
          <div className="flex rounded-full border border-line p-0.5" role="tablist" aria-label="View">
            {(["swipe", "list"] as const).map((v) => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => changeView(v)}
                className={cx("rounded-full px-3 py-1 text-xs font-semibold transition", view === v ? "bg-accent text-accent-ink" : "text-muted hover:text-ink")}>
                {v === "swipe" ? "Swipe" : "List"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!supabase ? (
        <p className="text-sm text-muted">Job search isn&apos;t connected on this copy of Pulse Find.</p>
      ) : state === "error" ? (
        <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">Couldn&apos;t load openings. Reload the page to try again.</p>
      ) : state === "loading" && page === 0 ? (
        <ul className="flex flex-col gap-2" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => <li key={i} className="h-[74px] animate-pulse rounded-xl border border-line bg-surface" />)}
        </ul>
      ) : view === "swipe" ? (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <p className="mb-3 text-center font-mono text-xs text-faint">
              {queue.length ? <><b className="text-accent">{moreAvailable ? (total ?? 0) - (jobs.length - queue.length) : queue.length}</b> left to review</> : " "}
            </p>
            <SwipeDeck
              queue={queue}
              loading={state === "loading"}
              onDecide={swipe}
              onUndo={undo}
              canUndo={history.length > 0}
              emptyText={jobs.length ? "You've reviewed everything that matches. Change a filter for more." : "No openings match. Try turning off a filter."}
            />
          </div>
          <section className="rounded-2xl border border-line bg-surface p-4 shadow-panel sm:p-5">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h2 className="font-display text-[15px] font-bold tracking-tight">Saved, ready to apply</h2>
                <p className="mt-0.5 text-xs text-muted">
                  Swipe right to add roles here. {userId ? "Mark one applied and it goes straight into your tracker." : "Saved in this browser only."}
                </p>
              </div>
              {savedList.length > 0 && <Tag tone="muted">{savedList.length}</Tag>}
            </div>
            {!userId && (
              <Link href="/login?mode=signup&next=/jobs" className={cx(btn.secondary, "mb-3 w-full")}>Sign up to keep your picks and track applications</Link>
            )}
            {savedList.length === 0 ? (
              <p className="py-6 text-center text-sm text-faint">Nothing saved yet.</p>
            ) : (
              <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
                {savedList.map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{j.title}</p>
                      <p className="truncate text-xs text-muted">{j.company} · {j.location || "Location not listed"}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <a href={j.url} target="_blank" rel="noopener noreferrer" className={btn.ghost}>Open</a>
                      {userId && <button className={btn.ghost} onClick={() => mark(j, "applied")}>Applied</button>}
                      <button className={btn.ghost} aria-label={`Remove ${j.title}`} onClick={() => setMark(j, null)}>✕</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">No openings match. Try turning off a filter.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((j) => {
            const m = marks[j.id];
            return (
              <li key={j.id} className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-surface p-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <a href={j.url} target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-accent">{j.title}</a>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                    <span className="font-medium text-ink">{j.company}</span>
                    {j.location && <span className="truncate">· {j.location}</span>}
                    {j.remote && <Tag tone="tech">Remote</Tag>}
                    {j.posted_at && <span className="tnum font-mono text-xs text-faint">{ago(j.posted_at)}</span>}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <a href={j.url} target="_blank" rel="noopener noreferrer" className={btn.secondary}>Open posting</a>
                  {userId ? (
                    m === "applied" ? (
                      <Tag tone="muted">In tracker</Tag>
                    ) : (
                      <>
                        <button className={btn.ghost} onClick={() => mark(j, "saved")} disabled={m === "saved"}>{m === "saved" ? "Saved" : "Save"}</button>
                        <button className={btn.ghost} onClick={() => mark(j, "applied")}>I applied</button>
                        <button className={btn.ghost} onClick={() => mark(j, "hidden")} aria-label={`Hide ${j.title}`}>Hide</button>
                      </>
                    )
                  ) : null}
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
