"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Status } from "@/lib/types";
import { parseISO } from "@/lib/metrics";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-50",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink transition hover:bg-surface-2 disabled:opacity-50",
  ghost: "inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-ink",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-2 text-sm font-semibold text-danger transition hover:brightness-95",
};

export const field =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none";

export function Panel({ title, hint, action, children, className }: { title?: string; hint?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-panel sm:p-5", className)}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className="font-display text-[15px] font-bold tracking-tight">{title}</h2>}
            {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const STATUS_TONE: Record<Status, string> = {
  Applied: "bg-surface-2 text-muted border-line",
  Incomplete: "bg-danger-soft text-danger border-danger/25",
  "OA Received": "bg-warn-soft text-warn border-warn/25",
  "OA Completed": "bg-warn-soft text-warn border-warn/25",
  "Recruiter Screen": "bg-accent-soft text-accent border-accent/25",
  "Interview Invited": "bg-accent-soft text-accent border-accent/25",
  Interviewing: "bg-accent-soft text-accent border-accent/25",
  "Final Round": "bg-accent-soft text-accent border-accent/25",
  Offer: "bg-good-soft text-good border-good/25",
  Accepted: "bg-good-soft text-good border-good/25",
  Rejected: "bg-surface-2 text-faint border-line",
  Withdrawn: "bg-surface-2 text-faint border-line",
};

export function StatusPill({ status }: { status: Status }) {
  return <span className={cx("inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium", STATUS_TONE[status])}>{status}</span>;
}

export function Tag({ tone, children }: { tone: "tech" | "danger" | "warn" | "muted"; children: ReactNode }) {
  const t = {
    tech: "bg-tech-soft text-tech",
    danger: "bg-danger-soft text-danger",
    warn: "bg-warn-soft text-warn",
    muted: "bg-surface-2 text-muted",
  }[tone];
  return <span className={cx("inline-flex whitespace-nowrap rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-wide", t)}>{children}</span>;
}

export function fmtDate(s: string | null, withYear = false) {
  if (!s) return "—";
  const d = parseISO(s);
  const showYear = withYear || d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(showYear ? { year: "numeric" } : {}) });
}

export function useToast() {
  const [msg, setMsg] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.tone === "error" ? 6000 : 2600);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? (
    <div
      role="status"
      className={cx(
        "fixed left-1/2 z-50 -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm shadow-panel",
        "bottom-[calc(20px+env(safe-area-inset-bottom,0px))] max-w-[calc(100vw-32px)]",
        msg.tone === "error" ? "border-danger/30 bg-danger-soft text-danger" : "border-line bg-surface text-ink",
      )}
    >
      {msg.text}
    </div>
  ) : null;
  return { toast: (text: string, tone: "ok" | "error" = "ok") => setMsg({ text, tone }), toastNode: node };
}
