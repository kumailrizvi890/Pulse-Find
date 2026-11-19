"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { demoStore } from "@/lib/store";

export function DemoDashboard({ openChat }: { openChat?: boolean }) {
  const store = useMemo(() => demoStore(), []);
  const router = useRouter();
  const prevOpenRef = useRef(false);
  useEffect(() => {
    // The navbar "Ask Pulse" entry links here with ?chat=1. The Dashboard
    // opens the general chat from the prop below; once it has, clear the
    // trigger from the URL so the next click on "Ask Pulse" is a fresh
    // navigation to ?chat=1 instead of a no-op link to the current URL.
    if (openChat && !prevOpenRef.current) {
      router.replace("/demo", { scroll: false });
    }
    prevOpenRef.current = !!openChat;
  }, [openChat, router]);
  return (
    <Dashboard
      store={store}
      openGeneralChat={openChat}
      banner={
        // Pinned under the sticky header (71px: 14px trace + 56px bar +
        // 1px border, same offset as the shell tab row) instead of
        // scrolling up underneath it, where the line read sliced
        // mid-sentence through the translucent header. The solid
        // accent-soft background keeps page content from showing
        // through while the banner is stuck.
        <div className="sticky top-[calc(env(safe-area-inset-top,0px)+71px)] z-20 border-b border-accent/20 bg-accent-soft">
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
