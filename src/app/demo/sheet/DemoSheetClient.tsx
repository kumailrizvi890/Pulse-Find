"use client";

import { useMemo } from "react";
import { SheetView } from "@/components/dashboard/SheetView";
import { demoStore } from "@/lib/store";

// Public demo version of the signed-in Sheet view. Uses only the seeded
// fictional demo data from demoStore().
export default function DemoSheetClient() {
  const store = useMemo(() => demoStore(), []);
  return <SheetView store={store} />;
}
