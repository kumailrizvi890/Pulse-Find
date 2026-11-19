import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// One-click access (PWA, Nov 18 2026): visitors install Pulse Find to
// their home screen or desktop and it opens straight to their tracker
// (/app), no app store, no landing page in the way. The manifest, the
// minimal service worker, the install pill and the /app deep link are
// pinned here so a later edit cannot silently drop installability or
// let the worker cache app data.

const repoRoot = join(__dirname, "..", "..", "..");
const readSrc = (rel: string): string =>
  readFileSync(join(repoRoot, "src", ...rel.split("/")), "utf8");
const readPublic = (rel: string): string =>
  readFileSync(join(repoRoot, "public", ...rel.split("/")), "utf8");
const manifest = JSON.parse(readPublic("manifest.webmanifest")) as {
  name: string;
  short_name: string;
  id?: string;
  start_url: string;
  scope?: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
};

function pngSize(rel: string): { width: number; height: number } {
  const buf = readFileSync(join(repoRoot, "public", ...rel.split("/")));
  expect(buf.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("PWA manifest", () => {
  it("names the app and opens straight to the tracker", () => {
    expect(manifest.name).toBe("Pulse Find");
    expect(manifest.short_name).toBe("Pulse Find");
    expect(manifest.start_url).toBe("/app");
    expect(manifest.id).toBe("/app");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
  });

  it("uses the app's dark theme colors, not a default white", () => {
    expect(manifest.background_color).toBe("#0d0c10");
    expect(manifest.theme_color).toBe("#0d0c10");
  });

  it("ships local 192 and 512 icons, including a maskable one", () => {
    const bySizes = (sizes: string) => manifest.icons.filter((i) => i.sizes === sizes);
    expect(bySizes("192x192")).toHaveLength(1);
    expect(bySizes("512x512").length).toBeGreaterThanOrEqual(1);
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith("/icons/")).toBe(true);
      expect(icon.src.startsWith("http")).toBe(false);
      expect(icon.type).toBe("image/png");
      expect(existsSync(join(repoRoot, "public", ...icon.src.slice(1).split("/")))).toBe(true);
    }
  });

  it("icon files are real PNGs at the sizes the manifest claims", () => {
    expect(pngSize("icons/icon-192.png")).toEqual({ width: 192, height: 192 });
    expect(pngSize("icons/icon-512.png")).toEqual({ width: 512, height: 512 });
    expect(pngSize("icons/apple-touch-icon.png")).toEqual({ width: 180, height: 180 });
  });
});

describe("service worker", () => {
  const sw = readPublic("sw.js");

  it("exists and precaches the manifest and icons", () => {
    expect(sw).toContain('"/manifest.webmanifest"');
    expect(sw).toContain('"/icons/icon-192.png"');
    expect(sw).toContain('"/icons/icon-512.png"');
    expect(sw).toContain("skipWaiting");
  });

  it("only ever handles same-origin GET requests", () => {
    expect(sw).toContain('request.method !== "GET"');
    expect(sw).toContain("url.origin !== self.location.origin");
  });

  it("never caches API traffic, pages, or app data", () => {
    expect(sw).toContain('url.pathname.startsWith("/api/")');
    // Cache-first is gated to the static list only.
    expect(sw).toContain('"/_next/static/"');
    expect(sw).toContain('"/icons/"');
    expect(sw).not.toContain("supabase");
    // No cache rule names the tracker route (the quoted form, so the
    // apple-touch-icon filename cannot trip the check).
    expect(sw).not.toContain('"/app"');
  });
});

describe("service worker registration", () => {
  const register = readSrc("components/ServiceWorkerRegister.tsx");

  it("registers /sw.js everywhere except local dev, and never blocks the page", () => {
    expect(register).toContain('"use client"');
    expect(register).toContain('navigator.serviceWorker.register("/sw.js")');
    expect(register).toContain('"localhost"');
    expect(register).toContain(".catch(() => {})");
  });

  it("is mounted in the root layout, so it runs on every page", () => {
    const layout = readSrc("app/layout.tsx");
    expect(layout).toContain('from "@/components/ServiceWorkerRegister"');
    expect(layout).toContain("<ServiceWorkerRegister />");
  });
});

