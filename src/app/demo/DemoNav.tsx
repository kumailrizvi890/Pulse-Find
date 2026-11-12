import Link from "next/link";
import { TopBar, navLink } from "@/components/TopBar";

// Shared header for the public demo. The tabs link the dashboard demo
// to the Sheet, Leads and Networking demo views. All demo views render
// fictional sample data only (see the seeded demo stores).
export function DemoNav() {
  return (
    <>
      <TopBar
        right={
          <>
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
          <span className="ml-auto hidden shrink-0 rounded-full border border-line bg-bg px-2.5 py-1 text-xs text-muted sm:inline">
            Fictional sample data
          </span>
        </div>
      </nav>
    </>
  );
}
