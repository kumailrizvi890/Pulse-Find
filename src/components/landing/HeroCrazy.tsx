"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { PULSE_DOCK_EVENT, PULSE_POKE_EVENT, PULSE_RETURNED_EVENT, PULSE_UNDOCK_EVENT } from "@/lib/pulse-bear-events";
import { trackEvent } from "@/lib/analytics";
import { PulseSprite } from "@/components/PulseSprite";
import { morphStates, stateAt } from "@/lib/hero-morph";
import {
  deviceTier,
  dprCap,
  heroScrollFrame,
  particleAt,
  particleCount,
  particleField,
  tiltFromPointer,
} from "@/lib/hero-crazy";
import {
  GREETING_DELAY_MS,
  GREETING_MS,
  GREETING_RESUME_IDLE_MS,
  clampGreetingTime,
  crystalFaces,
  crystalLayout,
  crystalVertices,
  ecgRingPoint,
  faceNormal,
  faceShade,
  greetParticleAt,
  greetParticleCount,
  greetParticles,
  greetingPhases,
  greetingProgress,
  greetingRotation,
  project,
  rotateX,
  rotateY,
  scrubTimeDelta,
  smoothstep,
} from "@/lib/hero-greeting";
import {
  auroraShift,
  ecgOffset,
  scrollProgressLine,
  springStep,
} from "@/lib/scroll-anim";

// Hero crazy-3D (landing only, Nov 20 2026): the tame morph rebuilt
// as a showpiece, then restyled Nov 20 so it reads as designed, not
// generated. One shared rAF loop drives the scene, all motion a pure
// function of time, pointer, or scroll (see src/lib/hero-crazy.ts
// and src/lib/scroll-anim.ts):
//   1. A canvas particle field behind the hero: slow red and white
//      motes rising through the dark, drifting with the pointer at
//      0.2x parallax and with scroll at 0.2x, fading as you scroll.
//   2. A faint aurora that drifts on an 18s loop and shifts a
//      little with scroll. Atmosphere only, never a glowing wall.
//   3. The greeting (Nov 20 2026, v3): Pulse greets on welcome, then
//      stays as a live interactive 3D scene. A glowing red pulse
//      crystal assembles from orbiting particles on the hero canvas,
//      with the ECG pulse line drawing itself in 3D around it, all
//      after the same 800ms welcome delay. After the greeting,
//      horizontal pointer movement scrubs the greeting timeline
//      forward and back (delta-based, sensitivity 0.8), so visitors
//      can replay the greeting by moving the mouse; touch drag scrubs,
//      tap replays. The pointer also keeps rotating the crystal, so
//      the scene stays live either way. The headline that used to
//      scramble in with the greeting was removed Nov 24 2026; the
//      Weeks 1-3 pass adds back one plain outcome headline as DOM
//      text above the bear (no scramble, no reveal helpers). The scene is hand-rolled canvas 2.5D, not Three.js: one convex
//      crystal, a particle cloud, and a ring polyline, all real 3D
//      math in src/lib/hero-greeting.ts. No new dependencies, no
//      WebGL failure mode, DPR capped at 2, paused off-screen and on
//      tab-hide like the rest of the loop.
//   4. A live product window, not a glowing number card: window
//      chrome, a ticker cycling the demo pipeline counts (22
//      Applications, 6 Assessments, 5 Interviews, same 8s morph
//      loop as before), and real tracker rows from the demo data.
//      It tilts toward the pointer on a real spring, so it leans
//      with weight and rocks back, and it transforms as you scroll
//      instead of just fading out.
//   5. A scroll progress ECG line fixed at the top of the page: the
//      pulse line draws itself as you scroll, with a glowing dot at
//      the leading edge. A cursor glow follows the pointer, faint.
// The layout is editorial and asymmetric: the copy sits high, the
// product window sits low and overlaps the copy edge. The CTAs are
// flat on purpose, no glow: Start your tracker, Self-host, Connect
// your agent. The dashboard stays flat and professional; this page
// is the only place with any of this.
//
// No new dependencies: three / R3F are not installed, and a WebGL
// scene would put ~150KB before first paint for a backdrop. The
// field is plain canvas 2D, DPR capped at 2, paused off-screen via
// IntersectionObserver and when the tab hides. Weak devices get a
// lite field (48 motes, DPR 1) or a static gradient; reduced motion
// gets a still frame.

