"use client";

import { useMemo } from "react";
import { LeadsSection } from "@/components/pipeline/LeadsSection";
import { demoPipelineStore } from "@/lib/pipeline";
import { demoStore } from "@/lib/store";

// Public demo version of the signed-in Leads view. Uses only the seeded
// fictional demo data: demoPipelineStore() for leads/contacts and
// demoStore() for the tracker.
export default function DemoLeadsClient() {
  const pipeline = useMemo(() => demoPipelineStore(), []);
  const tracker = useMemo(() => demoStore(), []);
  return <LeadsSection pipeline={pipeline} tracker={tracker} />;
}
