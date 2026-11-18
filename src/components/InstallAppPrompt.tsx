"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { PulseMark } from "@/components/Logo";
import { IconX } from "@/components/icons";

/**
 * One-click access: when the browser says the app is installable, offer
 * a small Install pill; on iPhones and iPads (no install event there)
 * show the Add to Home Screen steps instead. A quiet pill at the
 * bottom-left, never a blocking modal, and it stays dismissed once the
 * visitor says no. It never shows while the tour is running or on the
 * sign-in pages, and it hides itself once the app is installed.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "pulse-find-install-dismissed";
const INSTALLED_KEY = "pulse-find-install-done";

const AUTH_ROUTES = ["/login", "/signup", "/forgot-password"];

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  // iPadOS reports itself as a Mac, so check for touch points too.
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function readStored(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function store(key: string): void {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Private mode or blocked storage: the pill just shows again.
  }
}

export function InstallAppPrompt() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<"hidden" | "install" | "ios">("hidden");

  useEffect(() => {
    if (isStandalone() || readStored(DISMISSED_KEY) || readStored(INSTALLED_KEY)) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setMode("install");
    };
    const onInstalled = () => {
      store(INSTALLED_KEY);
      setMode("hidden");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // iPhones and iPads never fire beforeinstallprompt, so offer the
    // manual steps instead once the page has settled.
    let timer: number | undefined;
    if (isIOS()) {
      timer = window.setTimeout(() => {
        if (!deferredPrompt.current) setMode("ios");
      }, 1500);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  const dismiss = useCallback(() => {
    store(DISMISSED_KEY);
    setMode("hidden");
  }, []);

  const install = useCallback(async () => {
    const promptEvent = deferredPrompt.current;
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") store(INSTALLED_KEY);
    else store(DISMISSED_KEY);
    deferredPrompt.current = null;
    setMode("hidden");
  }, []);

  // The tour owns the screen while it runs, and auth pages have no
  // tracker to install yet, so the pill stays out of the way there.
  if (mode === "hidden") return null;
  if (searchParams.get("tour") !== null) return null;
  if (AUTH_ROUTES.includes(pathname)) return null;

  return (
    <div
      role="status"
      className="fixed bottom-5 left-5 z-[55] flex max-w-[calc(100vw-2.5rem)] items-center gap-3 rounded-2xl border border-line bg-surface-2 px-3.5 py-3 shadow-panel"
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
