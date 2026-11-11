import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell, shellNavLink } from "@/components/AppShell";
import { NetworkingClient } from "./NetworkingClient";

export const metadata: Metadata = { title: "Networking" };
export const dynamic = "force-dynamic";

export default async function NetworkingPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/app/networking");

  return (
    <AppShell
      active="networking"
      right={
        <>
          <span className="hidden max-w-[220px] truncate px-2 text-xs text-faint sm:inline">{data.user.email}</span>
          <form action="/auth/signout" method="post">
            <button className={shellNavLink}>Sign out</button>
          </form>
        </>
      }
    >
      <NetworkingClient userId={data.user.id} />
    </AppShell>
  );
}
