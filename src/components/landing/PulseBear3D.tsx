"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { deviceTier, mulberry32 } from "@/lib/hero-crazy";
import { springStep } from "@/lib/scroll-anim";
import {
  GREET,
  GREETING_LINE,
  REACTION_S,
  REST_POSE,
  type Pose,
  type Reaction,
  blinkAmount,
  greetingPose,
  heartbeat,
  isTap,
  layerPose,
  lineFor,
  lookAngles,
  pickReaction,
  reactionPose,
  spinStep,
} from "@/lib/pulse-bear";
import { PULSE_DOCK_EVENT, PULSE_GREET_EVENT, PULSE_POKE_EVENT, PULSE_RETURNED_EVENT, PULSE_UNDOCK_EVENT } from "@/lib/pulse-bear-events";
import { PulseSprite } from "@/components/PulseSprite";
import { buildPulse } from "./pulse-bear-scene";

// Pulse in 3D (landing only, Nov 22 2026). The plush Pulse bear from
// the brand video (model in ./pulse-bear-scene.ts, choreography in
// src/lib/pulse-bear.ts). He greets on load: pops in, lands with a
// squash, waves hello with his right arm and says hi, then turns all
// the way round like the video. Then he stays live: head and eyes
// follow the pointer, antennae wobble on springs, he blinks and
// breathes, and his belly ECG beats at 72 bpm. Tap him to react
// (head: giggle, belly: heartbeat burst, anywhere else: jump, spin,
// wave), drag sideways to spin him, and he springs back to face you.
// A `pulse:greet` window event replays the greeting.
//
// This module and the scene module are the only places three.js is
// imported, and they are only loaded through next/dynamic with
// ssr: false, so three never ships in the first paint. Paused
// off-screen and on tab-hide, DPR capped, a still frame under reduced
// motion, a pre-rendered Pulse (PulseSprite) if WebGL is unavailable.

/** The fly-in: starts after a beat, lasts FLY_S seconds. */
const FLY_DELAY = 0.15;
const FLY_S = 1.5;

export interface PulseBear3DProps {
  /** Shift Pulse right by this fraction of the visible width (0 = centred). */
  offsetX?: number;
  /** Ease Pulse back and down as the page scrolls away. */
  followScroll?: boolean;
  /**
   * Let the canvas run out to the left edge of the screen (Pulse keeps
   * his place), so the fly-in enters from off-screen instead of being
   * cut by the column edge.
   */
  bleedLeft?: boolean;
  className?: string;
}

