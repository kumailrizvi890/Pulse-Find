import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell, shellNavLink } from "@/components/AppShell";
import { AccountDashboard } from "./AccountDashboard";

export const metadata: Metadata = { title: "Your tracker" };
export const dynamic = "force-dynamic";

export default async function AppPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/app");

  if ((await cookies()).get("pulse-find-setup-done")?.value !== "1") {
    const { count } = await supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", data.user.id);
    if (count === 0) redirect("/app/setup");
  }

  return (
    <AppShell
      active="tracker"
      right={
        <>
          <span className="hidden max-w-[220px] truncate px-2 text-xs text-faint sm:inline">{data.user.email}</span>
          <form action="/auth/signout" method="post">
            <button className={shellNavLink}>Sign out</button>
          </form>
        </>
      }
    >
      <AccountDashboard userId={data.user.id} />
    </AppShell>
  );
}
