import Link from "next/link";
import { GitHubLink, TopBar, navLink } from "@/components/TopBar";
import { HeroPreview } from "@/components/HeroPreview";
import { PulseMark } from "@/components/Logo";

const primary =
  "inline-flex items-center justify-center rounded-xl bg-accent px-5 py-3 text-[15px] font-semibold text-accent-ink shadow-panel transition hover:brightness-110";
const secondary =
  "inline-flex items-center justify-center rounded-xl border border-line bg-surface px-5 py-3 text-[15px] font-semibold text-ink transition hover:bg-surface-2";

export const revalidate = 3600; // keep the sample dates in the hero current

export default function Home() {
  return (
    <>
      <TopBar
        right={
          <>
            <Link href="/jobs" className={navLink}>Jobs</Link>
            <Link href="/demo" className={navLink}>Demo</Link>
            <GitHubLink />
            <Link href="/login" className={navLink}>Sign in</Link>
          </>
        }
      />
      <main>
        <section className="gutter mx-auto grid w-full max-w-[1180px] grid-cols-1 items-center gap-10 pb-16 pt-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:pt-20">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              <PulseMark className="h-3.5 w-3.5" animate /> Job search tracker
            </p>
            <h1 className="mt-5 font-display text-[40px] font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-[56px]">
              Know what&apos;s waiting <span className="text-accent">on you.</span>
            </h1>
            <p className="mt-5 max-w-[54ch] text-[17px] leading-relaxed text-muted">
              Pulse Find tracks every application, puts the assessments, replies and forms that need you at the top, and flags the companies that
              went quiet so you know when to follow up.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/demo" className={primary}>Try the live demo</Link>
              <Link href="/login?mode=signup" className={secondary}>Create a free tracker</Link>
            </div>
            <p className="mt-4 text-sm text-faint">No sign-up needed for the demo. Your real tracker is private to you.</p>
          </div>
          <HeroPreview />
        </section>

        <section className="border-y border-line bg-surface">
          <div className="gutter mx-auto grid w-full max-w-[1180px] grid-cols-1 gap-8 py-14 md:grid-cols-3">
            <Feature
              kicker="Action queue"
              title="The next move is always visible"
              body="Online assessments with expiry dates, interviews to schedule, portals left half-finished. Each one sits in a single list, soonest deadline first, until you mark it done."
              detail="OA expires Fri → Due in 2d"
            />
            <Feature
              kicker="Ghost detection"
              title="Know who went quiet"
              body="Every application counts the days since you last heard back. Past your threshold it's flagged, so you follow up while it still matters instead of guessing."
              detail="quiet 21+ days → Ghosted"
            />
            <Feature
              kicker="Pace"
              title="See your week at a glance"
              body="Set a weekly goal and watch it against the last 12 weeks. Tech roles are tagged automatically so you can see where your effort is going."
              detail="14 / 25 this week"
            />
          </div>
        </section>

        <section className="gutter mx-auto grid w-full max-w-[1180px] grid-cols-1 gap-10 py-16 md:grid-cols-2">
          <div className="min-w-0">
            <h2 className="font-display text-3xl font-extrabold tracking-tight">Bring the spreadsheet you already have</h2>
            <p className="mt-3 max-w-[56ch] text-muted">
              Import a CSV from Excel, Google Sheets or Notion. Pulse Find recognizes common column names and messy dates like “Oct 28” or
              “10/28/26”. Export back to an Excel file with the colors baked in, so it looks right on your phone too.
            </p>
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-3xl font-extrabold tracking-tight">Private by default</h2>
            <p className="mt-3 max-w-[56ch] text-muted">
              Your applications are tied to your account and the database enforces it: no one else&apos;s request can read your rows. No ads, no
              trackers. <Link href="/privacy" className="text-accent underline underline-offset-2">Read the privacy page</Link>.
            </p>
          </div>
        </section>

        <section className="border-t border-line bg-surface">
          <div className="gutter mx-auto grid w-full max-w-[1180px] grid-cols-1 items-center gap-10 py-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">MCP server</p>
              <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight">Let your own AI agent keep it current</h2>
              <p className="mt-3 max-w-[56ch] text-muted">
                Connect Claude, Cursor, Copilot or any MCP client with an access token. Your agent reads job email with its own tools and Pulse Find
                turns each one into the right update: assessment deadlines, interview invites, rejections, offers, plus a check for fake job
                offers. Pulse Find never sees your inbox and never sends anything.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/app/connect" className={primary}>Connect your agent</Link>
                <Link href="https://github.com/kumailrizvi890/Pulse-Find/blob/main/docs/SELF_HOST.md" className={secondary} target="_blank" rel="noopener">Self-host it</Link>
              </div>
            </div>
            <pre className="min-w-0 overflow-x-auto rounded-2xl border border-line bg-bg p-4 font-mono text-[12.5px] leading-relaxed text-muted">
              <span className="text-faint">$ </span>claude mcp add --transport http pulse-find \{"\n"}
              {"    "}https://pulsefind-app.vercel.app/api/mcp \{"\n"}
              {"    "}--header &quot;Authorization: Bearer pf_…&quot;{"\n\n"}
              <span className="text-ink">&gt; Scan my email from the last week and update Pulse Find.</span>{"\n\n"}
              <span className="text-good">✓</span> Roblox · OA received · due Nov 11{"\n"}
              <span className="text-good">✓</span> Ramp · new application{"\n"}
              <span className="text-danger">!</span> &quot;Global Corp&quot; · likely a fake job offer, nothing added
            </pre>
          </div>
        </section>
      </main>
      <footer className="border-t border-line">
        <div className="gutter mx-auto flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-3 py-8 text-sm text-faint">
          <p>
            Built by{" "}
            <Link href="https://portfolio-kumailr.vercel.app" className="font-medium text-muted hover:text-ink" target="_blank" rel="noopener">
              Kumail Rizvi
            </Link>
          </p>
          <nav className="flex gap-4">
            <Link href="/jobs" className="hover:text-ink">Jobs</Link>
            <Link href="/app/connect" className="hover:text-ink">Agents</Link>
            <Link href="/demo" className="hover:text-ink">Demo</Link>
            <Link href="https://github.com/kumailrizvi890/Pulse-Find" className="hover:text-ink" target="_blank" rel="noopener">GitHub</Link>
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          </nav>
        </div>
      </footer>
    </>
  );
}

function Feature({ kicker, title, body, detail }: { kicker: string; title: string; body: string; detail: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">{kicker}</p>
      <h3 className="mt-2 font-display text-xl font-bold tracking-tight">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">{body}</p>
      <p className="mt-3 inline-block rounded-md bg-surface-2 px-2 py-1 font-mono text-xs text-ink">{detail}</p>
    </div>
  );
}
