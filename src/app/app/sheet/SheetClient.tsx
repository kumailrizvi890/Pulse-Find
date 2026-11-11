"use client";

import { useMemo } from "react";
import { SheetView } from "@/components/dashboard/SheetView";
import { accountStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";

export function SheetClient({ userId }: { userId: string }) {
  const store = useMemo(() => accountStore(createClient(), userId), [userId]);
  return <SheetView store={store} />;
}
