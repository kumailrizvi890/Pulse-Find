"use client";

import { useEffect, useMemo, useState } from "react";
import type { Lead, LeadInput, LeadStatus } from "@/lib/types";
import { LEAD_STATUSES, TRACKS, emptyLead } from "@/lib/types";
import { todayISO } from "@/lib/metrics";
import type { PipelineStore } from "@/lib/pipeline";
import { leadKey } from "@/lib/pipeline";
import type { TrackerStore } from "@/lib/store";
import { Panel, Tag, btn, cx, field, fmtDate, useToast } from "@/components/dashboard/ui";

const STATUS_TONE: Record<LeadStatus, string> = {
  New: "bg-accent-soft text-accent border-accent/25",
  Queued: "bg-warn-soft text-warn border-warn/25",
  Applied: "bg-good-soft text-good border-good/25",
  Problem: "bg-danger-soft text-danger border-danger/25",
  "Not eligible": "bg-surface-2 text-faint border-line",
  Closed: "bg-surface-2 text-faint border-line",
};

export function LeadPill({ status }: { status: LeadStatus }) {
  return <span className={cx("inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium", STATUS_TONE[status])}>{status}</span>;
}

/**
 * The leads pipeline: roles found but not yet applied to, with the same
 * statuses as the Excel tracker's Leads tab. Promoting a lead creates the
 * application in the tracker — a human tap, here in the UI; Pulse Find
 * itself never applies to anything.
 */
