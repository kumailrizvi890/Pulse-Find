"use client";

import { useMemo } from "react";
import { LeadsSection } from "@/components/pipeline/LeadsSection";
import { accountPipelineStore } from "@/lib/pipeline";
import { accountStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";

export function LeadsClient({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const pipeline = useMemo(() => accountPipelineStore(supabase, userId), [supabase, userId]);
  const tracker = useMemo(() => accountStore(supabase, userId), [supabase, userId]);
  return <LeadsSection pipeline={pipeline} tracker={tracker} />;
}
