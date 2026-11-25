"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { buildBookmarkletUrl } from "@/lib/bookmarklet";

/**
 * Install page for the one-click save bookmarklet: drag the link to the
 * bookmarks bar, then click it on any job posting to land on /save with
 * the posting prefilled. The href is set from a ref after mount —
 * React will not render a `javascript:` URL straight from JSX.
 */
export default function BookmarkletPage() {
  const bookmarkletUrl = buildBookmarkletUrl();
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    linkRef.current?.setAttribute("href", bookmarkletUrl);
  }, [bookmarkletUrl]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(bookmarkletUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the drag path above still works.
    }
  }

  return (
    <div className="pf-shell relative min-h-dvh">
      <header className="gutter relative z-10 mx-auto flex h-14 w-full max-w-[1180px] items-center">
        <Logo href="/" />
      </header>
      <main className="gutter relative z-10 mx-auto w-full max-w-[560px] pb-16 pt-10">
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-panel">
          <h1 className="font-display text-2xl font-extrabold tracking-tight">
            Save a job in one click
          </h1>
          <p className="mt-2 text-sm text-muted">
            Drag the button below to your bookmarks bar. Then, on any job
            posting, click it and Pulse Find opens with the company, role,
            and link already filled in — confirm once and it&apos;s in your
            tracker.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a
              ref={linkRef}
              href="#"
              draggable
              onClick={(e) => e.preventDefault()}
              className="inline-flex cursor-grab items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink shadow-panel transition hover:brightness-110"
            >
              Save to Pulse Find
            </a>
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center justify-center rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-accent/50"
            >
              {copied ? "Copied!" : "Copy the link instead"}
            </button>
          </div>
          <p className="mt-4 text-sm text-muted">
            No bookmarks bar? Copy the link, add a new bookmark by hand, and
            paste it as the address. Signed out when you click it? You&apos;ll
            sign in first and land right back on the save screen.
          </p>
          <p className="mt-4 text-sm">
            <Link href="/app" className="font-semibold text-accent underline-offset-2 hover:underline">
              Back to your tracker
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
