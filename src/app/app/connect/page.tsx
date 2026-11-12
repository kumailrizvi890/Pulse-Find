import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { btn } from "@/components/dashboard/ui";
import { ConnectAgent } from "./ConnectAgent";

export const metadata: Metadata = { title: "Connect your AI agent" };
export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/app/connect");

  return (
    <AppShell active="connect">
      <div className="mb-4 flex justify-end">
        <Link href="/app/setup" className={btn.secondary}>Get set up in 3 steps →</Link>
      </div>
      <ConnectAgent />
    </AppShell>
  );
}