// Pulse in 3D (Nov 22 2026): with `mascot` on, the plush Pulse bear
// takes the left column, greeting on load and playing with the
// pointer, and the sample tracker stays on the right. There is no
// headline: the bear and the tracker do the talking (the headline
// was removed Nov 24 2026). three.js lives only in the PulseBear3D
// chunk, loaded after first paint via next/dynamic with ssr: false,
// and only when mascot is on. While the chunk loads, a pre-rendered
// Pulse stands in the same spot, so the hero is never empty
// starfield waiting on three.js.
const PulseBear3D = dynamic(() => import("./PulseBear3D"), {
  ssr: false,
  // The same pre-rendered bear the WebGL fallback shows, so the stage
  // holds a bear from the first paint instead of empty starfield
  // while the three.js chunk loads.
  loading: () => (
    <div className="pulse-bear" aria-hidden="true">
      <div className="pulse-bear-fallback">
        <PulseSprite pose="wave" className="h-80 w-80 object-contain" />
      </div>
    </div>
  ),
});

const STATES = morphStates();
const FONTSHARE_HREF =
  "https://api.fontshare.com/v2/css?f[]=clash-display@600,700&display=swap";

// Demo tracker rows (landing only): the demo companies from
// demo-data.ts, staged as the demo data stages them. Interviews
// first, then OAs, alphabetical inside each stage. Sample data
// only, never the real hunt.
const DEMO_ROWS: { company: string; stage: "Interviewing" | "OA received" }[] = [
  { company: "Atlas", stage: "Interviewing" },
  { company: "Fernhill", stage: "Interviewing" },
  { company: "Kestrel", stage: "Interviewing" },
  { company: "Oakline", stage: "Interviewing" },
  { company: "Tidewater", stage: "Interviewing" },
  { company: "Copperline", stage: "OA received" },
  { company: "Northwind", stage: "OA received" },
  { company: "Saltmarsh", stage: "OA received" },
  { company: "Verdant", stage: "OA received" },
];

// The ECG pulse path across the scroll progress line, 1200 wide.
const ECG_PATH =
  "M0 6 H140 l10-4 12 8 8-6 6 2 H320 l10-4 12 8 8-6 6 2 H500 l10-4 12 8 8-6 6 2 H680 l10-4 12 8 8-6 6 2 H860 l10-4 12 8 8-6 6 2 H1040 l10-4 12 8 8-6 6 2 H1200";

// The ECG divider under the hero copy, same pulse, small.
const ECG_DIVIDER_PATH =
  "M4 14h28l6-9 10 18 7-13 4 4h30l5-7 8 14 6-10 4 3h28l6-8 9 16 7-12 4 4h36";

