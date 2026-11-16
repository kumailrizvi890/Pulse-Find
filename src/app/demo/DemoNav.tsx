import Link from "next/link";
import { TopBar, navLink } from "@/components/TopBar";
import { PulseDot } from "@/components/PulseBrand";

// Shared header for the public demo. The tabs link the dashboard demo
// to the Sheet, Leads and Networking demo views. All demo views render
// fictional sample data only (see the seeded demo stores).
//
// "Ask Pulse" links to the demo dashboard with ?chat=1, which opens the
// general chat (see DemoDashboard / Dashboard): the chat answers from the
// whole sample tracker, so a demo visitor can try it from any demo page
// without opening a task first.
export function DemoNav() {
  return (
    <>
      <TopBar
        right={
          <>
            <Link href="/demo?chat=1" className={navLink} aria-label="Ask Pulse about the demo tracker">
              <span className="flex items-center gap-1.5">
                <PulseDot />
                Ask Pulse
              </span>
            </Link>
            <Link href="/jobs" className={navLink}>
              Jobs
            </Link>
            <Link href="/login" className={navLink}>
              Sign in
            </Link>
          </>
        }
      />
      <nav aria-label="Demo sections" className="border-b border-line bg-surface">
        <div className="gutter mx-auto flex w-full max-w-[1180px] items-center gap-1 overflow-x-auto py-2 text-sm">
          <Link href="/demo" className={navLink}>
            Dashboard
          </Link>
          <Link href="/demo/sheet" className={navLink}>
            Sheet
          </Link>
          <Link href="/demo/leads" className={navLink}>
            Leads
          </Link>
          <Link href="/demo/networking" className={navLink}>
            Networking
          </Link>
          <Link href="/demo/connect" className={navLink}>
            Connect
          </Link>
          <span className="ml-auto hidden shrink-0 rounded-full border border-line bg-bg px-2.5 py-1 text-xs text-muted sm:inline">
            Fictional sample data
          </span>
        </div>
      </nav>
    </>
  );
}
