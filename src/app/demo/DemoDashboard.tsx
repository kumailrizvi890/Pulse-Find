"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { demoStore } from "@/lib/store";

export function DemoDashboard() {
  const store = useMemo(() => demoStore(), []);
  return (
    <Dashboard
      store={store}
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
