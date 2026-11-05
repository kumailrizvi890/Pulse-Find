"use client";

import { useMemo } from "react";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { accountStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";

export function AccountDashboard({ userId }: { userId: string }) {
  const store = useMemo(() => accountStore(createClient(), userId), [userId]);
  return <Dashboard store={store} />;
}
