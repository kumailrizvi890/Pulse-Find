import type { Metadata } from "next";
import Link from "next/link";
import { TopBar } from "@/components/TopBar";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <>
      <TopBar />
      <main className="gutter mx-auto w-full max-w-[680px] pb-20 pt-10">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Privacy</h1>
        <p className="mt-2 text-sm text-faint">Last updated November 5, 2026</p>
        <div className="mt-8 flex flex-col gap-6 text-[15px] leading-relaxed text-muted [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink">
          <section>
            <h2>What Pulse Find stores</h2>
            <p className="mt-2">
              Your email address and password (handled by Supabase Auth; passwords are hashed, never stored in plain text), and the job applications,
              notes and settings you add. That&apos;s it. There are no ads, no trackers and no analytics scripts.
            </p>
          </section>
          <section>
            <h2>Who can see it</h2>
            <p className="mt-2">
              Only you. Every row in the database is tied to your account, and the database itself enforces that rule (Postgres row-level security), so
              one user&apos;s request can&apos;t return another user&apos;s applications.
            </p>
          </section>
          <section>
            <h2>Email</h2>
            <p className="mt-2">
              Pulse Find does not read your inbox. If email import is added later, it will be opt-in, read-only, limited to job-related messages, and
              described here before it ships.
            </p>
          </section>
          <section>
            <h2>Deleting your data</h2>
            <p className="mt-2">
              Delete any application from its detail panel. To delete your whole account and everything in it, email the address on the{" "}
              <Link href="https://github.com/kumailrizvi890/Pulse-Find" className="text-accent underline underline-offset-2">GitHub page</Link> and it will be removed
              within 7 days. Export your data first from the dashboard if you want a copy.
            </p>
          </section>
          <section>
            <h2>The demo</h2>
            <p className="mt-2">The demo uses invented companies and runs entirely in your browser tab. Nothing you type there is sent anywhere.</p>
          </section>
        </div>
      </main>
    </>
  );
}
