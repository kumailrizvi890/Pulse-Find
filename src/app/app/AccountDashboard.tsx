"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { NewOpenings } from "@/components/dashboard/NewOpenings";
import { btn } from "@/components/dashboard/ui";
import { accountStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";

export function AccountDashboard({ userId, openChat }: { userId: string; openChat?: boolean }) {
  const store = useMemo(() => accountStore(createClient(), userId), [userId]);
  const router = useRouter();
  const prevOpenRef = useRef(false);
  useEffect(() => {
    // Same trigger as the demo (?chat=1, see DemoDashboard): the
    // floating Pulse button falls back to /app?chat=1 from the app
    // sub-pages, where there is no Dashboard to open the chat in place.
    // Once the chat has opened, clear the trigger so the next click is
    // a fresh navigation instead of a no-op.
    if (openChat && !prevOpenRef.current) router.replace("/app", { scroll: false });
    prevOpenRef.current = !!openChat;
  }, [openChat, router]);
  return (
    <Dashboard
      store={store}
      userId={userId}
      openGeneralChat={openChat}
      headerActions={<Link href="/jobs" className={btn.secondary}>Find jobs</Link>}
      extras={<NewOpenings />}
    />
  );
}
