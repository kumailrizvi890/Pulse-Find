"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { PulseTrace } from "@/components/PulseTrace";
import { createClient } from "@/lib/supabase/client";
import {
  accountPipelineStore,
  demoPipelineStore,
  dueBucket,
  sortContacts,
} from "@/lib/pipeline";
import {
  addDays,
  daysBetween,
  parseISO,
  todayISO,
  weekStart,
  type FunnelStep,
  type Summary,
} from "@/lib/metrics";
import type { Application, Contact } from "@/lib/types";
import { Funnel, WeeklyPace, type PaceDay } from "./Charts";
import { Panel, Tag, btn, cx, fmtDate } from "./ui";

const AVATAR_TONES = [
  "bg-emerald-500/15 text-emerald-400",
  "bg-sky-500/15 text-sky-400",
  "bg-amber-500/15 text-amber-400",
  "bg-rose-500/15 text-rose-400",
];

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  );
}

function OverviewStat({
  label,
  value,
  sub,
  good,
}: {
  label: string;
  value: string;
  sub?: string;
  good?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xl font-bold tabular-nums">{value}</span>
        {sub && (
          <span className={cx("text-xs font-medium", good ? "text-good" : "text-muted")}>{sub}</span>
        )}
      </p>
    </div>
  );
}

/**
 * The dashboard overview from the mock: a red pulse line, then Waiting on you,
 * the Application Funnel with Weekly Pace, and Networking Follow-ups in three
 * columns, with the stats row underneath. Every number comes from the tracker
 * data passed in, so the demo keeps its sample numbers.
 */
