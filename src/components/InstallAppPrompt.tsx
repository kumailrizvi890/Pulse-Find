"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PulseMark } from "@/components/Logo";
import { IconX } from "@/components/icons";
import {
  ensureInstallPromptListener,
  getInstallPrompt,
  isIOSDevice,
  isStandaloneMode,
  promptInstall,
  subscribeInstallPrompt,
} from "@/lib/install-prompt";

/**
 * One-click access: when the browser says the app is installable, offer
 * a small Install pill; on iPhones and iPads (no install event there)
 * show the Add to Home Screen steps instead. A quiet pill at the
 * bottom-left, never a blocking modal. Dismissing hides it for the
 * session only, so a missed pill comes back on the next visit instead
 * of being lost forever; once installed it never shows again. It never
 * shows on the sign-in pages, and it hides itself once the app is
 * installed.
 *
 * The install prompt itself is captured once in @/lib/install-prompt,
 * shared with the landing's Get the app section, so prompt() is called
 * at most once and the two surfaces never race for the same event.
 */

const DISMISSED_KEY = "pulse-find-install-dismissed";
const INSTALLED_KEY = "pulse-find-install-done";

const AUTH_ROUTES = ["/login", "/signup", "/forgot-password"];

function readStored(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function storeLocal(key: string): void {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Private mode or blocked storage: the pill just shows again.
  }
}

function readSession(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function storeSession(key: string): void {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // Private mode or blocked storage: the pill just shows again.
  }
}

export function InstallAppPrompt() {
  const pathname = usePathname();
  const [mode, setMode] = useState<"hidden" | "install" | "ios">("hidden");

  useEffect(() => {
    if (isStandaloneMode() || readStored(INSTALLED_KEY) || readSession(DISMISSED_KEY)) return;
    ensureInstallPromptListener();
    const sync = () => {
      if (getInstallPrompt()) setMode("install");
      else if (!isIOSDevice()) setMode("hidden");
    };
    sync();
    const unsub = subscribeInstallPrompt(sync);
    // iPhones and iPads never fire beforeinstallprompt, so offer the
    // manual steps instead once the page has settled.
    let timer: number | undefined;
    if (isIOSDevice()) {
      timer = window.setTimeout(() => {
        if (!getInstallPrompt()) setMode("ios");
      }, 1500);
    }
    const onInstalled = () => {
      storeLocal(INSTALLED_KEY);
      setMode("hidden");
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      unsub();
      window.removeEventListener("appinstalled", onInstalled);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  const dismiss = useCallback(() => {
    storeSession(DISMISSED_KEY);
    setMode("hidden");
  }, []);

  const install = useCallback(async () => {
    const outcome = await promptInstall();
    if (outcome === "accepted") storeLocal(INSTALLED_KEY);
    else if (outcome === "dismissed") storeSession(DISMISSED_KEY);
    setMode("hidden");
  }, []);

  // Auth pages have no tracker to install yet, so the pill stays out
  // of the way there.
  if (mode === "hidden") return null;
  if (AUTH_ROUTES.includes(pathname)) return null;

  return (
    <div
      role="status"
      className="fixed bottom-5 left-5 z-[55] flex max-w-[calc(100vw-7.5rem)] sm:max-w-[calc(100vw-2.5rem)] items-center gap-3 rounded-2xl border border-line bg-surface-2 px-3.5 py-3 shadow-panel"
    >
      <PulseMark className="h-6 w-6 shrink-0" />
      <p className="min-w-0 text-sm leading-snug text-ink">
        {mode === "install" ? (
          <>Get the app. Your tracker, one tap away.</>
        ) : (
          <>Add to Home Screen. Tap Share, then Add to Home Screen.</>
        )}
      </p>
      {mode === "install" ? (
        <button
          type="button"
          onClick={install}
          className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink transition hover:brightness-110"
        >
          Install app
        </button>
      ) : (
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-muted transition hover:text-accent"
        >
          Got it
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-lg p-1 text-faint transition hover:text-accent"
      >
        <IconX className="h-4 w-4" />
      </button>
    </div>
  );
}
