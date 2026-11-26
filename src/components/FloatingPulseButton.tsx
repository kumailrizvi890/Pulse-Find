"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PulseSprite, pulseSpriteSrc, type PulsePose } from "@/components/PulseSprite";
import { IconX } from "@/components/icons";
import {
  PULSE_DOCK_EVENT,
  PULSE_RETURNED_EVENT,
  PULSE_UNDOCK_EVENT,
  type PulseDockDetail,
} from "@/lib/pulse-bear-events";

/**
 * Pulse as a floating assistant (Nov 23 2026: the mascot, not the orb):
 * a little Pulse standing bottom-right on every page, bobbing gently,
 * (Nov 25 2026: the docked corner Pulse made ~1.5x bigger at Kumail's
 * word, 132px on desktop, ~1.35x on phones so he stays in proportion;
 * the flight reads the button's live rect, so it lands on the new
 * size with no animation change.)
 * waving when you hover, with the waiting-count badge. On the landing
 * page he starts in the hero: when the hero Pulse scrolls away he flies
 * down into the corner and shrinks, lands with a squash and a wave, and
 * says hi once per visit; scroll back up and he flies home to the hero.
 * The poses are pre-rendered sprites of the real 3D model (see
 * PulseSprite), so no page pays for a second WebGL scene.
 *
 * Previously: one red 3D crystal, bottom-right, on
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
.pf-mini-shadow {
  background: radial-gradient(ellipse at center, rgba(248, 52, 62, 0.55), rgba(0, 0, 0, 0.45) 45%, transparent 72%);
  animation: pf-mini-shadow 3.2s ease-in-out infinite;
}
@keyframes pf-mini-shadow {
  0%, 100% { transform: translateX(-50%) scale(1); opacity: 0.9; }
  50% { transform: translateX(-50%) scale(0.82); opacity: 0.6; }
}
@keyframes pf-mini-land {
  0% { transform: scale(1.08, 0.86); }
  45% { transform: scale(0.94, 1.08); }
  100% { transform: scale(1, 1); }
}
.pf-mini-land { animation: pf-mini-land 0.5s cubic-bezier(0.22, 1, 0.36, 1); transform-origin: 50% 100%; }
@keyframes pf-mini-ring {
  0% { transform: translateX(-50%) scale(0.4); opacity: 0.9; }
  100% { transform: translateX(-50%) scale(1.9); opacity: 0; }
}
.pf-mini-ring { border: 2px solid rgba(253, 88, 93, 0.8); animation: pf-mini-ring 0.7s ease-out forwards; }
@keyframes pf-mini-hi {
  0% { opacity: 0; transform: translateY(8px) scale(0.85); }
  12% { opacity: 1; transform: translateY(0) scale(1); }
  88% { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(-4px) scale(0.96); }
}
.pf-mini-hi { animation: pf-mini-hi 3.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
@media (prefers-reduced-motion: reduce) {
  .pf-assistant-float, .pf-assistant-glow, .pf-mini-shadow, .pf-mini-land, .pf-mini-ring, .pf-mini-hi { animation: none; }
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
  // On the landing page Pulse starts in the hero and only lives in the
  // corner once he has flown down; everywhere else he is docked.
  const onLanding = pathname === "/";
  const [landed, setLanded] = useState(false);
  const docked = !onLanding || landed;
  const [flying, setFlying] = useState(false);
  const [landKey, setLandKey] = useState(0);
  const [hi, setHi] = useState(false);
  const [pose, setPose] = useState<PulsePose>("idle");
  const btnRef = useRef<HTMLButtonElement>(null);

  // Pre-load every pose so hover and landing never flash.
  useEffect(() => {
    for (const p of ["idle", "wave", "happy", "think", "talk"] as PulsePose[]) {
      const img = new window.Image();
      img.src = pulseSpriteSrc(p);
    }
  }, []);

  useEffect(() => {
    if (!onLanding) return;
    // Back on the landing page: Pulse starts in the hero again.
    queueMicrotask(() => setLanded(false));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Every dock or undock starts a new trip and cancels the one before
    // it. Scrolling back up before he has reached the corner must not
    // let the old trip finish and park him there while he is already
    // back in the ship.
    let trip = 0;
    let launchTimer: number | undefined;
    let flyer: HTMLImageElement | null = null;
    // A small Pulse flies along an arc between the hero and the corner:
    // a hop up, a swoop down, shrinking (or growing on the way back),
    // a little spin, then a squash on landing.
    const fly = (hero: PulseDockDetail, dir: "dock" | "undock", done: () => void) => {
      const btn = btnRef.current;
      const myTrip = trip;
      if (reduced || !btn) return done();
      // Frame-by-frame flight between the hero pod and the corner. Both
      // ends are re-read every frame (the pod moves while the page is
      // still scrolling), so he always lands exactly on target.
      const heroSpot = () => {
        const r = hero.live ? hero.live() : hero;
        return { x: r.left + r.width / 2, y: r.top + r.height * 0.5, size: r.height * 0.62 };
      };
      const cornerSpot = () => {
        const r = btn.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, size: r.height };
      };
      const img = document.createElement("img");
      img.src = pulseSpriteSrc("happy");
      img.alt = "";
      Object.assign(img.style, {
        position: "fixed", left: "0px", top: "0px", width: "100px", height: "100px", zIndex: "70",
        pointerEvents: "none", willChange: "transform", transformOrigin: "50% 50%",
        filter: "drop-shadow(0 10px 18px rgba(248,52,62,0.45))",
      } as CSSStyleDeclaration);
      document.body.appendChild(img);
      flyer = img;
      const DURATION = 1000;
      const start = performance.now();
      const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
      const step = (now: number) => {
        // A newer trip took over: drop this one without finishing it.
        if (myTrip !== trip) {
          img.remove();
          return;
        }
        const raw = Math.min(1, (now - start) / DURATION);
        const t = ease(raw);
        const a = dir === "dock" ? heroSpot() : cornerSpot();
        const b = dir === "dock" ? cornerSpot() : heroSpot();
        // A quadratic arc with a hop: the control point sits above the
        // midpoint, so he rises, then swoops down onto the target.
        const cx = (a.x + b.x) / 2 + 30;
        const cy = Math.min(a.y, b.y) - 110;
        const x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * cx + t * t * b.x;
        const y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * cy + t * t * b.y;
        const size = a.size + (b.size - a.size) * t;
        const spin = Math.sin(raw * Math.PI) * (dir === "dock" ? -16 : 16);
        // A small squash as he touches down.
        const squash = raw > 0.86 ? Math.sin(((raw - 0.86) / 0.14) * Math.PI) * 0.12 : 0;
        img.style.transform = `translate(${(x - size / 2).toFixed(1)}px, ${(y - size / 2).toFixed(1)}px) rotate(${spin.toFixed(1)}deg) scale(${(1 + squash).toFixed(3)}, ${(1 - squash).toFixed(3)})`;
        img.style.width = `${size.toFixed(1)}px`;
        img.style.height = `${size.toFixed(1)}px`;
        if (raw < 1) requestAnimationFrame(step);
        else {
          img.remove();
          if (flyer === img) flyer = null;
          done();
        }
      };
      requestAnimationFrame(step);
    };
    const onDock = (e: Event) => {
      const from = (e as CustomEvent<PulseDockDetail>).detail;
      const myTrip = ++trip;
      window.clearTimeout(launchTimer);
      flyer?.remove();
      setFlying(true);
      // Launch a beat later, as the pod's glass lid swings open, so he
      // visibly hops out of it.
      const launch = (go: () => void) => (reduced ? go() : (launchTimer = window.setTimeout(go, 320)));
      launch(() => fly(from, "dock", () => {
        if (myTrip !== trip) return;
        setFlying(false);
        setLanded(true);
        setLandKey((k) => k + 1);
        setPose("wave");
        window.setTimeout(() => setPose("idle"), 1600);
        if (!sessionStorage.getItem("pf-mini-hi")) {
          sessionStorage.setItem("pf-mini-hi", "1");
          setHi(true);
          window.setTimeout(() => setHi(false), 3400);
        }
      }));
    };
    const onUndock = (e: Event) => {
      const to = (e as CustomEvent<PulseDockDetail>).detail;
      const myTrip = ++trip;
      window.clearTimeout(launchTimer);
      flyer?.remove();
      setHi(false);
      setLanded(false);
      setFlying(true);
      fly(to, "undock", () => {
        if (myTrip !== trip) return;
        setFlying(false);
        window.dispatchEvent(new CustomEvent(PULSE_RETURNED_EVENT));
      });
    };
    window.addEventListener(PULSE_DOCK_EVENT, onDock);
    window.addEventListener(PULSE_UNDOCK_EVENT, onUndock);
    return () => {
      trip++;
      window.clearTimeout(launchTimer);
      flyer?.remove();
      window.removeEventListener(PULSE_DOCK_EVENT, onDock);
      window.removeEventListener(PULSE_UNDOCK_EVENT, onUndock);
    };
  }, [onLanding]);

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

  // Open chat: a compact round close control, as before.
  if (open) {
    return (
      <>
        <style>{ASSISTANT_CSS}</style>
        <button
          type="button"
          onClick={onClick}
          aria-label="Close chat"
          aria-expanded={open}
          className="pf-assistant-btn fixed bottom-5 right-[432px] z-[60] flex h-14 w-14 items-center justify-center rounded-full border border-accent/40 bg-surface-2 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.85),0_0_28px_-4px_rgba(248,52,62,0.6)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-lg:hidden"
        >
          <IconX className="h-6 w-6 text-ink" />
        </button>
      </>
    );
  }

  return (
    <>
      <style>{ASSISTANT_CSS}</style>
      <button
        ref={btnRef}
        type="button"
        onClick={onClick}
        onPointerMove={onPointerMove}
        onPointerEnter={() => setPose("wave")}
        onPointerLeave={() => {
          onPointerLeave();
          setPose("idle");
        }}
        aria-label="Chat with Pulse"
        aria-expanded={open}
        style={{
          transform: `perspective(600px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          visibility: docked && !flying ? "visible" : "hidden",
        }}
        className="pf-assistant-btn fixed bottom-2 right-2 z-[60] h-[130px] w-[120px] rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:bottom-3 sm:right-3 sm:h-[144px] sm:w-[132px]"
      >
        <span aria-hidden="true" className="pf-mini-shadow absolute bottom-[8px] left-1/2 h-4 w-[76px] rounded-full sm:bottom-[9px] sm:h-[18px] sm:w-[84px]" />
        {landKey > 0 && <span key={`ring-${landKey}`} aria-hidden="true" className="pf-mini-ring absolute bottom-[3px] left-1/2 h-8 w-[88px] rounded-full sm:h-9 sm:w-24" />}
        <span className="pf-assistant-float absolute inset-x-0 bottom-[8px] flex justify-center">
          <span key={`land-${landKey}`} className={landKey > 0 ? "pf-mini-land block" : "block"}>
            <PulseSprite pose={pose} className="h-[120px] w-[120px] object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.6)] sm:h-[132px] sm:w-[132px]" />
          </span>
        </span>
        {waiting > 0 && (
          <span className="pf-bell-count" aria-label={`${waiting} things waiting on you`}>
            {waiting > 99 ? "99" : waiting}
          </span>
        )}
      </button>
      {hi && docked && (
        <span
          aria-live="polite"
          className="pf-mini-hi pointer-events-none fixed bottom-[144px] right-4 z-[61] whitespace-nowrap rounded-2xl rounded-br-md bg-[#f4f2f7] px-3.5 py-2 text-[13px] font-bold text-[#17151c] shadow-[0_10px_30px_rgba(0,0,0,0.45)] sm:bottom-[162px]"
        >
          Hi! Ask me anything.
        </span>
      )}
    </>
  );
}
