"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isConfigured } from "@/lib/env";
import { todayISO } from "@/lib/metrics";
import { Tag, btn, cx, field, useToast } from "@/components/dashboard/ui";

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
  const [marks, setMarks] = useState<Record<string, "saved" | "applied" | "hidden">>({});
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
      supabase.from("saved_jobs").select("job_id,state").then(({ data }) => {
        if (alive && data) setMarks(Object.fromEntries(data.map((d) => [d.job_id, d.state])));
      });
    }
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

  async function mark(job: Job, next: "saved" | "applied" | "hidden") {
    if (!supabase || !userId) return;
    const { error } = await supabase.from("saved_jobs").upsert({ user_id: userId, job_id: job.id, state: next });
    if (error) return toast("Couldn't save that. Try again.", "error");
    if (next === "applied") {
      const today = todayISO();
      const { error: appErr } = await supabase.from("applications").insert({
        user_id: userId, company: job.company, role: job.title,
        track: job.track === "Internship" || job.track === "New Grad" ? job.track : "Full-Time",
        status: "Applied", date_applied: today, last_contact: today, link: job.url,
        latest_update: "Applied through the posting",
      });
      if (appErr) return toast("Saved, but couldn't add it to your tracker.", "error");
      toast(`Added ${job.company} to your tracker`);
    } else toast(next === "saved" ? "Saved" : "Hidden");
    setMarks((m) => ({ ...m, [job.id]: next }));
  }

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
        <p className="tnum font-mono text-xs text-faint sm:ml-auto">{total === null ? "…" : `${total.toLocaleString()} open`}</p>
      </div>

      {!supabase ? (
        <p className="text-sm text-muted">Job search isn&apos;t connected on this copy of Pulse Find.</p>
      ) : state === "error" ? (
        <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">Couldn&apos;t load openings. Reload the page to try again.</p>
      ) : state === "loading" && page === 0 ? (
        <ul className="flex flex-col gap-2" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => <li key={i} className="h-[74px] animate-pulse rounded-xl border border-line bg-surface" />)}
        </ul>
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

      {total !== null && jobs.length < total && state !== "error" && (
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
