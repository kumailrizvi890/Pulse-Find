import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { draftApplicationFromPage } from "@/lib/bookmarklet";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { SaveForm } from "./SaveForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Save application" };

/**
 * Landing page for the save bookmarklet: /save?u=<page url>&t=<page title>.
 * Signed-out visitors go to /login with next=/save?... (params preserved)
 * and come straight back here after signing in.
 */
export default async function SavePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; t?: string }>;
}) {
  const sp = await searchParams;
  const pageUrl = typeof sp.u === "string" ? sp.u : "";
  const pageTitle = typeof sp.t === "string" ? sp.t : "";

  let userId: string | null = null;
  if (env.supabaseUrl && env.supabaseKey) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      const next = `/save?u=${encodeURIComponent(pageUrl)}&t=${encodeURIComponent(pageTitle)}`;
      redirect(`/login?next=${encodeURIComponent(next)}`);
    }
    userId = data.user.id;
  }

  const draft = draftApplicationFromPage(pageUrl, pageTitle);

  return (
    <div className="pf-shell relative min-h-dvh">
      <header className="gutter relative z-10 mx-auto flex h-14 w-full max-w-[1180px] items-center">
        <Logo href="/" />
      </header>
      <main className="gutter relative z-10 mx-auto w-full max-w-[480px] pb-16 pt-10">
        {userId ? (
          <SaveForm userId={userId} draft={draft} />
        ) : (
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-panel">
            <h1 className="font-display text-xl font-bold">Sign-in isn&apos;t set up here</h1>
            <p className="mt-2 text-sm text-muted">
              This copy of Pulse Find can&apos;t save applications yet.{" "}
              <Link href="/demo" className="underline underline-offset-2">
                Open the demo
              </Link>{" "}
              instead.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
