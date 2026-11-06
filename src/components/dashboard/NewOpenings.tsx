"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Panel, btn } from "./ui";

type Job = { id: string; company: string; title: string; location: string; url: string; posted_at: string | null };

function ago(iso: string | null) {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "1d ago" : `${days}d ago`;
}

/** The newest tech internships from the job board, right on the dashboard. */
export function NewOpenings() {
  const db = useMemo(() => createClient(), []);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    db.from("jobs")
      .select("id,company,title,location,url,posted_at", { count: "exact" })
      .eq("active", true)
      .eq("track", "Internship")
      .eq("tech", true)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(5)
      .then(({ data, count }) => {
        if (!live) return;
        setJobs((data ?? []) as Job[]);
        setTotal(count ?? null);
      });
    return () => { live = false; };
  }, [db]);

  if (jobs && jobs.length === 0) return null;

  return (
    <Panel
      title="New tech internships"
      hint="Fresh from company career pages, refreshed every 6 hours."
      action={<Link href="/jobs" className={btn.secondary}>{total ? `See all ${total}` : "Find jobs"}</Link>}
    >
      {!jobs ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-surface-2" />)}</div>
      ) : (
        <ul className="divide-y divide-line">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{j.title}</p>
                <p className="truncate text-xs text-muted">
                  {j.company} · {j.location || "Location not listed"} {j.posted_at && <span className="text-faint">· {ago(j.posted_at)}</span>}
                </p>
              </div>
              <a href={j.url} target="_blank" rel="noopener noreferrer" className={btn.ghost}>Open</a>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
