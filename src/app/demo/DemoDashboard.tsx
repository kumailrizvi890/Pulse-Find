"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { demoStore } from "@/lib/store";

export function DemoDashboard({ openChat, tour }: { openChat?: boolean; tour?: string }) {
  const store = useMemo(() => demoStore(), []);
  const router = useRouter();
  const prevOpenRef = useRef(false);
  useEffect(() => {
    // The navbar "Ask Pulse" entry links here with ?chat=1. The Dashboard
    // opens the general chat from the prop below; once it has, clear the
    // trigger from the URL so the next click on "Ask Pulse" is a fresh
    // navigation to ?chat=1 instead of a no-op link to the current URL.
    // A tour param survives the clear: the tour's own "Try Ask Pulse
    // yourself" link arrives as ?tour=chat&chat=1, and dropping the tour
    // there would close the tour the moment the visitor tried the chat.
    if (openChat && !prevOpenRef.current) {
      router.replace(tour ? `/demo?tour=${tour}` : "/demo", { scroll: false });
    }
    prevOpenRef.current = !!openChat;
  }, [openChat, tour, router]);
  return (
    <Dashboard
      store={store}
      openGeneralChat={openChat}
      banner={
        <div className="border-b border-accent/20 bg-accent-soft">
          <div className="gutter mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
            <p className="text-ink">
              <b>Demo mode.</b> Sample companies, nothing saved. Add, edit and import freely.
            </p>
            <Link href="/login?mode=signup" className="font-semibold text-accent underline-offset-2 hover:underline">
              Start your own tracker →
            </Link>
          </div>
        </div>
      }
    />
  );
}
