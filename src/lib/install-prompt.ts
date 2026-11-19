// Shared install-prompt capture (Nov 19 2026): the browser fires
// beforeinstallprompt once per page load, and both the tour window's
// "Get the app" control and the layout's InstallAppPrompt pill need
// it. One module owns the capture so the event is stored once and
// prompt() is called at most once: the two components must never race
// each other for it, and calling .prompt() on a consumed event does
// nothing useful. iOS never fires the event, so the module also owns
// the iPhone/iPad and standalone detection both surfaces share.
// Node-safe: every function guards the missing window/navigator.

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** iPhones and iPads never fire beforeinstallprompt, so they get the
    manual Add to Home Screen steps instead. iPadOS reports itself as
    a Mac, so touch points are checked too. */
export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

/** True once the app runs installed (standalone display mode, or the
    iOS standalone flag). */
export function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

type InstallPromptListener = () => void;

let deferred: BeforeInstallPromptEvent | null = null;
let listening = false;
let consumed = false;
const listeners = new Set<InstallPromptListener>();

function notify(): void {
  listeners.forEach((fn) => fn());
}

/** Attach the one window listener, idempotently. The prompt is
    captured, never auto-fired: it only shows when the visitor taps
    "Get the app" or "Install app". */
export function ensureInstallPromptListener(): void {
  if (typeof window === "undefined" || listening) return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    if (!consumed) deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    consumed = true;
    notify();
  });
}

/** The captured prompt, or null when there is none (iOS, already
    installed, or already consumed). */
export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return consumed ? null : deferred;
}

/** Show the captured install prompt, exactly once. Returns the
    outcome, or null when there is no prompt to show. Never throws. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | null> {
  const evt = getInstallPrompt();
  if (!evt) return null;
  consumed = true;
  deferred = null;
  notify();
  try {
    await evt.prompt();
    const choice = await evt.userChoice;
    return choice.outcome;
  } catch {
    return null;
  }
}

/** Re-run fn whenever the captured prompt changes (arrives, is
    consumed, or the app is installed). Returns an unsubscribe. */
export function subscribeInstallPrompt(fn: InstallPromptListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
