"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { NewOpenings } from "@/components/dashboard/NewOpenings";
import { Panel, btn, field } from "@/components/dashboard/ui";
import { accountStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";

function AccountData() {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function exportData() {
    setExporting(true);
    setError("");
    try {
      const res = await fetch("/api/account/export");
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Couldn't export your data.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pulse-find-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't export your data.");
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Couldn't delete your account.");
      }
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete your account.");
      setDeleting(false);
    }
  }

  return (
    <Panel title="Your data" hint="Download everything Pulse Find holds for you, or delete your account for good.">
      <div className="flex flex-wrap gap-2">
        <button className={btn.secondary} onClick={exportData} disabled={exporting}>
          {exporting ? "Preparing…" : "Export my data (JSON)"}
        </button>
        {!confirmOpen && (
          <button className={btn.danger} onClick={() => setConfirmOpen(true)}>
            Delete account
          </button>
        )}
      </div>
      {confirmOpen && (
        <div className="mt-4 rounded-lg border border-danger/30 bg-danger-soft p-3">
          <p className="text-sm text-ink">
            This deletes your account and all of your applications, leads, contacts, events and tokens. There is no undo.
            Type DELETE to confirm.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              className={field}
              style={{ maxWidth: 220 }}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              aria-label="Type DELETE to confirm account deletion"
            />
            <button className={btn.danger} onClick={deleteAccount} disabled={confirmText !== "DELETE" || deleting}>
              {deleting ? "Deleting…" : "Delete my account"}
            </button>
            <button
              className={btn.ghost}
              onClick={() => {
                setConfirmOpen(false);
                setConfirmText("");
              }}
              disabled={deleting}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </Panel>
  );
}

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
      extras={
        <>
          <NewOpenings />
          <AccountData />
        </>
      }
    />
  );
}
