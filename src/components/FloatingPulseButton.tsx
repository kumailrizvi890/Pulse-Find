"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PulseCrystal } from "@/components/PulseBrand";
import { IconX } from "@/components/icons";

/**
 * Pulse as a floating assistant: one red 3D crystal, bottom-right, on
 * every page. Clicking it opens the same Ask Pulse general chat the
 * dashboard header button opens (same TaskChatPanel, same engine, same
 * answers, same Talk to Agent handoff). This button adds no chat of
 * its own.
 *
 * How it reaches the chat: the panel lives inside Dashboard, so the
 * button talks to it with window events. It dispatches
 * "pulsefind:assistant-open" / "pulsefind:assistant-close", and
 * Dashboard answers with "pulsefind:assistant-state"
 * { open, pending, overlayOpen, waiting }. If no Dashboard answers
 * within 250ms (landing page, demo sub-pages, Jobs), the click falls
 * back to navigation: /app?chat=1 from anywhere under /app, /demo?chat=1
 * everywhere else, which opens the same chat on the tracker page.
 *
 * While the chat is open the button turns into a close control and
 * docks just left of the panel on desktop (right-[432px], clear of the
 * 400px panel and its composer); on phones it hides while the chat is
 * open, since the bottom sheet already has its own Close. While a
 * drawer is open, the button hides so it never covers a form. It also
 * hides while any modal dialog the Dashboard does not own is in the
 * DOM (lead form, contact form, Settings, Import): those never reach
 * the Dashboard's overlay state, so the button watches the DOM for
 * them itself with a MutationObserver, on top of an initial scan. The
 * chat panel itself is a modal dialog too, so it is excluded by its
 * pf-chat-panel-3d class, as is the Talk to Agent dialog inside it,
 * and the button stays visible as the chat's close control while the
 * chat is open.
 *
 * The 3D look is pure CSS 3D, no WebGL: a faceted crystal SVG with a
 * gradient and white facet lines, a breathing red halo, a soft floor
 * shadow, a gentle float, and a pointer-tracked tilt on desktop. A
 * React Three Fiber canvas for a 56px button would cost a whole 3D
 * runtime for nothing the eye could tell apart, so it stays CSS.
 * Motion is under 300ms on the design easing, and everything goes
 * static under prefers-reduced-motion.
 */

const ASSISTANT_CSS = `
@keyframes pf-assistant-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
.pf-assistant-float { animation: pf-assistant-float 3.2s ease-in-out infinite; }
@keyframes pf-assistant-glow {
  0%, 100% { opacity: 0.55; transform: scale(1); }
  50% { opacity: 0.9; transform: scale(1.08); }
}
.pf-assistant-glow {
  background: radial-gradient(circle, rgba(248, 52, 62, 0.5), transparent 68%);
  animation: pf-assistant-glow 2.8s ease-in-out infinite;
}
.pf-assistant-btn {
  transition:
    transform 0.25s cubic-bezier(0.22, 1, 0.36, 1),
    right 0.25s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.25s cubic-bezier(0.22, 1, 0.36, 1),
    background-color 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}
@media (prefers-reduced-motion: reduce) {
  .pf-assistant-float, .pf-assistant-glow { animation: none; }
  .pf-assistant-btn { transition: none; }
}
`;

type AssistantState = {
  open: boolean;
  pending: boolean;
  overlayOpen: boolean;
  waiting: number;
};

const AUTH_ROUTES = ["/login", "/signup", "/forgot-password"];

export function FloatingPulseButton() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [waiting, setWaiting] = useState(0);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const fallbackTimer = useRef<number | null>(null);

  useEffect(() => {
    const onState = (e: Event) => {
      const detail = (e as CustomEvent<AssistantState>).detail;
      if (!detail) return;
      setOpen(detail.open);
      setOverlayOpen(detail.overlayOpen);
      setWaiting(detail.waiting);
      if (detail.open || detail.pending) {
        if (fallbackTimer.current !== null) {
          window.clearTimeout(fallbackTimer.current);
          fallbackTimer.current = null;
        }
      }
    };
    window.addEventListener("pulsefind:assistant-state", onState);
    // Ask the Dashboard (if one is mounted) for its current state: its
    // first dispatch happened before this listener attached.
    window.dispatchEvent(new CustomEvent("pulsefind:assistant-ping"));
    return () => {
      window.removeEventListener("pulsefind:assistant-state", onState);
      if (fallbackTimer.current !== null) window.clearTimeout(fallbackTimer.current);
    };
  }, []);

  useEffect(() => {
    // Modal dialogs the Dashboard does not own (lead form, contact
    // form, Settings, Import) never reach overlayOpen, so watch the DOM
    // for them directly. The chat panel itself is role="dialog" too, so
    // it is excluded by its pf-chat-panel-3d class, as is the Talk to
    // Agent dialog inside the panel.
    const scan = () => {
      const foreign = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].some(
        (el) => !el.closest(".pf-chat-panel-3d")
      );
      setDialogOpen(foreign);
    };
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const onClick = useCallback(() => {
    if (open) {
      window.dispatchEvent(new CustomEvent("pulsefind:assistant-close"));
      return;
    }
    window.dispatchEvent(new CustomEvent("pulsefind:assistant-open"));
    fallbackTimer.current = window.setTimeout(() => {
      // No Dashboard answered, so there is no panel on this page to
      // open. Take the visitor to the tracker with the chat trigger
      // instead: their own tracker under /app, the demo everywhere else.
      router.push(pathname.startsWith("/app") ? "/app?chat=1" : "/demo?chat=1");
    }, 250);
  }, [open, pathname, router]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== "mouse") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ x: -py * 12, y: px * 12 });
  }, []);

  const onPointerLeave = useCallback(() => setTilt({ x: 0, y: 0 }), []);

  // Auth pages have no tracker to ask about, so the button stays out
  // of the way there.
  if (AUTH_ROUTES.includes(pathname)) return null;
  // A drawer or task chat owns the corner while open, and so does any
  // modal dialog the Dashboard does not own; the button returns once
  // it closes. The open chat keeps its close control instead.
  if ((overlayOpen || dialogOpen) && !open) return null;

  return (
    <>
      <style>{ASSISTANT_CSS}</style>
      <button
        type="button"
        onClick={onClick}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        aria-label={open ? "Close chat" : "Chat with Pulse"}
        aria-expanded={open}
        style={{ transform: `perspective(600px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}
        className={[
          "pf-assistant-btn fixed bottom-5 z-[60] flex h-14 w-14 items-center justify-center rounded-full",
          "border border-accent/40 bg-surface-2 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.85),0_0_28px_-4px_rgba(248,52,62,0.6)]",
          "hover:shadow-[0_16px_40px_-8px_rgba(0,0,0,0.9),0_0_36px_-2px_rgba(248,52,62,0.8)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          open ? "right-[432px] max-lg:hidden" : "right-5",
        ].join(" ")}
      >
        <span aria-hidden="true" className="pf-assistant-glow absolute inset-[-10px] rounded-full" />
        <span className="pf-assistant-float relative flex h-full w-full items-center justify-center">
          {open ? (
            <IconX className="h-6 w-6 text-ink" />
          ) : (
            <PulseCrystal className="h-9 w-9" />
          )}
        </span>
        {!open && waiting > 0 && (
          <span className="pf-bell-count" aria-label={`${waiting} things waiting on you`}>
            {waiting > 99 ? "99" : waiting}
          </span>
        )}
      </button>
    </>
  );
}