export function HeroCrazy({ mascot = false }: { mascot?: boolean } = {}) {
  const sectionRef = useRef<HTMLElement>(null);
  const pulseStageRef = useRef<HTMLDivElement>(null);

  // The hand-off (Nov 23 2026): once the hero Pulse is starting to
  // scroll away (under 60% visible, so his pod and its lid are still in
  // view), he leaves the hero and the floating assistant flies a small
  // Pulse from this spot down into the corner. Scroll back and he flies
  // home; the hero shows him again once he has landed.
  useEffect(() => {
    const stage = pulseStageRef.current;
    if (!mascot || !stage) return;
    let away = false;
    const rectOf = () => {
      const r = stage.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    };
    const io = new IntersectionObserver(
      (entries) => {
        const ratio = entries[0]?.intersectionRatio ?? 1;
        if (!away && ratio < 0.6) {
          away = true;
          stage.classList.add("is-away");
          window.dispatchEvent(new CustomEvent(PULSE_DOCK_EVENT, { detail: { ...rectOf(), live: rectOf } }));
        } else if (away && ratio >= 0.6) {
          away = false;
          window.dispatchEvent(new CustomEvent(PULSE_UNDOCK_EVENT, { detail: { ...rectOf(), live: rectOf } }));
        }
      },
      { threshold: [0, 0.3, 0.6, 0.9] },
    );
    io.observe(stage);
    const onReturned = () => {
      if (!away) stage.classList.remove("is-away");
    };
    window.addEventListener(PULSE_RETURNED_EVENT, onReturned);
    return () => {
      io.disconnect();
      window.removeEventListener(PULSE_RETURNED_EVENT, onReturned);
    };
  }, [mascot]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const auroraRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const progressPathRef = useRef<SVGPathElement>(null);
  const progressDotRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const [reduced, setReduced] = useState(false);
  const [started, setStarted] = useState(false);

  // Tracker video reveal (Nov 24 2026): the demo loop stays hidden
  // and paused until its card is scrolled into view, and hides and
  // pauses again as it scrolls away, on desktop and phones. The card
  // is only armed once JS runs, so without JS the video plays as
  // before instead of sitting hidden.
  useEffect(() => {
    if (!mascot) return;
    const card = cardRef.current;
    const video = videoRef.current;
    if (!card || !video) return;
    card.classList.add("pw-video-armed");
    const io = new IntersectionObserver(
      (entries) => {
        const inView = entries[0]?.isIntersecting ?? false;
        card.classList.toggle("is-inview", inView);
        if (inView) {
          if (!reduced) video.play().catch(() => undefined);
        } else {
          video.pause();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(card);
    return () => io.disconnect();
  }, [mascot, reduced]);

  // Clash Display, landing only: injected here, never in the layout,
  // so the dashboard never fetches it. Falls back to Bricolage if
  // Fontshare is blocked.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.querySelector(`link[href="${FONTSHARE_HREF}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONTSHARE_HREF;
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    queueMicrotask(() => setReduced(mq.matches));
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // The greeting clock (ms): starts at -GREETING_DELAY_MS, the 800ms
  // welcome delay, and runs to GREETING_MS. Auto-plays forward
  // until the visitor scrubs it; after 2.5s without scrub input it
  // resumes assembling itself toward the end.
  // (The headline scramble that used to read this clock was removed
  // Nov 24 2026 with the headline; the crystal and ring still do.)

  // Scroll progress ECG line: a thin fixed line at the very top of
  // the landing that draws itself as the page scrolls, with a dot
  // at the leading edge. Its own listener, outside the hero loop,
  // so it keeps tracking after the hero scrolls off-screen and the
  // loop pauses. Pure functions of page scroll progress.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      const path = progressPathRef.current;
      if (path) path.style.strokeDashoffset = String(ecgOffset(p, 100));
      const dot = progressDotRef.current;
      if (dot) dot.style.left = `${scrollProgressLine(p).toFixed(2)}%`;
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  // The one loop: morph ticker + particles + spring tilt + scroll,
  // one clock. Paused when the tab hides (visibilitychange) and
  // when the hero scrolls off-screen (IntersectionObserver), and
  // restarted by either one coming back.
  useEffect(() => {
    if (reduced) return;
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas) return;
    const ctx = canvas.getContext("2d");
    const tier = deviceTier({
      deviceMemory:
        typeof navigator !== "undefined"
          ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
          : undefined,
      hardwareConcurrency: typeof navigator !== "undefined" ? navigator.hardwareConcurrency : undefined,
      saveData:
        typeof navigator !== "undefined"
          ? (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
          : undefined,
      width: window.innerWidth,
      reducedMotion: false,
    });
    const count = particleCount(tier);
    const particles = particleField(20261120, count);
    // Mascot layout starfield: more, finer points than the motes.
    const spaceStars = mascot ? particleField(20261122, Math.round(count * 1.1)) : [];
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap(tier));
    let raf = 0;
    let start = 0;
    let last = 0;
    let cancelled = false;
    let visible = true;
    let inView = true;
    let pointer = { x: 0.5, y: 0.5 };
    const tilt = { rotateX: 0, rotateY: 0 };
    const tiltVel = { x: 0, y: 0 };
    let scrollY = 0;
    // Greeting clock (ms): starts at -GREETING_DELAY_MS, the 800ms
    // welcome delay, and runs to GREETING_MS. Auto-plays forward
    // until the visitor scrubs it; after 2.5s without scrub input it
    // resumes assembling itself toward the end.
    let greetingT = -GREETING_DELAY_MS;
    let greetingAuto = true;
    let lastScrubAt = 0;
    const greetParts = greetParticles(20261120, greetParticleCount(tier));
    const crystalVerts = crystalVertices();
    const crystalFaceList = crystalFaces();

    const resize = () => {
      const rect = section.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(section);

    const io = new IntersectionObserver(
      (entries) => {
        inView = entries[0]?.isIntersecting ?? true;
        if (inView && visible) schedule();
      },
      { threshold: 0 },
    );
    io.observe(section);

    let downAt: { x: number; y: number } | null = null;
    let downMoved = 0;
    let lastClientX: number | null = null;
    const onPointer = (e: PointerEvent) => {
      const rect = section.getBoundingClientRect();
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      // Scrub: horizontal movement over the hero moves the greeting
      // clock forward and back, delta-based, so the visitor can
      // replay the greeting by moving the mouse. The first move only
      // sets the baseline; scrubbing pauses the auto-play.
      if (inside && lastClientX !== null) {
        const dx = e.clientX - lastClientX;
        if (dx !== 0) {
          greetingT = clampGreetingTime(greetingT + scrubTimeDelta(dx, rect.width));
          greetingAuto = false;
          lastScrubAt = performance.now();
        }
      }
      lastClientX = e.clientX;
      if (downAt) {
        downMoved = Math.max(
          downMoved,
          Math.abs(e.clientX - downAt.x) + Math.abs(e.clientY - downAt.y),
        );
      }
      pointer = {
        x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
        y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
      };
    };
    // Tap replay: a tap (or click) on the hero background, not on a
    // link or button, restarts the greeting from the welcome delay.
    const onPointerDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY };
      downMoved = 0;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (downAt) {
        downMoved = Math.max(
          downMoved,
          Math.abs(e.clientX - downAt.x) + Math.abs(e.clientY - downAt.y),
        );
        const target = e.target as HTMLElement | null;
        if (downMoved < 12 && !target?.closest("a, button")) {
          if (mascot) {
            // Pulse answers taps himself: a tap on him is his own
            // reaction, a tap elsewhere pokes him to react and talk.
            if (!target?.closest(".pulse-bear-canvas")) window.dispatchEvent(new Event(PULSE_POKE_EVENT));
          } else {
            greetingT = -GREETING_DELAY_MS;
            greetingAuto = true;
            lastScrubAt = 0;
          }
        }
      }
      downAt = null;
    };
    const onScroll = () => {
      scrollY = window.scrollY;
    };
    const onVis = () => {
      visible = !document.hidden;
      if (visible && inView) schedule();
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    section.addEventListener("pointerdown", onPointerDown);
    section.addEventListener("pointerup", onPointerUp);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    onScroll();

    const schedule = () => {
      if (!raf && !cancelled) raf = requestAnimationFrame(tick);
    };

    const tick = (now: number) => {
      raf = 0;
      if (cancelled) return;
      if (!visible || !inView) {
        last = now;
        return;
      }
      if (!start) start = now;
      const dt = Math.min(0.1, last ? (now - last) / 1000 : 0.016);
      last = now;
      const t = (now - start) / 1000;

      // Greeting clock: auto-plays forward from the welcome delay,
      // pauses while the visitor scrubs, and resumes assembling
      // itself after 2.5s without scrub input. Everything in the
      // greeting (crystal, ring) reads this one clock, so scrubbing
      // the crystal scrubs the ring with it.
      if (greetingAuto && greetingT < GREETING_MS) {
        greetingT = Math.min(GREETING_MS, greetingT + dt * 1000);
      } else if (
        !greetingAuto &&
        greetingT < GREETING_MS &&
        now - lastScrubAt > GREETING_RESUME_IDLE_MS
      ) {
        greetingAuto = true;
      }
      const g = greetingProgress(greetingT);
      const phases = greetingPhases(g);

      // Morph ticker: same 8s loop, numbers travel and cross-dissolve.
      const frame = stateAt(now - start);
      const state = STATES[frame.index];
      const num = numRef.current;
      if (num) {
        const y = (1 - frame.enter) * 24 - frame.exit * 24;
        num.style.transform = `translateY(${y.toFixed(1)}px)`;
        num.style.opacity = Math.max(0, Math.min(1, frame.enter - frame.exit)).toFixed(2);
        num.textContent = String(state.value);
      }
      const label = labelRef.current;
      if (label) {
        label.style.opacity = Math.max(0, Math.min(1, frame.enter - frame.exit)).toFixed(2);
        label.textContent = state.label;
      }
      const sub = subRef.current;
      if (sub) {
        sub.style.opacity = Math.max(0, Math.min(1, frame.enter - frame.exit)).toFixed(2);
        sub.textContent = state.sub;
      }
      const dots = dotsRef.current;
      if (dots) {
        dots.querySelectorAll<HTMLSpanElement>("[data-dot]").forEach((d, i) => {
          d.classList.toggle("on", i === frame.index);
        });
      }

      // Tilt: a real spring, so the window leans with weight and
      // rocks back instead of snapping. Stiffness 120, damping 14
      // is underdamped on purpose: a little overshoot, then settle.
      const target = tiltFromPointer(pointer.x, pointer.y, 1, 1);
      const sx = springStep(tilt.rotateX, tiltVel.x, target.rotateX, 120, 14, dt);
      tilt.rotateX = sx.value;
      tiltVel.x = sx.velocity;
      const sy = springStep(tilt.rotateY, tiltVel.y, target.rotateY, 120, 14, dt);
      tilt.rotateY = sy.value;
      tiltVel.y = sy.velocity;

      // Scroll: the hero transforms into About as you scroll. The
      // window tips back, shrinks, sinks, and fades, and the
      // pointer tilt lets go as it leaves, so it straightens out
      // on its way down. Scrolling back reverses it for free.
      const p = Math.min(1, Math.max(0, scrollY / window.innerHeight));
      const sf = heroScrollFrame(scrollY, window.innerHeight);
      const weight = mascot ? 0 : 1 - p * 0.7;
      const card = cardRef.current;
      // Mascot layout on phones: the tracker sits below Pulse, so a
      // fade keyed to page scroll (tuned for the side-by-side desktop
      // layout) would empty it before anyone reaches it. Instead it
      // stays solid until it starts leaving the top of the screen, then
      // runs the same fade-out over its own height. Measured on the
      // untransformed stage wrapper, never the card it transforms.
      if (card && mascot && window.innerWidth <= 820) {
        const stage = card.parentElement;
        const top = stage ? stage.getBoundingClientRect().top : 0;
        const height = card.offsetHeight || 1;
        const leaving = Math.min(1, Math.max(0, (80 - top) / height));
        const ease = leaving * leaving * (3 - 2 * leaving);
        card.style.transform = `perspective(1100px) rotateX(${(ease * 10).toFixed(2)}deg) translateY(${(ease * 24).toFixed(1)}px) scale(${(1 - ease * 0.06).toFixed(3)})`;
        card.style.opacity = (1 - ease * 0.9).toFixed(2);
      } else if (card) {
        card.style.transform = `perspective(1100px) rotateX(${(tilt.rotateX * weight + sf.cardRotateX).toFixed(2)}deg) rotateY(${(tilt.rotateY * weight).toFixed(2)}deg) translateY(${(p * 28).toFixed(1)}px) scale(${sf.cardScale.toFixed(3)})`;
        card.style.opacity = sf.cardOpacity.toFixed(2);
      }
      const copy = copyRef.current;
      if (copy) {
        copy.style.transform = `translateY(${sf.copyY.toFixed(1)}px)`;
        // Mascot layout: Pulse lives in this column, so it stays fully
        // visible while he hands off to the corner; only the classic
        // headline column fades.
        copy.style.opacity = mascot ? "1" : sf.copyOpacity.toFixed(2);
      }

      // Aurora: faint drift with scroll, on top of its CSS drift.
      // The translate and scale properties compose with the CSS
      // animation transform instead of fighting it.
      const aurora = auroraRef.current;
      if (aurora) {
        const shift = auroraShift(p);
        aurora.style.translate = `${shift.x.toFixed(2)}% ${shift.y.toFixed(2)}%`;
        aurora.style.scale = shift.scale.toFixed(3);
      }

      // Cursor glow: follows the pointer, fades as you scroll away.
      const glow = glowRef.current;
      if (glow) {
        const rect = section.getBoundingClientRect();
        glow.style.transform = `translate3d(${(pointer.x * rect.width).toFixed(1)}px, ${(pointer.y * rect.height).toFixed(1)}px, 0)`;
        glow.style.opacity = (1 - p).toFixed(2);
      }

      // Particles: rise, drift, wrap, and fade as you scroll.
      // Red motes glow, white motes sit quiet.
      if (ctx && count > 0 && mascot) {
        // Mascot layout: deep space. Stars at three depths drift
        // slowly left and parallax with the pointer by depth, each
        // twinkling on its own clock; the brightest get a soft glow and
        // a fifth burn brand red. Every ~7s a shooting star streaks
        // across, white head fading to a red tail.
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        const fade = 1 - 0.45 * p;
        for (const st of spaceStars) {
          const depth = st.r / 2.4;
          const x = ((((st.x - t * 0.0025 * depth) % 1) + 1) % 1) * w + (pointer.x - 0.5) * -30 * depth * dpr;
          const y = st.y * h + (pointer.y - 0.5) * -20 * depth * dpr;
          const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (0.6 + st.speed * 60) + st.y * 50));
          // Fine and mostly white: a few warm stars, no red dust.
          const a = tw * fade * (0.25 + 0.6 * depth);
          const r = Math.max(0.45, st.r * 0.45) * dpr;
          if (st.r > 2.2) {
            const g = ctx.createRadialGradient(x, y, 0, x, y, r * 6);
            g.addColorStop(0, st.red ? `rgba(255, 200, 190, ${(a * 0.35).toFixed(3)})` : `rgba(210, 220, 255, ${(a * 0.35).toFixed(3)})`);
            g.addColorStop(1, "rgba(0, 0, 0, 0)");
            ctx.fillStyle = g;
            ctx.fillRect(x - r * 6, y - r * 6, r * 12, r * 12);
          }
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = st.red ? `rgba(255, 214, 205, ${a.toFixed(3)})` : `rgba(236, 240, 255, ${a.toFixed(3)})`;
          ctx.fill();
        }
        const SLOT = 7;
        const slot = Math.floor(t / SLOT);
        const sp = (t - slot * SLOT) / 1.1;
        if (sp < 1 && slot > 0) {
          const hsh = (n: number) => { const v = Math.sin(slot * 91.7 + n * 37.3) * 43758.5453; return v - Math.floor(v); };
          const sx = (0.15 + hsh(1) * 0.7) * w;
          const sy = (0.05 + hsh(2) * 0.35) * h;
          const len = (0.18 + hsh(3) * 0.12) * w;
          const ang = 0.35 + hsh(4) * 0.3;
          const hx = sx + Math.cos(ang) * len * sp;
          const hy = sy + Math.sin(ang) * len * sp;
          const tail = 120 * dpr;
          const tx = hx - Math.cos(ang) * tail;
          const ty = hy - Math.sin(ang) * tail;
          const al = Math.sin(sp * Math.PI) * fade;
          const grad = ctx.createLinearGradient(tx, ty, hx, hy);
          grad.addColorStop(0, "rgba(253, 88, 93, 0)");
          grad.addColorStop(0.7, `rgba(253, 88, 93, ${(0.5 * al).toFixed(3)})`);
          grad.addColorStop(1, `rgba(255, 255, 255, ${(0.95 * al).toFixed(3)})`);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.6 * dpr;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(hx, hy);
          ctx.stroke();
        }
      } else if (ctx && count > 0) {
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        const fade = 1 - 0.55 * p;
        const px = (pointer.x - 0.5) * 24 * dpr;
        const py = (pointer.y - 0.5) * 24 * dpr;
        for (const part of particles) {
          const at = particleAt(part, t);
          const x = at.x * w + px * (0.4 + part.r / 2) + sf.fieldY * dpr * 0.1;
          const y = at.y * h + py * (0.4 + part.r / 2);
          ctx.beginPath();
          ctx.arc(x, y, part.r * dpr, 0, Math.PI * 2);
          ctx.fillStyle = part.red
            ? `rgba(253, 88, 93, ${(0.85 * fade).toFixed(2)})`
            : `rgba(255, 255, 255, ${(0.45 * fade).toFixed(2)})`;
          ctx.fill();
        }
      }

      // Greeting crystal: drawn on the same canvas as the particle
      // field, after the motes, so it reads as an object in the scene
      // rather than a separate layer. Real depth order: the back half
      // of the ring and the far particles first, then the crystal
      // faces, then the front half and the near particles. The whole
      // scene fades in over the first 8 percent of the greeting, so
      // it never pops, and fades with scroll like the motes.
      if (ctx && greetParts.length > 0 && !mascot) {
        const w = canvas.width;
        const h = canvas.height;
        if (count === 0) ctx.clearRect(0, 0, w, h);
        const fade = 1 - 0.55 * p;
        const layout = crystalLayout(w, h);
        const presence = smoothstep(0, 0.08, g);
        const sceneAlpha = layout.alpha * fade * presence;
        if (layout.radius > 0 && sceneAlpha > 0.01) {
          const rot = greetingRotation(g, pointer.x, pointer.y, t);
          const cx = layout.cx + sf.fieldY * dpr * 0.1;
          const cy = layout.cy + sf.fieldY * dpr * 0.05;
          const R = layout.radius;
          const rotV = (v: { x: number; y: number; z: number }) =>
            rotateX(rotateY(v, rot.rotY), rot.rotX);
          const toScreen = (v: { x: number; y: number; z: number }) => {
            const rv = rotV(v);
            const pr = project(rv);
            return { x: cx + pr.x * R, y: cy - pr.y * R, z: rv.z, depth: pr.depth };
          };

          // Glow: a soft red wash behind the crystal, up with solidify.
          const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 2.4);
          glowGrad.addColorStop(0, `rgba(253, 88, 93, ${(0.14 * phases.solidify * sceneAlpha).toFixed(3)})`);
          glowGrad.addColorStop(1, "rgba(253, 88, 93, 0)");
          ctx.fillStyle = glowGrad;
          ctx.fillRect(cx - R * 2.4, cy - R * 2.4, R * 4.8, R * 4.8);

          // ECG ring: 140 points, drawn up to the ring phase, split
          // into back and front arcs by depth so the crystal occludes
          // the far half and the near half crosses in front of it.
          const RING_N = 140;
          const ringDrawn = Math.floor(phases.ring * RING_N);
          const ringPts: { x: number; y: number; z: number; depth: number }[] = [];
          for (let i = 0; i <= ringDrawn; i++) {
            ringPts.push(toScreen(ecgRingPoint(i / RING_N, 2.3)));
          }
          const strokeArc = (front: boolean, width: number, alpha: number) => {
            ctx.beginPath();
            for (let i = 0; i + 1 < ringPts.length; i++) {
              const a = ringPts[i];
              const b = ringPts[i + 1];
              const aFront = a.z >= 0;
              const bFront = b.z >= 0;
              if (aFront === front && bFront === front) {
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
              }
            }
            ctx.strokeStyle = `rgba(253, 88, 93, ${alpha.toFixed(3)})`;
            ctx.lineWidth = width;
            ctx.lineCap = "round";
            ctx.stroke();
          };
          strokeArc(false, 1.5 * dpr, 0.35 * sceneAlpha);
          strokeArc(false, 3.5 * dpr, 0.1 * sceneAlpha);

          // Greet particles, far half first.
          const drawGreet = (front: boolean) => {
            for (const gp of greetParts) {
              const s = toScreen(greetParticleAt(gp, t, phases.assemble, crystalVerts));
              if ((s.z >= 0) !== front) continue;
              const pa = Math.min(1, Math.max(0.25, 0.6 + (s.depth - 1) * 1.5)) * sceneAlpha;
              ctx.beginPath();
              ctx.arc(s.x, s.y, Math.max(0.5, gp.size * dpr * s.depth), 0, Math.PI * 2);
              ctx.fillStyle = `rgba(253, 88, 93, ${pa.toFixed(3)})`;
              ctx.fill();
            }
          };
          drawGreet(false);

          // Crystal faces, far first, shaded by their normal.
          const rotated = crystalVerts.map(rotV);
          const faces = crystalFaceList
            .map((f) => {
              const a = rotated[f[0]];
              const b = rotated[f[1]];
              const c = rotated[f[2]];
              return { f, z: (a.z + b.z + c.z) / 3, shade: faceShade(faceNormal(a, b, c)) };
            })
            .sort((m, n) => m.z - n.z);
          for (const { f, shade } of faces) {
            const a = toScreen(crystalVerts[f[0]]);
            const b = toScreen(crystalVerts[f[1]]);
            const c = toScreen(crystalVerts[f[2]]);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.lineTo(c.x, c.y);
            ctx.closePath();
            ctx.fillStyle = `rgba(253, 88, 93, ${((0.08 + 0.3 * shade) * phases.solidify * sceneAlpha).toFixed(3)})`;
            ctx.fill();
            ctx.strokeStyle = `rgba(255, 151, 163, ${(0.55 * phases.solidify * sceneAlpha).toFixed(3)})`;
            ctx.lineWidth = 1 * dpr;
            ctx.stroke();
          }
          // Core glint at the crystal center.
          const glint = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.5);
          glint.addColorStop(0, `rgba(255, 255, 255, ${(0.35 * phases.solidify * sceneAlpha).toFixed(3)})`);
          glint.addColorStop(1, "rgba(255, 255, 255, 0)");
          ctx.fillStyle = glint;
          ctx.fillRect(cx - R * 0.5, cy - R * 0.5, R, R);

          // Ring front half, near particles, then the travelling pulse
          // head once the ring is fully drawn.
          strokeArc(true, 2 * dpr, 0.85 * sceneAlpha);
          strokeArc(true, 4.5 * dpr, 0.12 * sceneAlpha);
          drawGreet(true);
          if (phases.ring >= 1) {
            const head = toScreen(ecgRingPoint((t * 0.12) % 1, 2.3));
            ctx.beginPath();
            ctx.arc(head.x, head.y, 6 * dpr, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(253, 88, 93, ${(0.3 * sceneAlpha).toFixed(3)})`;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(head.x, head.y, 2.5 * dpr, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${(0.9 * sceneAlpha).toFixed(3)})`;
            ctx.fill();
          }
        }
      }

      schedule();
    };

    const begin = () => {
      if (!cancelled) {
        setStarted(true);
        schedule();
      }
    };
    if (document.fonts?.ready) document.fonts.ready.then(begin);
    else begin();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onPointer);
      section.removeEventListener("pointerdown", onPointerDown);
      section.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [reduced, mascot]);

  const still = STATES[0];

  return (
    <section className={mascot ? "hero-crazy hero-mascot" : "hero-crazy"} aria-label="Pulse Find at a glance" ref={sectionRef}>
      <div className="scroll-progress" aria-hidden="true">
        <svg viewBox="0 0 1200 12" preserveAspectRatio="none" focusable="false">
          <path
            ref={progressPathRef}
            d={ECG_PATH}
            pathLength={100}
            strokeDasharray="100"
            strokeDashoffset="100"
          />
        </svg>
        <span className="scroll-progress-dot" ref={progressDotRef} />
      </div>
      <canvas className="hero-field" ref={canvasRef} aria-hidden="true" />
      <div className="hero-aurora" ref={auroraRef} aria-hidden="true" />
      <div className="hero-cursor-glow" ref={glowRef} aria-hidden="true" />
      <div className="hero-crazy-inner">
        <div className="hero-crazy-copy" ref={copyRef}>
          {mascot ? null : <span className="about-kicker">Pulse Find</span>}
          {mascot ? (
            <>
              <h1 className="hero-crazy-headline">Never miss an assessment deadline.</h1>
              <p className="hero-crazy-sub">
                Applications, OAs, and interviews in one tracker that flags
                what&apos;s waiting on you before anything slips.
              </p>
            </>
          ) : null}
          {mascot ? (
            <div className="hero-pulse-stage" ref={pulseStageRef}>
              <PulseBear3D followScroll bleedLeft />
            </div>
          ) : null}
          {mascot ? null : (
            <p>
              Fresh roles matched to you every morning, every application
              tracked by stage, and the right people lined up to talk to.
              Free to try with sample data.
            </p>
          )}
          <div className="hero-crazy-ctas">
            <a className="cta2" href="/signup">
              Start your tracker
              {mascot ? (
                <svg className="cta-icon cta-arrow" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                  <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
            </a>
            <a
              className="cta2 ghost"
              href="/demo"
              onClick={() => trackEvent("demo_opened", { source: "hero" })}
            >
              Try the live demo
            </a>
            <a className="cta2 ghost" href="https://github.com/kumailrizvi890/Pulse-Find" target="_blank" rel="noopener">
              {mascot ? (
                <svg className="cta-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                  <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.88.87 2.34.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                </svg>
              ) : null}
              Self-host
            </a>
            <a className="cta2 ghost" href="/demo/connect">
              {mascot ? (
                <svg className="cta-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                  <path d="M1.5 8.5h3l1.5-4 3 8 1.8-5 .9 1h2.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
              Connect your agent
            </a>
          </div>
          <p className="hero-crazy-note">Sample data below. Your tracker stays private.</p>
          <div className="hero-ecg-divider" aria-hidden="true">
            <svg width="220" height="28" viewBox="0 0 220 28" fill="none">
              <path d={ECG_DIVIDER_PATH} pathLength={100} stroke="#fd585d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="hero-stages" aria-label="Pipeline stages">
            <span className="st-applied">{mascot ? <i aria-hidden="true" /> : null}Applied</span>
            <span className="st-oa">{mascot ? <i aria-hidden="true" /> : null}OA received</span>
            <span className="st-int">{mascot ? <i aria-hidden="true" /> : null}Interviewing</span>
            <span className="st-offer">{mascot ? <i aria-hidden="true" /> : null}Offer</span>
          </div>
        </div>
        <div className="hero-crazy-stage">
          <div className="morph-halo" aria-hidden="true" />
          <div
            className="morph-card hero-card-3d"
            ref={cardRef}
            role="img"
            aria-label={mascot ? "The Pulse Find demo dashboard, sample data: 22 applications tracked" : `${still.value} ${still.label} in the sample tracker`}
          >
            <div className="morph-base" aria-hidden="true" />
            <div className="morph-glow" aria-hidden="true" />
            <div className="morph-sheen" aria-hidden="true" />
            <div className="morph-grain" aria-hidden="true" />
            <div className="morph-rim" aria-hidden="true" />
            <div className="morph-content">
              <div className="pw-chrome" aria-hidden="true">
                <span className="pw-dot" />
                <span className="pw-dot" />
                <span className="pw-dot" />
                <span className="pw-title">{mascot ? "Demo dashboard" : "Sample tracker"}</span>
                {mascot ? null : <span className="pw-live-dot" />}
              </div>
              <div className="pw-ticker">
                <div className="morph-num" ref={numRef}>{reduced || !started ? still.value : ""}</div>
                <div className="pw-ticker-text">
                  <div className="morph-label" ref={labelRef}>{reduced || !started ? still.label : ""}</div>
                  <div className="morph-sub" ref={subRef}>{reduced || !started ? still.sub : ""}</div>
                </div>
                <div className="morph-dots" ref={dotsRef} aria-hidden="true">
                  {STATES.map((s, i) => (
                    <span key={s.label} data-dot className={i === 0 ? "on" : ""} />
                  ))}
                </div>
              </div>
              {mascot ? (
                // The real demo dashboard, recorded: a muted loop of the
                // /demo tracker with sample data, cut to the top of the
                // dashboard (greeting, funnel, pace, OAs, interviews,
                // stats) and played forward then back, slowed, so it
                // never shows the long applications list or jumps.
                // Poster first; reduced motion keeps the poster.
                <video
                  className="pw-video"
                  ref={videoRef}
                  src="/landing/demo-pulse-loop.mp4"
                  poster="/landing/demo-pulse-loop-poster.jpg"
                  muted
                  loop
                  playsInline
                  autoPlay={!reduced}
                  preload="metadata"
                  aria-hidden="true"
                />
              ) : (
                <ul className="pw-rows">
                  {DEMO_ROWS.map((row) => (
                    <li className="pw-row" key={row.company}>
                      <span className="pw-company">{row.company}</span>
                      <span className={row.stage === "Interviewing" ? "pw-chip pw-int" : "pw-chip pw-oa"}>
                        {row.stage}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {mascot ? (
            <a className="hero-demo-link" href="/demo">
              Open the live demo
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          ) : null}
        </div>
      </div>
      <div className="hero-scroll-cue" aria-hidden="true">
        <span>Scroll</span>
        <i />
      </div>
    </section>
  );
}
