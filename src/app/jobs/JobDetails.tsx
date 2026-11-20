"use client";

import { IconExternalLink, IconX } from "@/components/icons";
import { postedAgo } from "@/lib/dates";
import { bannerStyle, initials, type DeckJob } from "./SwipeDeck";

/**
 * Details panel for the front card, synced to it: brand row, meta stack,
 * and Apply Now. The live feed carries no about text, requirements,
 * match score or HR note, so those mockup sections are left out rather
 * than invented — the panel shows only what the posting actually has.
 * Apply Now opens the company's own posting; when a posting has no URL
 * there is no button at all, never a dead link.
 */
export function JobDetails({
  job,
  onClose,
}: {
  job: DeckJob;
  onClose?: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-display text-[15px] font-bold tracking-tight">Job Details</h2>
        {onClose && (
          <button
            type="button"
            aria-label="Close details"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted transition hover:text-ink lg:hidden"
          >
            <IconX className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span
          className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl text-xl font-extrabold text-white shadow-panel"
          style={bannerStyle(job.company)}
        >
          {initials(job.company)}
        </span>
        <div className="min-w-0">
          <p className="font-display text-lg font-extrabold leading-tight tracking-tight" title={job.title}>{job.title}</p>
          <p className="truncate text-sm font-semibold text-muted" title={job.company}>{job.company}</p>
        </div>
      </div>
      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted">Location</dt>
          <dd className="text-right font-medium">{job.location || "Not listed"}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted">Posted</dt>
          <dd className="text-right font-medium">{postedAgo(job.posted_at) ?? "Not listed"}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted">Type</dt>
          <dd className="text-right font-medium">{job.track}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-1.5">
        {job.tech && <span className="rounded-full border border-accent/30 bg-accent-soft px-2.5 py-0.5 font-mono text-[11px] text-accent">Tech</span>}
        {job.remote && <span className="rounded-full border border-good/30 bg-good-soft px-2.5 py-0.5 font-mono text-[11px] text-good">Remote</span>}
        <span className="rounded-md border border-line px-2.5 py-0.5 font-mono text-[11px] text-muted">{job.track}</span>
      </div>
      {job.url ? (
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-[52px] w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-accent to-danger text-base font-bold text-white shadow-panel transition hover:opacity-90"
        >
          Apply Now <IconExternalLink className="h-4 w-4 shrink-0" />
        </a>
      ) : (
        <p className="rounded-xl border border-dashed border-line px-4 py-3 text-center text-sm text-muted">
          No posting link listed for this role.
        </p>
      )}
      <p className="text-xs leading-relaxed text-faint">
        Applying opens the company&apos;s own posting. Saving never sends an application.
      </p>
    </div>
  );
}
