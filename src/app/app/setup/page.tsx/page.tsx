import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import SetupWizard from "@/components/SetupWizard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Get set up — Pulse Find" };

/**
 * The guided first-run setup. New or empty accounts land here instead of
 * an empty dashboard; accounts that already have applications go straight
 * to the dashboard, and accounts that already finished setup are not shown
 * the wizard again. The dashboard links back here as well, and so does
 * Connect your agent.
 */
export default async function SetupPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/app/setup");

  if ((await cookies()).get("pulse-find-setup-done")?.value === "1") {
    redirect("/app");
  }

  const { count } = await supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", data.user.id);
  if (count && count > 0) redirect("/app");

  return (
    <AppShell
      active="tracker"
      right={
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          {data.user.email}
        </span>
      }
    >
      <SetupWizard userId={data.user.id} />
    </AppShell>
  );
}
