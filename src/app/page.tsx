import Link from "next/link";
import { GitHubLink, TopBar, navButton, navLink } from "@/components/TopBar";
import { SiteFooter } from "@/components/SiteFooter";
import { HeroPreview } from "@/components/HeroPreview";
import { PulseMark } from "@/components/Logo";
import { PulseDot } from "@/components/PulseBrand";
import { HeroBackdrop } from "@/components/HeroBackdrop";
import { PulseTrace } from "@/components/PulseTrace";
import { Marquee } from "@/components/landing/Marquee";
import { Showcase } from "@/components/landing/Showcase";
import { ChatBeat } from "@/components/landing/ChatBeat";
import { Bento } from "@/components/landing/Bento";
import { TerminalDemo } from "@/components/landing/TerminalDemo";
import { StatsBand } from "@/components/landing/StatsBand";
import { Reveal } from "@/components/landing/Reveal";
import { demoApplications } from "@/lib/demo-data";
import { actionQueue, daysBetween, followUp, funnel, rollingWeekPace, summarize, todayISO } from "@/lib/metrics";
import { env } from "@/lib/env";

const primary =
  "inline-flex items-center justify-center rounded-xl bg-accent px-5 py-3 text-[15px] font-semibold text-accent-ink shadow-panel transition hover:brightness-110";
const secondary =
  "inline-flex items-center justify-center rounded-xl border border-line bg-surface px-5 py-3 text-[15px] font-semibold text-ink transition hover:bg-surface-2";
// Hero buttons stack full-width on phones (four of them would crowd one
// row) and sit in a row on wider screens.
const heroPrimary = `${primary} w-full justify-center sm:w-auto`;
const heroSecondary = `${secondary} w-full justify-center sm:w-auto`;

export const revalidate = 3600; // keep the sample dates in the hero current

type Opening = { company: string; title: string; location: string; url: string };

/** What the tracker does, in the hero's own words — one line per capability. */
const HERO_CAPABILITIES = [
  "Reads your email to track every application and reply, so each stage shows up without you logging it.",
  "Puts the replies, assessments and forms that need you at the top, with how long you have left.",
  "Flags the companies that haven't replied in 21 days, so you know when to follow up.",
  "Sets a weekly application goal and shows how far along you are.",
  "Finds live internships straight from company career pages.",
  "Connects to Claude, Cursor and Copilot through MCP, so your agent can read and update your tracker for you.",
  "Keeps your real application data private, visible only to you.",
];

/** Live count and a few of the newest tech internships, cached with the page (hourly). */
async function latestInternships(): Promise<{ total: number | null; jobs: Opening[] }> {
  if (!env.supabaseUrl || !env.supabaseKey) return { total: null, jobs: [] };
  try {
    const res = await fetch(
      `${env.supabaseUrl}/rest/v1/jobs?select=company,title,location,url&active=eq.true&track=eq.Internship&tech=eq.true&order=posted_at.desc.nullslast&limit=4`,
      { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "count=exact" }, signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) return { total: null, jobs: [] };
    const total = Number(res.headers.get("content-range")?.split("/")[1]);
    return { total: Number.isFinite(total) ? total : null, jobs: (await res.json()) as Opening[] };
  } catch {
    return { total: null, jobs: [] };
  }
}