export function Overview({
  apps,
  sum,
  queue,
  steps,
  loading,
  userId,
  onDone,
  onOpen,
  onShowWaiting,
}: {
  apps: Application[];
  sum: Summary;
  queue: Application[];
  steps: FunnelStep[];
  loading: boolean;
  userId?: string;
  onDone: (a: Application) => Promise<void>;
  onOpen: (a: Application) => void;
  onShowWaiting: () => void;
}) {
  const today = todayISO();
  const monday = weekStart(today);

  const pace = useMemo(() => {
    const days: PaceDay[] = Array.from({ length: 7 }, (_, i) => {
      const iso = addDays(monday, i);
      const date = parseISO(iso);
      return {
        label: date.toLocaleDateString(undefined, { weekday: "short" }),
        sub: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        value: apps.filter((a) => a.date_applied === iso).length,
      };
    });
    const total = days.reduce((s, d) => s + d.value, 0);
    const prevStart = addDays(monday, -7);
    const prevTotal = apps.filter((a) => a.date_applied >= prevStart && a.date_applied < monday).length;
    const change = prevTotal === 0 ? null : Math.round(((total - prevTotal) / prevTotal) * 100);
    return { days, total, change };
  }, [apps, monday]);

  const hired = useMemo(() => apps.filter((a) => a.status === "Accepted").length, [apps]);
  const funnelSteps: (FunnelStep & { color?: string })[] = [
    { label: "Applied", value: steps[0]?.value ?? sum.total, color: "#10b981" },
    { label: "Screening", value: steps[1]?.value ?? 0, color: "#10b981" },
    { label: "Interview", value: steps[2]?.value ?? 0, color: "#10b981" },
    { label: "Offer", value: steps[3]?.value ?? 0, color: "#f97316" },
    { label: "Hired", value: hired, color: "#f43f5e" },
  ];

  const response = useMemo(() => {
    const responded = apps.filter((a) => a.last_contact && a.last_contact > a.date_applied);
    if (responded.length === 0) return null;
    const days = responded.map((a) => daysBetween(a.date_applied, a.last_contact ?? a.date_applied));
    return { average: days.reduce((s, d) => s + d, 0) / days.length, count: responded.length };
  }, [apps]);

  const pipeline = useMemo(
    () => (userId ? accountPipelineStore(createClient(), userId) : demoPipelineStore(today)),
    [userId, today],
  );
  const [contacts, setContacts] = useState<Contact[]>([]);
  useEffect(() => {
    let alive = true;
    pipeline
      .loadContacts()
      .then((rows) => {
        if (alive) setContacts(rows);
      })
      .catch(() => {
        if (alive) setContacts([]);
      });
    return () => {
      alive = false;
    };
  }, [pipeline]);
  const orderedContacts = useMemo(() => sortContacts(contacts, today), [contacts, today]);
  const dueCount = orderedContacts.filter((c) => {
    const bucket = dueBucket(c, today);
    return bucket === "overdue" || bucket === "today";
  }).length;
  const shownContacts = orderedContacts.slice(0, 3);
  const shownWaiting = queue.slice(0, 3);

  if (loading) {
    return (
      <div className="space-y-4" aria-label="Loading dashboard">
        <div className="h-6 animate-pulse rounded-xl bg-surface-2" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="h-72 animate-pulse rounded-2xl bg-surface-2 lg:col-span-3" />
          <div className="h-72 animate-pulse rounded-2xl bg-surface-2 lg:col-span-6" />
          <div className="h-72 animate-pulse rounded-2xl bg-surface-2 lg:col-span-3" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-2" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div style={{ "--accent": "#f43f5e" } as CSSProperties} aria-hidden="true">
        <PulseTrace className="h-6 w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Panel
          title="Waiting on you"
          hint={`Tasks needing your action — ${queue.length}`}
          className={cx("lg:col-span-3", queue.length ? "border-danger/30" : undefined)}
          action={
            queue.length ? (
              <Tag tone="danger">
                {queue.length} open{sum.overdue ? ` · ${sum.overdue} overdue` : ""}
              </Tag>
            ) : undefined
          }
        >
          {queue.length === 0 ? (
            <p className="text-sm text-good">Nothing is waiting on you right now.</p>
          ) : (
            <ul className="divide-y divide-line">
              {shownWaiting.map((a) => {
                const d = a.action_due ? daysBetween(today, a.action_due) : null;
                const due =
                  d === null ? "No date" : d < 0 ? `Overdue ${-d}d` : d === 0 ? "Due today" : d === 1 ? "Due tomorrow" : `Due in ${d}d`;
                return (
                  <li key={a.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-sm font-semibold text-danger">
                      {a.company}
                      <span className="font-normal text-muted"> · {a.role || "Role not set"}</span>
                    </p>
                    <p className="mt-0.5 text-sm">{a.action_needed}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Tag tone={d !== null && d <= 1 ? "danger" : "warn"}>{due}</Tag>
                      <button className={btn.secondary} onClick={() => onDone(a)}>
                        Done
                      </button>
                      <button className={btn.ghost} onClick={() => onOpen(a)}>
                        Open
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {queue.length > 3 && (
            <button className={cx(btn.ghost, "mt-3")} onClick={onShowWaiting}>
              View all {queue.length} waiting items
            </button>
          )}
        </Panel>
        <Panel
          title="Application Funnel"
          hint={`Week of ${fmtDate(monday)} – ${fmtDate(addDays(monday, 6), true)}`}
          className="lg:col-span-6"
        >
          <Funnel steps={funnelSteps} />
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="text-sm font-semibold">Weekly Pace</h3>
            <p className="mt-0.5 text-xs text-muted">Applications per day</p>
            <div className="mt-3">
              <WeeklyPace days={pace.days} total={pace.total} change={pace.change} />
            </div>
          </div>
        </Panel>
        <Panel
          title="Networking Follow-ups"
          hint="Keep your network warm"
          className="lg:col-span-3"
          action={
            <span
              className={cx(
                "rounded-full px-2 py-0.5 font-mono text-xs",
                dueCount ? "bg-good-soft text-good" : "bg-surface-2 text-muted",
              )}
            >
              {dueCount} due
            </span>
          }
        >
          {orderedContacts.length === 0 ? (
            <div>
              <p className="text-sm text-muted">No networking contacts yet.</p>
              {userId ? (
                <Link href="/app/networking" className={cx(btn.secondary, "mt-3 inline-flex")}>
                  Add a person
                </Link>
              ) : (
                <p className="mt-2 text-sm text-muted">Add people on the Networking page to see follow-ups here.</p>
              )}
            </div>
          ) : (
            <>
              <ul className="space-y-3">
                {shownContacts.map((c, i) => {
                  const bucket = dueBucket(c, today);
                  const date = c.next_step_on ? fmtDate(c.next_step_on) : "";
                  const dueText =
                    bucket === "none"
                      ? "No date set"
                      : bucket === "overdue"
                        ? `Overdue · ${date}`
                        : bucket === "today"
                          ? `Today · ${date}`
                          : date;
                  const urgent = bucket === "overdue" || bucket === "today";
                  return (
                    <li key={c.id} className="flex items-start gap-3 rounded-xl border border-line p-3">
                      <span
                        className={cx(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                          AVATAR_TONES[i % AVATAR_TONES.length],
                        )}
                        aria-hidden="true"
                      >
                        {initials(c.person_name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {c.next_step || `Follow up with ${c.person_name}`}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {c.person_name}
                          {c.company ? ` · ${c.company}` : ""}
                        </p>
                        <p className={cx("mt-1 text-xs", urgent ? "font-medium text-danger" : "text-muted")}>
                          {dueText}
                        </p>
                        {userId && (
                          <Link href="/app/networking" className={cx(btn.ghost, "mt-2")}>
                            Open
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {orderedContacts.length > 3 && userId && (
                <Link href="/app/networking" className={cx(btn.ghost, "mt-3")}>
                  See all {orderedContacts.length} contacts
                </Link>
              )}
            </>
          )}
        </Panel>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OverviewStat
          label="Total Applications"
          value={`${sum.total}`}
          sub={sum.thisWeek > 0 ? `+${sum.thisWeek} this week` : undefined}
          good={sum.thisWeek > 0}
        />
        <OverviewStat label="Interviews" value={`${sum.interviews}`} sub={`${sum.oas} assessments`} />
        <OverviewStat
          label="Avg Response"
          value={response ? `${response.average.toFixed(1)}d` : "—"}
          sub={response ? `${response.count} replies` : "No replies yet"}
        />
        <OverviewStat
          label="Response Rate"
          value={`${Math.round(sum.responseRate * 100)}%`}
          sub={`${sum.rejected} rejected`}
        />
      </div>
    </div>
  );
}
