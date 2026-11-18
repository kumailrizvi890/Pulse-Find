"use client";

import { useEffect } from "react";

/**
 * Registers the Pulse Find service worker (public/sw.js). Local
 * development only: the dev server runs on localhost, and a worker
 * there would cache dev chunks and serve stale code after edits, so
 * registration is skipped on localhost and the dev loop stays
 * worker-free. Registration never blocks the page — a failure is
 * swallowed and the app works exactly as before.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
