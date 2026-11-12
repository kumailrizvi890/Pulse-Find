"use client";

import { useMemo } from "react";
import { NetworkingSection } from "@/components/pipeline/NetworkingSection";
import { demoPipelineStore } from "@/lib/pipeline";

// Public demo version of the signed-in Networking tracker. Uses only the
// seeded fictional demo data from demoPipelineStore().
export default function DemoNetworkingClient() {
  const pipeline = useMemo(() => demoPipelineStore(), []);
  return <NetworkingSection pipeline={pipeline} />;
}
