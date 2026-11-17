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
  followUp,
  hasOA,
  monthly,
  parseISO,
  reachedInterview,
  todayISO,
  weekly,
  weekStart,
  type FunnelStep,
  type Summary,
} from "@/lib/metrics";
import type { Application, Contact } from "@/lib/types";
import { Funnel, WeeklyBars, WeeklyPace, type PaceDay } from "./Charts";
import { Panel, StatusPill, Tag, btn, cx, fmtDate } from "./ui";
import { NotifyBell, PulseDot, PulseHeartbeat, WaitingSignal } from "@/components/PulseBrand";

type PaceRange = "7d" | "30d" | "12m";

const AVATAR_TONES = [
  "bg-accent-soft text-accent",
  "bg-warn-soft text-warn",
  "bg-good-soft text-good",
  "bg-danger-soft text-danger",
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
 * the Application Funnel with Pace, and Networking Follow-ups in three
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
  weeklyGoal,
  ghostDays,
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
  weeklyGoal: number;
  ghostDays: number;
  onDone: (a: Application) => Promise<void>;
  onOpen: (a: Application) => void;
  onShowWaiting: () => void;
}) {
  const today = todayISO();
  const monday = weekStart(today);

  // The pace window is trailing, not the calendar week: on a Monday the
  // old Mon–Sun window was all zeros and read as broken. The segmented
  // control below switches between the last 7 days, the last 30 days, and
  // the last 12 months.
  const [range, setRange] = useState<PaceRange>("7d");
  const rangeDays = range === "7d" ? 7 : range === "30d" ? 30 : 0;

  // Days from this week's Monday to today (0 on a Monday). The trailing
  // window starts at today minus (rangeDays - 1), which is `monday` plus
  // this offset minus (rangeDays - 1) — so the memo below only depends on
  // `monday` and two numbers, never on a second date string. (React
  // Compiler refuses to preserve a memo whose window start is a second
  // today-derived date value alongside `monday`.)
  const daysSinceMonday = (parseISO(today).getDay() + 6) % 7;
  const pace = useMemo(() => {
    if (rangeDays === 0) return null;
    const start = addDays(monday, daysSinceMonday - (rangeDays - 1));
    const days: PaceDay[] = Array.from({ length: rangeDays }, (_, i) => {
      const iso = addDays(start, i);
      const date = parseISO(iso);
      return {
        label: date.toLocaleDateString(undefined, { weekday: "short" }),
        sub: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        value: apps.filter((a) => a.date_applied === iso).length,
      };
    });
    const total = days.reduce((s, d) => s + d.value, 0);
    const prevStart = addDays(start, -rangeDays);
    const prevTotal = apps.filter((a) => a.date_applied && a.date_applied >= prevStart && a.date_applied < start).length;
    const change = prevTotal === 0 ? null : Math.round(((total - prevTotal) / prevTotal) * 100);
    return { days, total, prevTotal, change };
  }, [apps, monday, daysSinceMonday, rangeDays]);

  // The last 12 weeks for the chart under the pace, drawn by WeeklyBars
  // with the weekly goal as its dashed rule.
  const weeks = useMemo(() => weekly(apps, today), [apps, today]);

  // The last 12 months for the yearly view, drawn by the same WeeklyBars
  // chart with a monthly goal line.
  const months = useMemo(() => monthly(apps, today), [apps, today]);
  const monthTotal = useMemo(() => months.reduce((s, m) => s + m.tech + m.other, 0), [months]);

  // The goal is a weekly target. The 7-day view compares one week of
  // applications against it; the 30-day view and the 12-month chart
  // compare against four weeks of it, labelled honestly as the monthly
  // target.
  const rangeGoal = range === "7d" ? weeklyGoal : weeklyGoal * 4;

  // The goal line under the daily chart (7d and 30d only — the 12-month
  // view shows its goal as the chart's dashed line instead).
  const goalRow = pace ? (
    <div className="mt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">
          {pace.total} / {rangeGoal} {range === "7d" ? "in the last 7 days" : "in the last 30 days"}
        </span>
        <span className="text-muted">
          {pace.total >= rangeGoal ? "Goal reached" : `${rangeGoal - pace.total} to go`}
        </span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-track"
        role="progressbar"
        aria-valuenow={pace.total}
        aria-valuemax={rangeGoal}
        aria-label={`${range === "7d" ? "Weekly" : "Monthly"} goal: ${pace.total} of ${rangeGoal} applications`}
      >
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${Math.min(100, Math.round((pace.total / Math.max(rangeGoal, 1)) * 100))}%` }}
        />
      </div>
    </div>
  ) : null;

  // OAs in the tracker's sense — oa_received or an OA status — not the
  // funnel's cumulative "reached an assessment" count, which also folds
  // interview-stage applications in.
  const oaList = useMemo(
    () => apps.filter(hasOA).sort((a, b) => (b.last_contact ?? "").localeCompare(a.last_contact ?? "")),
    [apps],
  );
  // Interview-stage applications, active first so the ones still moving
  // sit above the ones that went quiet.
  const interviewList = useMemo(
    () =>
      apps
        .filter(reachedInterview)
        .sort(
          (a, b) =>
            Number(followUp(a, today, ghostDays) === "ghosted") - Number(followUp(b, today, ghostDays) === "ghosted") ||
            (b.last_contact ?? "").localeCompare(a.last_contact ?? ""),
        ),
    [apps, today, ghostDays],
  );

  const hired = useMemo(() => apps.filter((a) => a.status === "Accepted").length, [apps]);
  const funnelSteps: (FunnelStep & { color?: string })[] = [
    { label: "Applied", value: steps[0]?.value ?? sum.total, color: "#f66367" },
    { label: "OA", value: steps[1]?.value ?? 0, color: "#c87b27" },
    { label: "Interview", value: steps[2]?.value ?? 0, color: "#4e874f" },
    { label: "Offer", value: steps[3]?.value ?? 0, color: "#4e874f" },
    { label: "Hired", value: hired, color: "#4e874f" },
  ];

  const response = useMemo(() => {
    const responded = apps.filter((a) => a.last_contact && a.date_applied && a.last_contact > a.date_applied);
    if (responded.length === 0) return null;
    const days = responded.map((a) => a.date_applied && a.last_contact ? daysBetween(a.date_applied, a.last_contact) : 0);
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
        <PulseHeartbeat label="Loading dashboard" />
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
    <div className="space-y-4" data-tour="dashboard">
      <div style={{ "--accent": "#f8343e" } as CSSProperties} aria-hidden="true">
        <PulseTrace className="h-6 w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Panel
          title="Waiting on you"
          hint={`Tasks needing your action — ${queue.length}`}
          className={cx("lg:col-span-3", queue.length ? "border-danger/30 pf-glow" : undefined)}
          action={
            queue.length ? (
              <span className="flex items-center gap-2.5">
                <PulseDot />
                <NotifyBell count={queue.length} overdue={sum.overdue} />
              </span>
            ) : undefined
          }
        >
          {queue.length === 0 ? (
            <>
              <p className="text-sm text-good">Nothing is waiting on you right now.</p>
              <WaitingSignal className="mt-2" />
            </>
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
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">Pace</h3>
              <div className="flex gap-1.5" role="group" aria-label="Pace range">
                {(["7d", "30d", "12m"] as PaceRange[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    aria-pressed={range === r}
                    className={cx(
                      "whitespace-nowrap rounded-lg border px-3 py-1.5 font-mono text-xs transition",
                      range === r ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-ink",
                    )}
                  >
                    {r === "7d" ? "Last 7 days" : r === "30d" ? "Last 30 days" : "Last 12 months"}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {range === "7d"
                ? "Applications per day, last 7 days"
                : range === "30d"
                  ? "Applications per day, last 30 days"
                  : "Applications per month, last 12 months"}
            </p>
            {range === "12m" ? (
              <>
                {monthTotal === 0 ? (
                  <p className="mt-3 text-sm text-muted">No applications in the last 12 months.</p>
                ) : (
                  <div className="mt-3">
                    <WeeklyBars weeks={months} goal={Math.max(rangeGoal, 1)} unit="month" />
                  </div>
                )}
                <p className="mt-3 text-xs text-muted">
                  {monthTotal} total · {(monthTotal / 12).toFixed(1)} avg / month · monthly goal {rangeGoal}
                </p>
              </>
            ) : pace === null ? null : pace.total === 0 ? (
              <>
                <p className="mt-3 text-sm text-muted">
                  {range === "7d" ? "No applications in the last 7 days" : "No applications in the last 30 days"}
                  {pace.prevTotal > 0
                    ? ` — ${pace.prevTotal} in the ${range === "7d" ? "7" : "30"} days before that.`
                    : ` — none in the ${range === "7d" ? "7" : "30"} days before that either.`}
                </p>
                {goalRow}
              </>
            ) : (
              <>
                <div className="mt-3">
                  <WeeklyPace
                    days={pace.days}
                    total={pace.total}
                    change={pace.change}
                    totalLabel={range === "7d" ? "Total in the last 7 days" : "Total in the last 30 days"}
                    prevLabel={range === "7d" ? "prior 7 days" : "prior 30 days"}
                    compact={range === "30d"}
                    ariaLabel={range === "7d" ? "Applications per day, last 7 days" : "Applications per day, last 30 days"}
                  />
                </div>
                {goalRow}
              </>
            )}
            {range !== "12m" && (
              <div className="mt-5 border-t border-line pt-4">
                <h3 className="text-sm font-semibold">Last 12 weeks</h3>
                <p className="mt-0.5 text-xs text-muted">Applications per week — the dashed line is your weekly goal</p>
                <div className="mt-3">
                  <WeeklyBars weeks={weeks} goal={Math.max(weeklyGoal, 1)} />
                </div>
              </div>
            )}
          </div>
        </Panel>
        <Panel
          title="Networking Follow-ups"
          hint="Keep your network warm"
          className="lg:col-span-3"
          action={
            <span
              className={cx(
                "rounded-md px-2 py-0.5 font-mono text-xs",
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
                          {c.next_step.trim() || `Follow up with ${c.person_name}`}
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
              {orderedContacts.length > 3 && (
                <Link href={userId ? "/app/networking" : "/demo/networking"} className={cx(btn.ghost, "mt-3")}>
                  See all {orderedContacts.length} contacts
                </Link>
              )}
            </>
          )}
        </Panel>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel title="OAs" hint={`${oaList.length} with an assessment`}>
          {oaList.length === 0 ? (
            <p className="text-sm text-muted">No assessments yet. When a company sends one, it shows up here.</p>
          ) : (
            <>
              <ul className="divide-y divide-line">
                {oaList.slice(0, 5).map((a) => (
                  <li key={a.id} className="py-2.5 first:pt-0 last:pb-0">
                    <button onClick={() => onOpen(a)} className="block w-full text-left">
                      <span className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold">{a.company}</span>
                        <StatusPill status={a.status} />
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-muted">{a.role || "Role not set"}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {oaList.length > 5 && (
                <p className="mt-3 text-xs text-muted">And {oaList.length - 5} more in the list below.</p>
              )}
            </>
          )}
        </Panel>
        <Panel title="Interviews" hint={`${interviewList.length} reached interview stage`}>
          {interviewList.length === 0 ? (
            <p className="text-sm text-muted">No interviews yet. When a company moves you forward, it shows up here.</p>
          ) : (
            <>
              <ul className="divide-y divide-line">
                {interviewList.slice(0, 6).map((a) => {
                  const ghosted = followUp(a, today, ghostDays) === "ghosted";
                  const finished = a.status === "Rejected" || a.status === "Withdrawn" || a.status === "Accepted";
                  return (
                    <li key={a.id} className="py-2.5 first:pt-0 last:pb-0">
                      <button onClick={() => onOpen(a)} className="block w-full text-left">
                        <span className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-semibold">{a.company}</span>
                          <StatusPill status={a.status} />
                          {ghosted ? (
                            <Tag tone="danger">Ghosted</Tag>
                          ) : !finished ? (
                            <span className="text-xs font-medium text-good">Active</span>
                          ) : undefined}
                        </span>
                        <span className="mt-0.5 block truncate text-sm text-muted">{a.role || "Role not set"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {interviewList.length > 6 && (
                <p className="mt-3 text-xs text-muted">And {interviewList.length - 6} more in the list below.</p>
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
        <OverviewStat label="Interviews" value={`${sum.interviews}`} sub={`${oaList.length} OAs`} />
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