export default async function Home() {
  const openings = await latestInternships();
  const today = todayISO();
  const demoApps = demoApplications(today);
  const demoSum = summarize(demoApps, today, 21);
  const demoQueue = actionQueue(demoApps);
  const demoGhosted = demoApps
    .filter((a) => followUp(a, today, 21) === "ghosted")
    .sort((a, b) => (b.last_contact ?? "").localeCompare(a.last_contact ?? ""));
  const demoSteps = funnel(demoApps);
  // The landing pace is the rolling last 7 days — the same window the
  // dashboard's 7-day chart counts — computed by the one shared helper
  // the Showcase also calls in the browser after mount.
  const { days: paceDays, total: paceTotal, change: paceChange } = rollingWeekPace(demoApps, today);
  const showcaseQueue = demoQueue.slice(0, 3).map((a) => {
    const d = a.action_due ? daysBetween(today, a.action_due) : null;
    return {
      company: a.company,
      action: a.action_needed,
      dueLabel: d === null ? "No date" : d <= 0 ? "Today" : `${d}d left`,
      urgent: d !== null && d <= 2,
    };
  });
  const showcaseGhosted = demoGhosted.slice(0, 3).map((a) => ({
    company: a.company,
    quietDays: a.last_contact ? daysBetween(a.last_contact, today) : 0,
  }));
  const marqueeItems = [
    `${demoSum.total} applications tracked`,
    `${demoSum.oas} OAs`,
    `${demoSum.interviews} interviews`,
    `${demoSum.actions} waiting on you`,
    `${demoSum.ghosted} gone quiet, flagged`,
    `${demoSum.offers} offer on the table`,
  ];
  return (
    <>
      <TopBar
        right={
          <>
            <Link href="/jobs" className={navLink}>Jobs</Link>
            <Link href="/demo" className={navLink}>Demo</Link>
            <span className="hidden sm:inline">
              <GitHubLink />
            </span>
            <Link href="/login" className={navLink}>Sign in</Link>
            <Link href="/demo/connect" className={navButton}>Connect</Link>
            </>
        }
      />
      <main>
        <section className="gutter relative mx-auto grid min-h-[calc(100dvh-69px)] w-full max-w-[1180px] grid-cols-1 items-center gap-x-10 gap-y-6 pb-4 pt-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:content-between lg:pt-6">
          <HeroBackdrop />
          <div className="relative min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              <PulseMark className="h-3.5 w-3.5" animate /> Job search tracker
            </p>
            <h1 className="mt-5 font-display text-[40px] font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-[56px]">
              Know what&apos;s waiting <span className="text-accent">on you.</span>
            </h1>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link href="/demo?tour=dashboard" className={heroPrimary}>Try the live demo</Link>
              <Link href="/jobs" className={heroSecondary}>Find jobs</Link>
              <Link href="https://github.com/kumailrizvi890/Pulse-Find#run-it-locally" className={heroSecondary} target="_blank" rel="noopener">Self host</Link>
              <Link href="/#mcp" className={heroSecondary}>Connect your agents</Link>
            </div>
            <p className="mt-4 text-sm text-faint">No sign-up needed for the demo or the job board. Your real tracker is private to you.</p>
            <ul className="mt-8 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
              {HERO_CAPABILITIES.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted">
                  <PulseDot className="mt-1.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <HeroPreview />
          <div className="relative lg:col-span-2" aria-hidden="true">
            <PulseTrace className="h-10 w-full" />
          </div>
        </section>

        <Marquee items={marqueeItems} />

        <Showcase
          queue={showcaseQueue}
          actionsOpen={demoSum.actions}
          ghosted={showcaseGhosted}
          ghostedTotal={demoSum.ghosted}
          paceDays={paceDays}
          paceTotal={paceTotal}
          paceChange={paceChange}
          goal={8}
        />

        <section className="gutter mx-auto grid w-full max-w-[1180px] border-t border-line py-16">
          <Reveal>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">See it move</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight">Watch it work</h2>
            <p className="mt-3 max-w-[56ch] text-muted">One scroll through the demo tracker. That&apos;s the whole product.</p>
          </Reveal>
          <Reveal delay={90}>
            <video
              className="mt-8 w-full overflow-hidden rounded-[22px] border border-line shadow-panel"
              src="/landing/demo-tour.mp4"
              poster="/landing/demo-tour-poster.jpg"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label="A short screen recording of the Pulse Find demo tracker"
            />
            <p className="mt-3 text-center text-xs text-faint">Recorded from the live demo with sample data.</p>
          </Reveal>
          <Reveal delay={120}>
            <ChatBeat />
          </Reveal>
        </section>

        <Bento steps={demoSteps} />

        <section className="gutter mx-auto grid w-full max-w-[1180px] grid-cols-1 items-center gap-10 border-t border-line py-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <Reveal className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">Job finder</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight">
              {openings.total ? `${openings.total} tech internships open right now` : "Find internships and new-grad roles"}
            </h2>
            <p className="mt-3 max-w-[56ch] text-muted">
              Fresh from 50+ company career pages, every 6 hours. No reposts, no stale listings.
            </p>
            <div className="mt-6">
              <Link href="/jobs" className={primary}>Browse open roles</Link>
            </div>
          </Reveal>
          {openings.jobs.length > 0 && (
          <Reveal delay={90} className="min-w-0">
            <ul className="min-w-0 divide-y divide-line rounded-2xl border border-line bg-surface px-4 shadow-panel">
              {openings.jobs.map((j) => (
                <li key={j.url + j.title} className="flex items-center justify-between gap-3 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{j.title}</p>
                    <p className="truncate text-xs text-muted">{j.company} · {j.location || "Location not listed"}</p>
                  </div>
                  <Link href="/jobs" className="shrink-0 text-xs font-semibold text-accent">View</Link>
                </li>
              ))}
            </ul>
          </Reveal>
          )}
        </section>

        <section id="mcp" className="border-t border-line bg-surface">
          <div className="gutter mx-auto grid w-full max-w-[1180px] grid-cols-1 items-center gap-10 py-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <Reveal className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">MCP server</p>
              <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight">Let your own AI agent keep it current</h2>
              <p className="mt-3 max-w-[56ch] text-muted">
                Your agent reads your email and updates the tracker. Pulse Find never sees your inbox.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/demo/connect" className={primary}>Connect your agent</Link>
                <Link href="https://github.com/kumailrizvi890/Pulse-Find/blob/main/docs/SELF_HOST.md" className={secondary} target="_blank" rel="noopener">Self-host it</Link>
              </div>
            </Reveal>
            <Reveal delay={90} className="min-w-0">
              <TerminalDemo />
            </Reveal>
          </div>
        </section>

        <StatsBand total={demoSum.total} oas={demoSum.oas} interviews={demoSum.interviews} actions={demoSum.actions} />
      </main>
            <SiteFooter />
    </>
  );
}
