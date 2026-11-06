import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar, navLink } from "@/components/TopBar";
import { ConnectAgent } from "./ConnectAgent";

export const metadata: Metadata = { title: "Connect your AI agent" };
export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/app/connect");

  return (
    <>
      <TopBar
        home="/app"
        right={
          <>
            <Link href="/app" className={navLink}>Tracker</Link>
            <Link href="/jobs" className={navLink}>Find jobs</Link>
          </>
        }
      />
      <ConnectAgent />
    </>
  );
}
