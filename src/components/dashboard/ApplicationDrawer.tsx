"use client";

import { useEffect, useId, useRef, useState } from "react";
import { STATUSES, TRACKS, type Application, type ApplicationInput, type TrackerEvent } from "@/lib/types";
import { btn, field, fmtDate } from "./ui";

type Props = {
  open: boolean;
  initial: ApplicationInput;
  editing: Application | null;
  events: TrackerEvent[];
  onClose: () => void;
  onSave: (v: ApplicationInput) => Promise<void>;
  onDelete: () => Promise<void>;
};

/** Mount this only while open (and key it by record) so each opening starts from fresh state. */
export function ApplicationDrawer({ initial, editing, events, onClose, onSave, onDelete }: Omit<Props, "open">) {
  const [v, setV] = useState<ApplicationInput>(initial);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const firstRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    const t = setTimeout(() => firstRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const set = <K extends keyof ApplicationInput>(k: K, val: ApplicationInput[K]) => setV((p) => ({ ...p, [k]: val }));
  const history = editing ? events.filter((e) => e.application_id === editing.id).slice(0, 8) : [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.company.trim()) return setError("Add the company name.");
    if (v.link && !/^https?:\/\//i.test(v.link)) return setError("Links need to start with http:// or https://");
    setBusy(true);
    setError("");
    try {
      await onSave({ ...v, company: v.company.trim(), role: v.role.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button aria-label="Close" className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative flex h-full w-full max-w-[460px] flex-col overflow-y-auto border-l border-line bg-surface shadow-panel"
        style={{ paddingTop: "env(safe-area-inset-top,0px)", paddingBottom: "env(safe-area-inset-bottom,0px)", paddingRight: "env(safe-area-inset-right,0px)" }}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-5 py-4">
          <h2 id={titleId} className="font-display text-lg font-bold tracking-tight">{editing ? editing.company : "Add application"}</h2>
          <button type="button" onClick={onClose} className={btn.ghost}>Close</button>
        </header>

        <div className="flex flex-col gap-4 px-5 py-5">
          <Row label="Company" htmlFor="f-company">
            <input id="f-company" ref={firstRef} className={field} value={v.company} onChange={(e) => set("company", e.target.value)} placeholder="Northwind Labs" maxLength={200} required />
          </Row>
          <Row label="Role" htmlFor="f-role">
            <input id="f-role" className={field} value={v.role} onChange={(e) => set("role", e.target.value)} placeholder="Software Engineer Intern" maxLength={300} />
          </Row>
          <div className="grid grid-cols-2 gap-3">
            <Row label="Status" htmlFor="f-status">
              <select id="f-status" className={field} value={v.status} onChange={(e) => set("status", e.target.value as ApplicationInput["status"])}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Row>
            <Row label="Track" htmlFor="f-track">
              <select id="f-track" className={field} value={v.track} onChange={(e) => set("track", e.target.value as ApplicationInput["track"])}>
                {TRACKS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Row>
            <Row label="Date applied" htmlFor="f-applied">
              <input id="f-applied" type="date" className={field} value={v.date_applied ?? ""} onChange={(e) => set("date_applied", e.target.value || null)} />
            </Row>
            <Row label="Last heard from them" htmlFor="f-contact">
              <input id="f-contact" type="date" className={field} value={v.last_contact ?? ""} onChange={(e) => set("last_contact", e.target.value || null)} />
            </Row>
            <Row label="Interviews done" htmlFor="f-int">
              <input id="f-int" type="number" min={0} max={50} className={field} value={v.interviews_done} onChange={(e) => set("interviews_done", Math.max(0, Math.min(50, Number(e.target.value) || 0)))} />
            </Row>
            <label className="flex items-end gap-2 pb-2 text-sm text-ink" htmlFor="f-oa">
              <input id="f-oa" type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={v.oa_received} onChange={(e) => set("oa_received", e.target.checked)} />
              Got an assessment
            </label>
          </div>

          <fieldset className="rounded-xl border border-danger/25 bg-danger-soft/50 p-3">
            <legend className="px-1 text-xs font-semibold text-danger">Waiting on you</legend>
            <div className="flex flex-col gap-3">
              <input id="f-action" aria-label="Action needed" className={field} value={v.action_needed} onChange={(e) => set("action_needed", e.target.value)} placeholder="e.g. Finish the HackerRank by Friday" maxLength={500} />
              <Row label="Due" htmlFor="f-due">
                <input id="f-due" type="date" className={field} value={v.action_due ?? ""} onChange={(e) => set("action_due", e.target.value || null)} />
              </Row>
            </div>
          </fieldset>

          <Row label="Latest update" htmlFor="f-update">
            <input id="f-update" className={field} value={v.latest_update} onChange={(e) => set("latest_update", e.target.value)} placeholder="Recruiter replied, phone screen next week" maxLength={1000} />
          </Row>
          <Row label="Link (posting or email)" htmlFor="f-link">
            <input id="f-link" type="url" inputMode="url" className={field} value={v.link} onChange={(e) => set("link", e.target.value)} placeholder="https://" maxLength={2000} />
          </Row>
          <Row label="Notes" htmlFor="f-notes">
            <textarea id="f-notes" rows={3} className={field} value={v.notes} onChange={(e) => set("notes", e.target.value)} maxLength={4000} />
          </Row>

          {history.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">History</h3>
              <ul className="flex flex-col gap-1.5 text-sm">
                {history.map((h) => (
                  <li key={h.id} className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
                    <span className="tnum font-mono text-xs text-faint">{fmtDate(h.event_date)}</span>
                    <span><b className="font-medium">{h.kind}</b>{h.details && <span className="text-muted"> · {h.details}</span>}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        </div>

        <footer className="sticky bottom-0 mt-auto flex items-center justify-between gap-2 border-t border-line bg-surface px-5 py-4">
          {editing ? (
            confirmDelete ? (
              <span className="flex items-center gap-2 text-sm">
                <button type="button" className={btn.danger} onClick={onDelete}>Delete for good</button>
                <button type="button" className={btn.ghost} onClick={() => setConfirmDelete(false)}>Keep</button>
              </span>
            ) : (
              <button type="button" className={btn.ghost} onClick={() => setConfirmDelete(true)}>Delete</button>
            )
          ) : <span />}
          <button type="submit" className={btn.primary} disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add application"}</button>
        </footer>
      </form>
    </div>
  );
}

function Row({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted">{label}</label>
      {children}
    </div>
  );
}