export default function PulseBear3D({ offsetX = 0, followScroll = false, bleedLeft = false, className }: PulseBear3DProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [line, setLine] = useState<{ text: string; id: number } | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tier = deviceTier({
      deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
      hardwareConcurrency: navigator.hardwareConcurrency,
      saveData: (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData,
      width: window.innerWidth,
      reducedMotion: false,
    });

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      queueMicrotask(() => setFailed(true));
      return;
    }
    // DPR capped at 1.5 (1.25 on lite): the fur is soft, so the extra
    // pixels of DPR 2 cost a lot of frame time for no visible gain.
    let dpr = Math.min(window.devicePixelRatio || 1, tier === "full" ? 1.5 : 1.25);
    renderer.setPixelRatio(dpr);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const rig = buildPulse(tier);
    const { scene, root, bear, torso, neck, arms, antennae, shadow, shadowMat } = rig;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.4;
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);

    // Framing: fit Pulse, with jump headroom, in the canvas.
    let viewW = 4;
    let baseX = 0;
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const bleed = bleedLeft ? Math.max(0, Math.round(r.left)) : 0;
      const w = Math.max(1, r.width + bleed);
      const h = Math.max(1, r.height);
      canvas.style.left = `${-bleed}px`;
      canvas.style.width = `${w}px`;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // The craft (Nov 23 2026): the canopy on its silver body, with
      // two jets under it burning downward. Frame it all, from the spine
      // over the canopy down to where the flames fade out.
      let viewH = 7.5;
      if (viewH * camera.aspect < 6.2) viewH = 6.2 / camera.aspect;
      const dist = viewH / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      camera.position.set(0, 2.2, dist);
      camera.lookAt(0, 0.8, 0);
      camera.updateProjectionMatrix();
      viewW = viewH * camera.aspect;
      // Keep Pulse centred on the wrapper, not the (wider) canvas.
      baseX = ((bleed / 2 + offsetX * r.width) / w) * viewW;
      root.position.x = baseX;
    };
    resize();

    // ---- State ----
    const startAt = performance.now();
    let greetAt = startAt + (reduced ? 0 : (FLY_DELAY + FLY_S) * 1000 - 120);
    let greetLineShown = false;
    let reaction: { kind: Reaction; at: number } | null = null;
    let taps = 0;
    let lineN = 0;
    const look = { yaw: 0, pitch: 0, vy: 0, vp: 0 };
    let pointer = { nx: 0, ny: 0 };
    let spin = 0;
    let spinVel = 0;
    let lastLift = 0;
    let lastYaw = 0;
    let hover = false;
    let hatch = 0;
    let hatchVel = 0;
    let hatchTarget = 0;
    let hideBearAt = 0;
    let closeHatchAt = 0;
    let lineTimer: ReturnType<typeof setTimeout> | undefined;
    const say = (text: string) => {
      lineN++;
      setLine({ text, id: lineN });
      clearTimeout(lineTimer);
      lineTimer = setTimeout(() => setLine(null), 2600);
    };

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hitZone = (cx: number, cy: number): string | null => {
      const r = canvas.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(bear, true).find((h) => h.object.userData.zone);
      return hit ? (hit.object.userData.zone as string) : null;
    };

    const rand = mulberry32(72);
    const BURST = rig.burstPos.length / 3;
    let burstAt = -1e9;
    const fireBurst = (now: number) => {
      burstAt = now;
      for (let i = 0; i < BURST; i++) {
        rig.burstPos[i * 3] = (rand() - 0.5) * 0.7;
        rig.burstPos[i * 3 + 1] = 1.06 + (rand() - 0.5) * 0.3;
        rig.burstPos[i * 3 + 2] = 0.8;
        const ang = rand() * Math.PI * 2;
        const sp = 1.2 + rand() * 1.8;
        rig.burstVel[i * 3] = Math.cos(ang) * sp;
        rig.burstVel[i * 3 + 1] = Math.sin(ang) * sp + 0.6;
        rig.burstVel[i * 3 + 2] = 0.8 + rand() * 1.4;
      }
    };

    // ---- One frame for a pose ----
    const render = (pose: Pose, t: number, flare = 0) => {
      const s = pose.scale;
      const sq = pose.squash;
      bear.scale.set(s * (1 + sq * 0.55), s * (1 - sq), s * (1 + sq * 0.55));
      bear.position.y = pose.lift;
      bear.rotation.y = pose.turn + spin;

      const breathe = reduced ? 0 : Math.sin(t * 2.1) * 0.012;
      torso.scale.set(1 + breathe, 1 - breathe * 0.5, 1 + breathe);
      const w = pose.lookWeight;
      torso.rotation.y = look.yaw * 0.28 * w;
      torso.rotation.z = -look.yaw * 0.04 * w;
      neck.rotation.y = look.yaw * 0.72 * w;
      neck.rotation.x = look.pitch * w;
      neck.rotation.z = pose.headTilt;

      // His right arm (viewer left) waves; the other sways a little.
      // The raise and swing are deliberately large: the arm is short
      // and the hero renders small, so a modest wave reads as a bob.
      // At full raise the hand sweeps from out to the side to nearly
      // straight up, and leans toward the viewer.
      const idle = reduced ? 0 : Math.sin(t * 1.7) * 0.04;
      arms[0].rotation.z = -0.4 - pose.armRaise * 2.35 + pose.armWave * 0.6 - idle;
      arms[0].rotation.x = -pose.armRaise * 0.45;
      arms[1].rotation.z = 0.4 + idle + pose.armRaise * 0.12;

      rig.setFace({
        lookX: look.yaw * 1.4 * w,
        lookY: look.pitch * 1.6 * w,
        blink: reduced ? 0 : blinkAmount(t),
        happy: pose.happy,
        mouth: pose.mouthOpen,
      });

      // Heartbeat: belly line, chest light, antenna tips.
      const beat = reduced ? 0.3 : heartbeat(t);
      rig.ecg.uEcgHead.value = reduced ? 0.55 : (t * 0.5) % 1;
      rig.ecg.uEcgBeat.value = beat + flare * 1.5;
      rig.chest.intensity = 0.12 + beat * 0.3 + flare * 4;
      rig.knobMat.emissiveIntensity = 0.6 + beat * 0.8 + flare;
      rig.ecg.uKnobGlow.value = 0.32 + beat * 0.4 + flare * 0.6;
      rig.haloMat.opacity = 0.22 + beat * 0.25 + flare * 0.35;
      const period = 60 / 72;
      rig.stage.uPhase.value = reduced ? 0.6 : (((t % period) + period) % period) / period;
      rig.stage.uBeat.value = beat + flare;
      rig.stageRimGlow.opacity = 0.18 + beat * 0.22 + flare * 0.4;
      rig.space.uTime.value = reduced ? 0 : t;
      rig.space.uBeat.value = beat;
      rig.updateCraft(reduced ? 0 : t, beat);

      // Flight: the craft flies in from the left, banked into the
      // turn on a shallow arc, overshoots a touch and settles into a
      // hover; then it bobs, sways, and banks toward the pointer as if
      // steering. Pulse is aboard the whole way (no pop-in).
      const enter = reduced ? 1 : Math.min(1, Math.max(0, (t - FLY_DELAY) / FLY_S));
      const ease = 1 + 2.2 * Math.pow(enter - 1, 3) + 1.2 * Math.pow(enter - 1, 2);
      const enterX = (1 - ease) * -(baseX + viewW * 0.5 + 2.2);
      const enterY = Math.sin(enter * Math.PI) * 0.35 - (1 - enter) * 0.6;
      const bank = (1 - enter) * (1 - enter) * -0.45 + Math.sin(enter * Math.PI) * 0.06;
      const bob = reduced ? 0 : Math.sin(t * 1.3) * 0.12 + Math.sin(t * 0.7) * 0.05;
      const sway = reduced ? 0 : Math.sin(t * 0.9) * 0.035;
      root.position.x = baseX + enterX;
      root.rotation.z = sway + bank - look.yaw * 0.16;
      root.rotation.x = look.pitch * 0.12;

      for (const an of antennae) an.pivot.rotation.z = -an.side * 0.2 + an.a;

      const sh = Math.max(0.35, 1 - pose.lift * 0.45) * s;
      shadow.scale.set(sh, sh, 1);
      shadowMat.opacity = Math.max(0.15, 0.85 - pose.lift * 0.4) * Math.min(1, s * 1.5);

      let scrollY = 0;
      if (followScroll) {
        const p = Math.min(1, Math.max(0, window.scrollY / window.innerHeight));
        root.rotation.y = p * 0.7;
        scrollY = -p * 0.8;
      }
      root.position.y = enterY + bob + scrollY;
      renderer.render(scene, camera);
    };

    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) render(REST_POSE, 0);
    });
    ro.observe(wrap);
    if (reduced) {
      render(REST_POSE, 0);
      queueMicrotask(() => setReady(true));
    }

    // ---- Input ----
    const onMove = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect();
      const cx = r.left + r.width / 2 + offsetX * r.width;
      const cy = r.top + r.height * 0.32;
      pointer = {
        nx: (e.clientX - cx) / Math.max(320, window.innerWidth * 0.45),
        ny: (e.clientY - cy) / Math.max(320, window.innerHeight * 0.5),
      };
    };
    let down: { x: number; y: number; at: number; lastX: number; lastT: number; dragging: boolean } | null = null;
    const onDown = (e: PointerEvent) => {
      if (reduced) return;
      const now = performance.now();
      down = { x: e.clientX, y: e.clientY, at: now, lastX: e.clientX, lastT: now, dragging: false };
    };
    const onCanvasMove = (e: PointerEvent) => {
      if (down) {
        const dx = e.clientX - down.x;
        if (!down.dragging && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(e.clientY - down.y)) {
          down.dragging = true;
          canvas.setPointerCapture(e.pointerId);
        }
        if (down.dragging) {
          const now = performance.now();
          const step = (e.clientX - down.lastX) * 0.013;
          spin += step;
          spinVel = step / Math.max(0.008, (now - down.lastT) / 1000);
          down.lastX = e.clientX;
          down.lastT = now;
        }
      }
      if (e.pointerType === "mouse") {
        const over = hitZone(e.clientX, e.clientY) !== null;
        if (over !== hover) {
          hover = over;
          canvas.style.cursor = over ? "pointer" : "";
        }
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      const d = down;
      down = null;
      if (d.dragging) {
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        return;
      }
      if (!isTap(e.clientX - d.x, e.clientY - d.y, performance.now() - d.at)) return;
      const zone = hitZone(e.clientX, e.clientY);
      const kind = pickReaction(zone, taps++);
      const now = performance.now();
      reaction = { kind, at: now };
      if (kind === "heart") fireBurst(now);
      say(lineFor(kind, taps));
    };
    const onCancel = () => {
      down = null;
    };
    // Poked from elsewhere in the hero: no re-entry, he just reacts
    // where he stands and says something (cycling jump, spin, wave).
    const onPoke = () => {
      const kind = pickReaction(null, taps++);
      reaction = { kind, at: performance.now() };
      say(lineFor(kind, taps));
    };
    // The hand-off: while Pulse is down in the corner as the assistant,
    // his pod stays parked here, empty. When he flies home he hops back
    // in: a little jump and squash, and he says he is back.
    // The glass lid opens for him both ways: out, he hops and is gone
    // as the lid swings up; back, it opens as he flies in, he drops in
    // with a hop, and it shuts behind him.
    const onDocked = () => {
      setLine(null);
      hatchTarget = 1;
      const now = performance.now();
      reaction = { kind: "jump", at: now };
      hideBearAt = now + 300;
      closeHatchAt = now + 1100;
    };
    const onUndocking = () => {
      hatchTarget = 1;
      closeHatchAt = 0;
    };
    const onReturned = () => {
      bear.visible = true;
      hideBearAt = 0;
      const now = performance.now();
      reaction = { kind: "jump", at: now };
      closeHatchAt = now + 700;
      say("I'm back!");
    };
    window.addEventListener(PULSE_DOCK_EVENT, onDocked);
    window.addEventListener(PULSE_UNDOCK_EVENT, onUndocking);
    window.addEventListener(PULSE_RETURNED_EVENT, onReturned);
    const onGreet = () => {
      greetAt = performance.now() + 100;
      greetLineShown = false;
      reaction = null;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onCanvasMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
    window.addEventListener(PULSE_GREET_EVENT, onGreet);
    window.addEventListener(PULSE_POKE_EVENT, onPoke);
    // Touch taps fire no pointermove first: aim his gaze on press too.
    window.addEventListener("pointerdown", onMove, { passive: true });

    // ---- Loop ----
    let raf = 0;
    let cancelled = false;
    let inView = true;
    let visible = !document.hidden;
    let lastNow = 0;
    let firstFrame = true;
    let frameN = 0;
    let frameSum = 0;
    const schedule = () => {
      if (!raf && !cancelled && !reduced && inView && visible) raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((en) => {
      inView = en[0]?.isIntersecting ?? true;
      lastNow = 0;
      schedule();
    });
    io.observe(wrap);
    const onVis = () => {
      visible = !document.hidden;
      lastNow = 0;
      schedule();
    };
    document.addEventListener("visibilitychange", onVis);
    const onLost = (e: Event) => {
      e.preventDefault();
      cancelled = true;
      setFailed(true);
    };
    canvas.addEventListener("webglcontextlost", onLost);

    function tick(now: number) {
      raf = 0;
      if (cancelled) return;
      const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 1 / 60;
      lastNow = now;
      const t = (now - startAt) / 1000;

      const gt = (now - greetAt) / 1000;
      // He rides in aboard the craft, so skip the pop and drop; keep
      // the landing squash as the bounce when the pod pulls up.
      let pose = { ...greetingPose(gt), scale: 1, lift: 0 };
      if (gt < 0) pose = { ...pose, lookWeight: 0, squash: 0 };
      if (!greetLineShown && gt > GREET.waveStart) {
        greetLineShown = true;
        say(GREETING_LINE);
      }
      let flare = 0;
      if (reaction) {
        const rt = (now - reaction.at) / 1000;
        if (rt > REACTION_S[reaction.kind]) reaction = null;
        else {
          const rp = reactionPose(reaction.kind, rt);
          flare = rp.flare ?? 0;
          pose = layerPose(pose, rp);
        }
      }

      const target = lookAngles(pointer.nx, pointer.ny);
      const yy = springStep(look.yaw, look.vy, target.yaw, 70, 12, dt);
      look.yaw = yy.value;
      look.vy = yy.velocity;
      const pp = springStep(look.pitch, look.vp, target.pitch, 70, 12, dt);
      look.pitch = pp.value;
      look.vp = pp.velocity;

      const sp = spinStep(spin, spinVel, !!down?.dragging, dt);
      spin = sp.angle;
      spinVel = sp.velocity;

      // Antennae: springs kicked by head turns, lifts, and spins.
      const liftVel = (pose.lift - lastLift) / dt;
      const yawVel = (look.yaw - lastYaw) / dt;
      lastLift = pose.lift;
      lastYaw = look.yaw;
      for (const an of antennae) {
        const force = -an.a * 90 - an.v * 5 - yawVel * 1.6 - an.side * liftVel * 1.2 - spinVel * 0.4;
        an.v += force * dt;
        an.a = Math.max(-0.8, Math.min(0.8, an.a + an.v * dt));
      }

      const bt = (now - burstAt) / 1000;
      if (bt < 1.4) {
        for (let i = 0; i < BURST; i++) {
          rig.burstVel[i * 3 + 1] -= 2.2 * dt;
          rig.burstPos[i * 3] += rig.burstVel[i * 3] * dt;
          rig.burstPos[i * 3 + 1] += rig.burstVel[i * 3 + 1] * dt;
          rig.burstPos[i * 3 + 2] += rig.burstVel[i * 3 + 2] * dt;
        }
        rig.burst.geometry.attributes.position.needsUpdate = true;
        rig.burstMat.opacity = Math.max(0, 1 - bt / 1.4);
      } else rig.burstMat.opacity = 0;

      // Glass door: springs open or shut; timed hide and close.
      if (hideBearAt && now >= hideBearAt) {
        bear.visible = false;
        hideBearAt = 0;
      }
      if (closeHatchAt && now >= closeHatchAt) {
        hatchTarget = 0;
        closeHatchAt = 0;
      }
      // A snappy spring, underdamped: the door flips open fast,
      // overshoots a touch and settles, and flips shut the same way.
      const hs = springStep(hatch, hatchVel, hatchTarget, 160, 11, dt);
      hatch = Math.max(-0.08, hs.value);
      hatchVel = hs.velocity;
      rig.setHatch(hatch);
      render(pose, t, flare);
      // Adaptive resolution: after warm-up, if the average frame runs
      // past ~19ms (under ~52fps), step DPR down, never below 1.
      frameN++;
      if (frameN > 30) frameSum += dt;
      if (frameN === 120) {
        if (frameSum / 90 > 0.019 && dpr > 1) {
          dpr = Math.max(1, dpr - 0.25);
          renderer.setPixelRatio(dpr);
          resize();
        }
        frameN = 30;
        frameSum = 0;
      }
      if (firstFrame) {
        firstFrame = false;
        setReady(true);
      }
      schedule();
    }
    schedule();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(lineTimer);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener(PULSE_GREET_EVENT, onGreet);
      window.removeEventListener(PULSE_POKE_EVENT, onPoke);
      window.removeEventListener(PULSE_DOCK_EVENT, onDocked);
      window.removeEventListener(PULSE_UNDOCK_EVENT, onUndocking);
      window.removeEventListener(PULSE_RETURNED_EVENT, onReturned);
      window.removeEventListener("pointerdown", onMove);
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onCanvasMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("webglcontextlost", onLost);
      rig.dispose();
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
    };
  }, [offsetX, followScroll, bleedLeft]);

  return (
    <div ref={wrapRef} className={`pulse-bear ${ready ? "is-ready" : ""} ${className ?? ""}`}>
      {failed ? (
        <div className="pulse-bear-fallback" aria-hidden="true">
          <PulseSprite pose="wave" className="h-56 w-56 object-contain" />
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          className="pulse-bear-canvas"
          role="img"
          aria-label="Pulse, the Pulse Find mascot: a plush bear with a glowing heartbeat on his belly, waving hello. Tap him to play."
        />
      )}
      <div className="pulse-bear-bubble-wrap" aria-live="polite">
        {line ? (
          <span className="pulse-bear-bubble" key={line.id} style={{ left: `${50 + offsetX * 100}%` }}>
            {line.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}
