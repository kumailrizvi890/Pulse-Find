import Link from "next/link";
import type { FunnelStep } from "@/lib/metrics";
import { Funnel } from "@/components/dashboard/Charts";
import { PulseDot } from "@/components/PulseBrand";
import { Reveal } from "./Reveal";

/**
 * The "everything in one place" section as a bento: six cells, each one
 * a mini-visual plus a headline and a single short line — no paragraphs.
 * The old CSV-import and privacy text sections are folded in here as
 * cells, so there is no pure-text section left below the hero.
 */
export function Bento({ steps }: { steps: FunnelStep[] }) {
  return (
    <section className="gutter mx-auto w-full max-w-[1180px] border-t border-line py-16">
      <Reveal>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">One account, the whole search</p>
        <h2 className="mt-2 max-w-[22ch] font-display text-3xl font-extrabold tracking-tight">
          Everything in one place, private to you
        </h2>
      </Reveal>
      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Reveal delay={0} className="min-w-0">
          <Cell>
            <div className="mb-4 min-h-[104px]">
              <Funnel steps={steps} />
            </div>
            <h3 className="font-display text-lg font-bold">Your pipeline, live</h3>
            <p className="mt-1 text-sm text-muted">Applied to hired, one view.</p>
          </Cell>
        </Reveal>
        <Reveal delay={90} className="min-w-0">
          <Cell>
            <div className="relative mb-4 flex h-[104px] items-center justify-center">
              <div className="absolute h-[84px] w-[150px] rotate-[-6deg] rounded-xl border border-line bg-surface-2" aria-hidden="true" />
              <div className="landing-swipe-nudge relative h-[84px] w-[150px] rounded-xl border border-line bg-surface p-3 shadow-panel">
                <p className="text-[13px] font-semibold">SWE Intern · Summer 2027</p>
                <p className="mt-0.5 text-xs text-muted">Copperline · Seattle</p>
                <span className="mt-2 inline-block rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-accent">
                  Saved
                </span>
              </div>
            </div>
            <h3 className="font-display text-lg font-bold">Swipe the openings</h3>
            <p className="mt-1 text-sm text-muted">Live roles, Tinder-style. Save the good ones.</p>
          </Cell>
        </Reveal>
        <Reveal delay={180} className="min-w-0">
          <Cell>
            <div className="mb-4 grid h-[104px] grid-cols-4 gap-1.5" aria-hidden="true">
              {Array.from({ length: 12 }, (_, i) => (
                <span
                  key={i}
                  className={
                    i === 2
                      ? "landing-sheet-pulse rounded-md bg-accent"
                      : i % 4 === 0
                        ? "rounded-md bg-surface-2"
                        : "rounded-md border border-line bg-surface"
                  }
                />
              ))}
            </div>
            <h3 className="font-display text-lg font-bold">Spreadsheets, in and out</h3>
            <p className="mt-1 text-sm text-muted">CSV in, color-coded Excel out. Messy dates welcome.</p>
          </Cell>
        </Reveal>
        <Reveal delay={0} className="min-w-0">
          <Cell>
            <div className="mb-4 flex h-[104px] flex-col justify-center gap-2.5 rounded-xl border border-line bg-bg p-3 font-mono text-xs">
              <span className="flex items-center gap-2 text-muted">
                <PulseDot className="shrink-0" />
                <span className="truncate">Authorization: Bearer pf_…</span>
              </span>
              <span className="text-good">✓ Roblox · OA received</span>
              <span className="text-muted">Agent connected · MCP</span>
            </div>
            <h3 className="font-display text-lg font-bold">Your agent keeps it current</h3>
            <p className="mt-1 text-sm text-muted">Claude, Cursor or Copilot, over MCP.</p>
          </Cell>
        </Reveal>
        <Reveal delay={90} className="min-w-0">
          <Cell>
            <div className="mb-4 flex h-[104px] items-center justify-center gap-3 rounded-xl border border-line bg-bg">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span className="font-mono text-xs text-muted">No ads · No trackers</span>
            </div>
            <h3 className="font-display text-lg font-bold">Private by default</h3>
            <p className="mt-1 text-sm text-muted">
              Your rows are yours. Enforced in the database.{" "}
              <Link href="/privacy" className="font-semibold text-accent underline underline-offset-2">
                Read the privacy page
              </Link>
              .
            </p>
          </Cell>
        </Reveal>
        <Reveal delay={180} className="min-w-0">
          <Cell>
            <div className="mb-4 grid h-[104px] grid-cols-3 gap-2">
              {[
                ["Applied", "22"],
                ["Interviews", "6"],
                ["Ghosted", "5"],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-col justify-center rounded-xl bg-surface-2 px-3 py-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">{k}</p>
                  <p className="tnum font-display text-xl font-bold">{v}</p>
                </div>
              ))}
            </div>
            <h3 className="font-display text-lg font-bold">Try it now</h3>
            <p className="mt-1 text-sm text-muted">
              Sample data, no sign-up.{" "}
              <Link href="/demo" className="font-semibold text-accent underline underline-offset-2">
                Open the demo
              </Link>
              .
            </p>
          </Cell>
        </Reveal>
      </div>
    </section>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return <div className="h-full rounded-[22px] border border-line bg-surface p-5 shadow-panel">{children}</div>;
}