describe("install prompt", () => {
  const prompt = readSrc("components/InstallAppPrompt.tsx");
  const capture = readSrc("lib/install-prompt.ts");

  it("captures beforeinstallprompt once in the shared module and offers a plain Install button", () => {
    // The capture lives in @/lib/install-prompt, shared with the tour
    // window's Get the app row, so prompt() is called at most once and
    // the two surfaces never race each other for the same event.
    expect(capture).toContain('"beforeinstallprompt"');
    expect(capture).toContain("preventDefault()");
    expect(capture).toContain(".prompt()");
    expect(capture).toContain("userChoice");
    expect(prompt).toContain('"use client"');
    expect(prompt).toContain('from "@/lib/install-prompt"');
    expect(prompt).toContain("Install app");
    expect(prompt).toContain("Get the app. Your tracker, one tap away.");
  });

  it("shows the Add to Home Screen steps on iPhones and iPads", () => {
    expect(prompt).toContain("iPhone");
    expect(prompt).toContain("Add to Home Screen");
    expect(prompt).toContain("Tap Share, then Add to Home Screen.");
    expect(prompt).toContain("Got it");
  });

  it("is a quiet pill, never a blocking modal, and a miss never loses the install path", () => {
    // Dismissing hides the pill for the session only: a missed pill
    // comes back on the next visit instead of being lost forever. Once
    // installed it never shows again (localStorage, permanent).
    expect(prompt).not.toContain("fixed inset-0");
    expect(prompt).toContain("fixed bottom-5 left-5");
    expect(prompt).toContain("pulse-find-install-dismissed");
    expect(prompt).toContain("sessionStorage");
    expect(prompt).toContain("pulse-find-install-done");
    expect(prompt).toContain("localStorage");
    expect(prompt).toContain('aria-label="Dismiss"');
  });

  it("hides itself once installed, while the tour is open, and on auth pages", () => {
    expect(capture).toContain("display-mode: standalone");
    expect(prompt).toContain('"appinstalled"');
    expect(prompt).toContain("TOUR_OPEN_EVENT");
    expect(prompt).toContain("TOUR_CLOSE_EVENT");
    expect(prompt).toContain('"/login"');
  });

  it("is mounted in the root layout, inside Suspense like the other floating UI", () => {
    const layout = readSrc("app/layout.tsx");
    expect(layout).toContain('from "@/components/InstallAppPrompt"');
    expect(layout).toContain("<InstallAppPrompt />");
  });
});

describe("PWA metadata in the root layout", () => {
  const layout = readSrc("app/layout.tsx");

  it("links the manifest and the Apple touch icon, with the dark theme color", () => {
    expect(layout).toContain('manifest: "/manifest.webmanifest"');
    expect(layout).toContain('apple: "/icons/apple-touch-icon.png"');
    expect(layout).toContain("appleWebApp");
    expect(layout).toContain('color: "#0d0c10"');
  });
});

describe("/app deep link", () => {
  it("sends signed-out visitors to login and back to /app, so the installed app opens on the tracker", () => {
    const appPage = readSrc("app/app/page.tsx");
    expect(appPage).toContain('redirect("/login?next=/app")');
  });

  it("the proxy gate sends signed-out visitors from /app to login and back, and signed-in users from /login to /app", () => {
    const proxy = readSrc("proxy.ts");
    expect(proxy).toContain('path.startsWith("/app")');
    expect(proxy).toContain('url.pathname = "/login"');
    expect(proxy).toContain('url.searchParams.set("next", path)');
    expect(proxy).toContain('url.pathname = "/app"');
  });

  it("the manifest start_url matches that deep link", () => {
    expect(manifest.start_url).toBe("/app");
  });
});