export function LeadsSection({ pipeline, tracker }: { pipeline: PipelineStore; tracker: TrackerStore }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState<LeadStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<{ open: boolean; editing: Lead | null }>({ open: false, editing: null });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const { toast, toastNode } = useToast();
  const today = todayISO();

  useEffect(() => {
    let alive = true;
    pipeline
      .loadLeads()
      .then((d) => {
        if (!alive) return;
        setLeads(d);
        setState("ready");
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setLoadError(e instanceof Error ? e.message : "Couldn't load your leads.");
        setState("error");
      });
    return () => {
      alive = false;
    };
  }, [pipeline]);

  const counts = useMemo(
    () => Object.fromEntries(LEAD_STATUSES.map((s) => [s, leads.filter((l) => l.status === s).length])) as Record<LeadStatus, number>,
    [leads],
  );
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter(
      (l) => (filter === "all" || l.status === filter) && (!q || `${l.company} ${l.role} ${l.location}`.toLowerCase().includes(q)),
    );
  }, [leads, filter, query]);

  async function setStatus(l: Lead, status: LeadStatus) {
    try {
      const next = await pipeline.updateLead(l.id, { status });
      setLeads((p) => p.map((x) => (x.id === next.id ? next : x)));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't update that lead.", "error");
    }
  }

  async function promote(l: Lead) {
    try {
      const made = await tracker.create({
        company: l.company,
        role: l.role,
        track: l.track,
        status: "Applied",
        date_applied: today,
        last_contact: today,
        oa_received: false,
        interviews_done: 0,
        latest_update: "Applied from a lead",
        link: l.url,
        notes: l.fit_note,
        action_needed: "",
        action_due: null,
      });
      await tracker.addEvent({ application_id: made.id, event_date: today, kind: "Applied", details: l.role || "Applied from a lead" }).catch(() => undefined);
      const next = await pipeline.updateLead(l.id, { status: "Applied" });
      setLeads((p) => p.map((x) => (x.id === next.id ? next : x)));
      toast(`${l.company} is in your tracker`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't promote that lead.", "error");
    }
  }

  async function save(input: LeadInput) {
    try {
      if (form.editing) {
        const next = await pipeline.updateLead(form.editing.id, input);
        setLeads((p) => p.map((x) => (x.id === next.id ? next : x)));
        toast("Lead saved");
      } else {
        if (leads.some((l) => leadKey(l) === leadKey(input))) {
          toast("That company + role is already in your leads.", "error");
          return;
        }
        const made = await pipeline.createLead(input);
        setLeads((p) => [made, ...p]);
        toast(`Added ${made.company} to your leads`);
      }
      setForm({ open: false, editing: null });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save that lead.", "error");
    }
  }

  async function remove(l: Lead) {
    try {
      await pipeline.removeLead(l.id);
      setLeads((p) => p.filter((x) => x.id !== l.id));
      setConfirmDelete(null);
      toast(`Deleted ${l.company}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't delete that lead.", "error");
    }
  }

  if (state === "error") {
    return (
      <main className="gutter mx-auto w-full max-w-[1180px] pb-16 pt-6">
        <Panel title="Your leads didn't load">
          <p className="text-sm text-muted">{loadError}</p>
        </Panel>
      </main>
    );
  }

  return (
    <main className="gutter rise mx-auto flex w-full max-w-[1180px] flex-col gap-4 pb-16 pt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-[28px]">Leads</h1>
          <p className="mt-1 max-w-[68ch] text-sm text-muted">
            Roles worth a decision, before they become applications. Save finds from the job board, queue the good ones,
            and promote the ones you apply to — applying itself always happens on the company&apos;s own site.
          </p>
        </div>
        <button className={btn.primary} onClick={() => setForm({ open: true, editing: null })}>+ Add lead</button>
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <button
          onClick={() => setFilter("all")}
          aria-pressed={filter === "all"}
          className={cx("whitespace-nowrap rounded-full border px-3 py-1.5 font-mono text-xs transition", filter === "all" ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-ink")}
        >
          All <span className="tnum opacity-70">{leads.length}</span>
        </button>
        {LEAD_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            aria-pressed={filter === s}
            className={cx("whitespace-nowrap rounded-full border px-3 py-1.5 font-mono text-xs transition", filter === s ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-ink")}
          >
            {s} <span className="tnum opacity-70">{counts[s]}</span>
          </button>
        ))}
        <input
          type="search"
          className={cx(field, "ml-auto w-52 shrink-0")}
          placeholder="Search leads"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search leads"
        />
      </div>

      <Panel>
        {state === "loading" ? (
          <div className="flex flex-col gap-2" aria-hidden="true">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-surface-2" style={{ width: `${90 - i * 8}%` }} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            {leads.length === 0
              ? "No leads yet. Swipe some roles on Find jobs and save them here, or add one by hand."
              : "No leads match this filter."}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((l) => (
              <li key={l.id} className="grid grid-cols-1 gap-2 py-3 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold">{l.company}</span>
                    <LeadPill status={l.status} />
                    {l.track && <Tag tone="muted">{l.track}</Tag>}
                    <span className="tnum font-mono text-xs text-faint">Found {fmtDate(l.date_found)}</span>
                  </p>
                  <p className="mt-0.5 truncate text-sm text-muted">
                    {l.role || "Role not set"}
                    {l.location && <> · {l.location}</>}
                    {l.pay && <> · {l.pay}</>}
                    {l.source && <> · via {l.source}</>}
                  </p>
                  {l.fit_note && <p className="mt-0.5 text-sm">{l.fit_note}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {l.url && (
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className={btn.secondary}>Open posting</a>
                  )}
                  {l.status !== "Applied" ? (
                    <button className={btn.primary} onClick={() => promote(l)}>I applied — track it</button>
                  ) : (
                    <Tag tone="muted">In tracker</Tag>
                  )}
                  <select
                    aria-label={`Status for ${l.company}`}
                    className="rounded-lg border border-line bg-surface px-2 py-2 text-sm text-ink"
                    value={l.status}
                    onChange={(e) => setStatus(l, e.target.value as LeadStatus)}
                  >
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <button className={btn.ghost} onClick={() => setForm({ open: true, editing: l })}>Edit</button>
                  {confirmDelete === l.id ? (
                    <>
                      <button className={btn.danger} onClick={() => remove(l)}>Delete?</button>
                      <button className={btn.ghost} onClick={() => setConfirmDelete(null)}>Keep</button>
                    </>
                  ) : (
                    <button className={btn.ghost} onClick={() => setConfirmDelete(l.id)}>Delete</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {form.open && (
        <LeadForm
          key={form.editing?.id ?? "new"}
          initial={form.editing ? leadInputOf(form.editing) : emptyLead(today)}
          editing={!!form.editing}
          onClose={() => setForm({ open: false, editing: null })}
          onSave={save}
        />
      )}
      {toastNode}
    </main>
  );
}

function leadInputOf(l: Lead): LeadInput {
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = l;
  return rest;
}

function LeadForm({ initial, editing, onClose, onSave }: { initial: LeadInput; editing: boolean; onClose: () => void; onSave: (v: LeadInput) => Promise<void> }) {
  const [v, setV] = useState<LeadInput>(initial);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof LeadInput>(k: K, val: LeadInput[K]) => setV((p) => ({ ...p, [k]: val }));
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="lead-title">
      <button aria-label="Close" className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} />
      <form
        className="relative m-4 max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await onSave({ ...v, company: v.company.trim() });
          setBusy(false);
        }}
      >
        <h2 id="lead-title" className="font-display text-lg font-bold">{editing ? "Edit lead" : "Add a lead"}</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            Company *
            <input className={field} required maxLength={200} value={v.company} onChange={(e) => set("company", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            Role
            <input className={field} maxLength={300} value={v.role} onChange={(e) => set("role", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            Track
            <select className={field} value={v.track} onChange={(e) => set("track", e.target.value as LeadInput["track"])}>
              {TRACKS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            Status
            <select className={field} value={v.status} onChange={(e) => set("status", e.target.value as LeadStatus)}>
              {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            Location
            <input className={field} maxLength={200} value={v.location} onChange={(e) => set("location", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            Pay (as posted)
            <input className={field} maxLength={120} value={v.pay} onChange={(e) => set("pay", e.target.value)} placeholder="$48/hr" />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted sm:col-span-2">
            Posting link
            <input className={field} type="url" maxLength={2000} value={v.url} onChange={(e) => set("url", e.target.value)} placeholder="https://…" />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            Source
            <input className={field} maxLength={120} value={v.source} onChange={(e) => set("source", e.target.value)} placeholder="Job board, referral…" />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            Date found
            <input className={field} type="date" value={v.date_found} onChange={(e) => set("date_found", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted sm:col-span-2">
            Fit note
            <textarea className={field} rows={3} maxLength={1000} value={v.fit_note} onChange={(e) => set("fit_note", e.target.value)} placeholder="Why this one fits — or why it doesn't" />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={btn.secondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={btn.primary} disabled={busy || !v.company.trim()}>{busy ? "Saving…" : "Save lead"}</button>
        </div>
      </form>
    </div>
  );
}
