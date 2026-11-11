import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell, shellNavLink } from "@/components/AppShell";
import { SheetClient } from "./SheetClient";

export const metadata: Metadata = { title: "Sheet view" };
export const dynamic = "force-dynamic";

export default async function SheetPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/app/sheet");

  return (
    <AppShell
      active="sheet"
      right={
        <>
          <span className="hidden max-w-[220px] truncate px-2 text-xs text-faint sm:inline">{data.user.email}</span>
          <form action="/auth/signout" method="post">
            <button className={shellNavLink}>Sign out</button>
          </form>
        </>
      }
    >
      <SheetClient userId={data.user.id} />
    </AppShell>
  );
}
