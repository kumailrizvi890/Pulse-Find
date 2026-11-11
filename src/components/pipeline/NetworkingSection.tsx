"use client";

import { useEffect, useMemo, useState } from "react";
import type { Contact, ContactInput } from "@/lib/types";
import { emptyContact } from "@/lib/types";
import { todayISO } from "@/lib/metrics";
import type { PipelineStore } from "@/lib/pipeline";
import { dueBucket, sortContacts, type DueBucket } from "@/lib/pipeline";
import { Panel, Tag, btn, cx, field, fmtDate, useToast } from "@/components/dashboard/ui";

const BUCKET_LABEL: Record<Exclude<DueBucket, "none">, string> = {
  overdue: "Overdue",
  today: "Due today",
  upcoming: "Due this week",
  later: "Later",
};

/**
 * Networking next-steps: who the user owes a follow-up, with the overdue and
 * due-today steps called out first — the web counterpart of the Networking
 * Tracker sheet. Tracking only: Pulse Find never messages anyone.
 */
export function NetworkingSection({ pipeline }: { pipeline: PipelineStore }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<{ open: boolean; editing: Contact | null }>({ open: false, editing: null });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const { toast, toastNode } = useToast();
  const today = todayISO();

  useEffect(() => {
    let alive = true;
    pipeline
      .loadContacts()
      .then((d) => {
        if (!alive) return;
        setContacts(d);
        setState("ready");
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setLoadError(e instanceof Error ? e.message : "Couldn't load your contacts.");
        setState("error");
      });
    return () => {
      alive = false;
    };
  }, [pipeline]);

  const sorted = useMemo(() => sortContacts(contacts, today), [contacts, today]);
  const dueCount = useMemo(
    () => contacts.filter((c) => dueBucket(c, today) === "overdue" || dueBucket(c, today) === "today").length,
    [contacts, today],
  );
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sorted.filter((c) => `${c.person_name} ${c.company} ${c.status}`.toLowerCase().includes(q)) : sorted;
  }, [sorted, query]);

  async function markDone(c: Contact) {
    try {
      const next = await pipeline.updateContact(c.id, { next_step: "", next_step_on: null });
      setContacts((p) => p.map((x) => (x.id === next.id ? next : x)));
      toast(`Done with ${c.person_name}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't update that contact.", "error");
    }
  }

  async function save(input: ContactInput) {
    try {
      if (form.editing) {
        const next = await pipeline.updateContact(form.editing.id, input);
        setContacts((p) => p.map((x) => (x.id === next.id ? next : x)));
        toast("Contact saved");
      } else {
        const made = await pipeline.createContact(input);
        setContacts((p) => [made, ...p]);
        toast(`Added ${made.person_name}`);
      }
      setForm({ open: false, editing: null });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save that contact.", "error");
    }
  }

  async function remove(c: Contact) {
    try {
      await pipeline.removeContact(c.id);
      setContacts((p) => p.filter((x) => x.id !== c.id));
      setConfirmDelete(null);
      toast(`Deleted ${c.person_name}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't delete that contact.", "error");
    }
  }

  if (state === "error") {
    return (
      <main className="gutter mx-auto w-full max-w-[1180px] pb-16 pt-6">
        <Panel title="Your contacts didn't load">
          <p className="text-sm text-muted">{loadError}</p>
        </Panel>
      </main>
    );
  }

  return (
    <main className="gutter rise mx-auto flex w-full max-w-[1180px] flex-col gap-4 pb-16 pt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-[28px]">Networking</h1>
          <p className="mt-1 max-w-[68ch] text-sm text-muted">
            People you&apos;re building real connections with, and the next step you owe each of them.
            {dueCount > 0 && <> <b className="text-danger">{dueCount} step{dueCount === 1 ? " is" : "s are"} due or overdue.</b></>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            className={cx(field, "w-52")}
            placeholder="Search people"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search people"
          />
          <button className={btn.primary} onClick={() => setForm({ open: true, editing: null })}>+ Add person</button>
        </div>
      </div>

      <Panel className={dueCount ? "border-danger/30" : undefined}>
        {state === "loading" ? (
          <div className="flex flex-col gap-2" aria-hidden="true">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-surface-2" style={{ width: `${90 - i * 8}%` }} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            {contacts.length === 0 ? "No one here yet. Add the recruiters, alumni and engineers you're in touch with." : "No one matches this search."}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((c) => {
              const bucket = dueBucket(c, today);
              return (
                <li key={c.id} className="grid grid-cols-1 gap-2 py-3 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <span className={cx("font-semibold", bucket === "overdue" && "text-danger")}>{c.person_name}</span>
                      {c.company && <span className="text-muted">· {c.company}</span>}
                      {bucket !== "none" && (
                        <Tag tone={bucket === "overdue" || bucket === "today" ? "danger" : bucket === "upcoming" ? "warn" : "muted"}>
                          {bucket === "overdue" || bucket === "today" ? BUCKET_LABEL[bucket] : `${BUCKET_LABEL[bucket]} · ${fmtDate(c.next_step_on)}`}
                        </Tag>
                      )}
                    </p>
                    {c.status && <p className="mt-0.5 text-sm text-muted">{c.status}</p>}
                    {c.next_step && (
                      <p className="mt-0.5 text-sm">
                        Next: {c.next_step}
                        {c.next_step_on && bucket === "later" && <span className="text-faint"> · {fmtDate(c.next_step_on)}</span>}
                      </p>
                    )}
                    {c.notes && <p className="mt-0.5 truncate text-xs text-faint">{c.notes}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {c.next_step && <button className={btn.secondary} onClick={() => markDone(c)}>Step done</button>}
                    <button className={btn.ghost} onClick={() => setForm({ open: true, editing: c })}>Edit</button>
                    {confirmDelete === c.id ? (
                      <>
                        <button className={btn.danger} onClick={() => remove(c)}>Delete?</button>
                        <button className={btn.ghost} onClick={() => setConfirmDelete(null)}>Keep</button>
                      </>
                    ) : (
                      <button className={btn.ghost} onClick={() => setConfirmDelete(c.id)}>Delete</button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {form.open && (
        <ContactForm
          key={form.editing?.id ?? "new"}
          initial={form.editing ? contactInputOf(form.editing) : emptyContact()}
          editing={!!form.editing}
          onClose={() => setForm({ open: false, editing: null })}
          onSave={save}
        />
      )}
      {toastNode}
    </main>
  );
}

function contactInputOf(c: Contact): ContactInput {
  const { id: _id, created_at: _cr, updated_at: _u, ...rest } = c;
  return rest;
}

function ContactForm({ initial, editing, onClose, onSave }: { initial: ContactInput; editing: boolean; onClose: () => void; onSave: (v: ContactInput) => Promise<void> }) {
  const [v, setV] = useState<ContactInput>(initial);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ContactInput>(k: K, val: ContactInput[K]) => setV((p) => ({ ...p, [k]: val }));
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="contact-title">
      <button aria-label="Close" className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} />
      <form
        className="relative m-4 max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await onSave({ ...v, person_name: v.person_name.trim() });
          setBusy(false);
        }}
      >
        <h2 id="contact-title" className="font-display text-lg font-bold">{editing ? "Edit person" : "Add a person"}</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            Name *
            <input className={field} required maxLength={120} value={v.person_name} onChange={(e) => set("person_name", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            Company
            <input className={field} maxLength={200} value={v.company} onChange={(e) => set("company", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted sm:col-span-2">
            Status
            <input className={field} maxLength={200} value={v.status} onChange={(e) => set("status", e.target.value)} placeholder="Connected — thanked Nov 4" />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted sm:col-span-2">
            Next step
            <input className={field} maxLength={500} value={v.next_step} onChange={(e) => set("next_step", e.target.value)} placeholder="Week 2 value touch: one strength + one fix" />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            Next step date
            <input className={field} type="date" value={v.next_step_on ?? ""} onChange={(e) => set("next_step_on", e.target.value === "" ? null : e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted sm:col-span-2">
            Notes
            <textarea className={field} rows={3} maxLength={2000} value={v.notes} onChange={(e) => set("notes", e.target.value)} />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={btn.secondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={btn.primary} disabled={busy || !v.person_name.trim()}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}
