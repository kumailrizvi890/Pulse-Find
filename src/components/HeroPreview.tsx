import { demoApplications } from "@/lib/demo-data";
import { actionQueue, daysBetween, funnel, summarize, todayISO } from "@/lib/metrics";
import { Funnel } from "./dashboard/Charts";
import { Tag } from "./dashboard/ui";

/** A compact, real render of the dashboard using the demo data. Not a screenshot. */
export function HeroPreview() {
  const today = todayISO();
  const apps = demoApplications(today);
  const sum = summarize(apps, today, 21);
  const queue = actionQueue(apps).slice(0, 3);
  return (
    <div className="relative min-w-0 rounded-[22px] border border-line bg-surface p-4 shadow-panel sm:p-5" aria-label="Preview of the Pulse Find dashboard with sample data">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-display text-[15px] font-bold">Waiting on you</p>
        <Tag tone="danger">{sum.actions} open</Tag>
      </div>
      <ul className="divide-y divide-line">
        {queue.map((a) => {
          const d = a.action_due ? daysBetween(today, a.action_due) : null;
          return (
            <li key={a.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-danger">{a.company}</p>
                <p className="truncate text-[13px] text-muted">{a.action_needed}</p>
              </div>
              <Tag tone={d !== null && d <= 2 ? "danger" : "warn"}>{d === null ? "No date" : d <= 0 ? "Today" : `${d}d left`}</Tag>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          ["Applied", sum.total],
          ["Interviews", sum.interviews],
          ["Ghosted", sum.ghosted],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-surface-2 px-3 py-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">{k}</p>
            <p className="tnum font-display text-xl font-bold">{v}</p>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <Funnel steps={funnel(apps)} />
      </div>
      <p className="mt-3 text-[11px] text-faint">Sample data</p>
    </div>
  );
}
