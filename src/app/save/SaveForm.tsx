"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { btn, field } from "@/components/dashboard/ui";
import { trackEvent } from "@/lib/analytics";
import type { DraftApplication } from "@/lib/bookmarklet";
import { todayISO } from "@/lib/metrics";
import { accountStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { emptyApplication } from "@/lib/types";

/**
 * The prefilled draft from the bookmarklet, ready to confirm. Saving
 * goes through the same accountStore the dashboard uses — no separate
 * data path. Company and role are guesses from the page, so everything
 * stays editable before saving.
 */
export function SaveForm({ userId, draft }: { userId: string; draft: DraftApplication }) {
  const store = useMemo(() => accountStore(createClient(), userId), [userId]);
  const [company, setCompany] = useState(draft.company);
  const [role, setRole] = useState(draft.role);
  const [link, setLink] = useState(draft.link);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!company.trim()) return setError("Add the company name first.");
    setBusy(true);
    setError("");
    try {
      const state = await store.load();
      await store.create({
        ...emptyApplication(todayISO()),
        company: company.trim(),
        role: role.trim(),
        link: link.trim(),
        notes: "Saved with the bookmarklet",
      });
      if (state.apps.length === 0) trackEvent("first_application_added");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that application. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-panel">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-xl">
          ✓
        </div>
        <h1 className="mt-4 font-display text-xl font-bold">Saved to your tracker</h1>
        <p className="mt-2 text-sm text-muted">
          {company}
          {role ? ` · ${role}` : ""} is in. You can close this tab, or open your
          tracker to see it.
        </p>
        <Link href="/app" className={`${btn.primary} mt-5 inline-flex w-full justify-center`}>
          Open my tracker
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="rounded-2xl border border-line bg-surface p-6 shadow-panel">
      <h1 className="font-display text-2xl font-extrabold tracking-tight">Save this application</h1>
      <p className="mt-1 text-sm text-muted">
        Guessed from the page you were on. Fix anything that looks off, then save.
      </p>
      <div className="mt-5 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-xs font-medium text-muted" htmlFor="s-company">
          Company
          <input id="s-company" className={field} value={company} onChange={(e) => setCompany(e.target.value)} required maxLength={120} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-muted" htmlFor="s-role">
          Role
          <input id="s-role" className={field} value={role} onChange={(e) => setRole(e.target.value)} maxLength={160} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-muted" htmlFor="s-link">
          Posting link
          <input id="s-link" className={field} value={link} onChange={(e) => setLink(e.target.value)} maxLength={2000} />
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" className={`${btn.primary} mt-5 w-full py-2.5`} disabled={busy}>
        {busy ? "Saving…" : "Save to my tracker"}
      </button>
    </form>
  );
}
