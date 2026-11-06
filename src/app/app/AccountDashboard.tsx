"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { NewOpenings } from "@/components/dashboard/NewOpenings";
import { btn } from "@/components/dashboard/ui";
import { accountStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";

export function AccountDashboard({ userId }: { userId: string }) {
  const store = useMemo(() => accountStore(createClient(), userId), [userId]);
  return (
    <Dashboard
      store={store}
      headerActions={<Link href="/jobs" className={btn.secondary}>Find jobs</Link>}
      extras={<NewOpenings />}
    />
  );
}
