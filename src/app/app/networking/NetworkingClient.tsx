"use client";

import { useMemo } from "react";
import { NetworkingSection } from "@/components/pipeline/NetworkingSection";
import { accountPipelineStore } from "@/lib/pipeline";
import { createClient } from "@/lib/supabase/client";

export function NetworkingClient({ userId }: { userId: string }) {
  const pipeline = useMemo(() => accountPipelineStore(createClient(), userId), [userId]);
  return <NetworkingSection pipeline={pipeline} />;
}
