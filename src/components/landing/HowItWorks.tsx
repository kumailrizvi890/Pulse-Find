"use client";

import { useEffect, useRef, useState } from "react";
import { deviceTier } from "@/lib/hero-crazy";
import {
  AGENT_PROMPT,
  AGENT_REPLY_WORDS,
  HOW_IT_WORKS_STEPS,
  MATCH_RING_LOOP_MS,
  MATCH_SCORE,
  STAGE_FILL_LOOP_MS,
  SWIPE_LOOP_MS,
  TYPING_LOOP_MS,
  graphDrawProgress,
  matchRingFrame,
  pulseDotPosition,
  sectionProgress,
  stageFillProgress,
  swipeCardFrame,
  typingProgress,
} from "@/lib/how-it-works";

// How it works (landing only, Nov 20 2026): the teaching section
// between the hero and About. Editorial layout, not a grid of five
// samey cards: oversized Clash Display step numbers, hairline
// dividers, steps alternating sides of a central rail on desktop,
// one column with the rail on the left on phones.
//
// Each demo is a slice of the real product UI with sample data:
// a role card with a match ring, the swipe deck, a tracker row
// filling stage by stage, a network panel, and the agent chat.
// The pulse dot rides an ECG line down the rail as you scroll:
// the line draws itself and the dot sits on its tip.
//
// Motion is one shared rAF loop writing styles directly to the
// demo nodes, paused offscreen and when the tab hides. Lite tier
// shows every demo at its end state with no loop. Reduced motion
// shows the same end states with no travel. No JS still shows the
// end states, because the CSS defaults are the final frames and
// the reveal only hides steps once JS arms it. The section
// heading takes Clash Display to match the hero.

const RING_C = 2 * Math.PI * 34;

type DemoNodes = {
  ringFg: SVGCircleElement | null;
  ringScore: HTMLElement | null;
  swipeCard: HTMLElement | null;
  saved: HTMLElement | null;
  bars: Record<string, HTMLElement | null>;
  chips: Record<string, HTMLElement | null>;
  checks: Record<string, HTMLElement | null>;
  edges: HTMLElement[];
  nodes: HTMLElement[];
  dots: HTMLElement | null;
  words: HTMLElement[];
  railDraw: HTMLElement | null;
  railDot: HTMLElement | null;
};

function collectNodes(section: HTMLElement): DemoNodes {
  const q = <T extends Element>(sel: string) => section.querySelector<T>(sel);
  const qa = <T extends Element>(sel: string) => Array.from(section.querySelectorAll<T>(sel));
  const stage = (kind: string, stage: string) =>
    q<HTMLElement>(`[data-${kind}="${stage}"]`);
  return {
    ringFg: q<SVGCircleElement>("[data-ring-fg]"),
    ringScore: q<HTMLElement>("[data-ring-score]"),
    swipeCard: q<HTMLElement>("[data-swipe-card]"),
    saved: q<HTMLElement>("[data-saved]"),
    bars: {
      applied: stage("stage-bar", "applied"),
      oa: stage("stage-bar", "oa"),
      interview: stage("stage-bar", "interview"),
    },
    chips: {
      applied: stage("stage-chip", "applied"),
      oa: stage("stage-chip", "oa"),
      interview: stage("stage-chip", "interview"),
    },
    checks: {
      applied: stage("stage-check", "applied"),
      oa: stage("stage-check", "oa"),
      interview: stage("stage-check", "interview"),
    },
    edges: qa<HTMLElement>("[data-graph-edge]"),
    nodes: qa<HTMLElement>("[data-graph-node]"),
    dots: q<HTMLElement>("[data-typing-dots]"),
    words: qa<HTMLElement>("[data-agent-word]"),
    railDraw: q<HTMLElement>("[data-rail-draw]"),
    railDot: q<HTMLElement>("[data-rail-dot]"),
  };
}

function applyEndStates(n: DemoNodes) {
  if (n.ringFg) n.ringFg.style.strokeDashoffset = "0";
  if (n.ringScore) n.ringScore.textContent = String(MATCH_SCORE);
  if (n.swipeCard) {
    n.swipeCard.style.transform = "none";
    n.swipeCard.style.opacity = "1";
  }
  if (n.saved) n.saved.style.opacity = "0";
  for (const key of Object.keys(n.bars)) {
    if (n.bars[key]) n.bars[key]!.style.width = "100%";
    if (n.chips[key]) n.chips[key]!.style.opacity = "1";
    if (n.checks[key]) n.checks[key]!.style.opacity = "1";
  }
  for (const e of n.edges) e.style.height = "100%";
  for (const node of n.nodes) node.classList.add("lit");
  if (n.dots) n.dots.style.display = "none";
  for (const w of n.words) w.style.opacity = "1";
}

function applyFrame(n: DemoNodes, t: number) {
  const ring = matchRingFrame(t, MATCH_RING_LOOP_MS);
  if (n.ringFg) n.ringFg.style.strokeDashoffset = String(RING_C * (1 - ring.progress));
  if (n.ringScore) n.ringScore.textContent = String(ring.score);

  const swipe = swipeCardFrame(t, SWIPE_LOOP_MS);
  if (n.swipeCard) {
    n.swipeCard.style.transform = `translateX(${swipe.translateX.toFixed(1)}px) rotate(${swipe.rotateDeg.toFixed(1)}deg) scale(${swipe.scale.toFixed(3)})`;
    n.swipeCard.style.opacity = swipe.opacity.toFixed(2);
  }
  if (n.saved) n.saved.style.opacity = swipe.savedOpacity.toFixed(2);

  const stages = stageFillProgress(t, STAGE_FILL_LOOP_MS);
  const values: Record<string, number> = {
    applied: stages.applied,
    oa: stages.oa,
    interview: stages.interview,
  };
  for (const key of Object.keys(values)) {
    const v = values[key] ?? 0;
    if (n.bars[key]) n.bars[key]!.style.width = `${(v * 100).toFixed(1)}%`;
    if (n.chips[key]) n.chips[key]!.style.opacity = (0.35 + 0.65 * v).toFixed(2);
    if (n.checks[key]) n.checks[key]!.style.opacity = v >= 1 ? "1" : "0";
  }

  const graph = graphDrawProgress(t);
  n.edges.forEach((e, i) => {
    e.style.height = `${((graph.edges[i] ?? 1) * 100).toFixed(1)}%`;
  });
  n.nodes.forEach((node, i) => node.classList.toggle("lit", graph.nodes[i] ?? false));

  const typing = typingProgress(t, TYPING_LOOP_MS);
  if (n.dots) n.dots.style.display = typing.dotsVisible ? "inline-flex" : "none";
  n.words.forEach((w, i) => {
    w.style.opacity = i < typing.wordsShown ? "1" : "0";
  });
}

export function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);
  const [reduced, setReduced] = useState(false);
  const [tier, setTier] = useState<"full" | "lite" | "still">("full");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    queueMicrotask(() => setReduced(mq.matches));
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    queueMicrotask(() =>
      setTier(
        deviceTier({
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
          reducedMotion: mq.matches,
        }),
      ),
    );
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Scroll reveals, same .reveal-3d pattern as About: the section
  // is armed first, so without JS the steps stay visible.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    section.classList.add("hiw-armed");
    const els = Array.from(section.querySelectorAll<HTMLElement>(".reveal-3d"));
    if (reduced) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const ro = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).classList.add("in");
            ro.unobserve(e.target);
          }
        }
      },
      { threshold: 0.15 },
    );
    els.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [reduced]);

  // The one loop: demo frames plus the ECG rail rider.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const nodes = collectNodes(section);
    if (reduced || tier !== "full") {
      section.classList.add("hiw-static");
      applyEndStates(nodes);
      return;
    }
    section.classList.remove("hiw-static");
    let raf = 0;
    let start = 0;
    let cancelled = false;
    let visible = true;
    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0 },
    );
    io.observe(section);
    const tick = (now: number) => {
      if (cancelled) return;
      raf = requestAnimationFrame(tick);
      if (!visible || document.hidden) return;
      if (!start) start = now;
      const t = now - start;
      applyFrame(nodes, t);
      const rect = section.getBoundingClientRect();
      const p = sectionProgress(
        window.scrollY,
        rect.top + window.scrollY,
        rect.height,
        window.innerHeight,
      );
      const dot = pulseDotPosition(p);
      if (nodes.railDraw) nodes.railDraw.style.height = `${(dot.railProgress * 100).toFixed(2)}%`;
      if (nodes.railDot) nodes.railDot.style.top = `${(dot.railProgress * 100).toFixed(2)}%`;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [reduced, tier]);

  return (
    <section className="how-it-works" id="how-it-works" aria-label="How it works" ref={sectionRef}>
      <span className="about-kicker">How it works</span>
      <h2 className="hiw-title">How it works</h2>
      <p className="hiw-lede">
        Fresh roles matched to you every morning, every application tracked by stage, and the right
        people lined up to talk to.
      </p>

      <div className="hiw-steps">
        <div className="hiw-rail" aria-hidden="true">
          <div className="hiw-rail-line" />
          <div className="hiw-rail-draw" data-rail-draw />
          <span className="hiw-rail-dot" data-rail-dot />
        </div>

        {HOW_IT_WORKS_STEPS.map((step) => (
          <article className="hiw-step reveal-3d" data-step={step.id} key={step.id}>
            <div className="hiw-num" aria-hidden="true">
              {step.num}
            </div>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
            {step.id === "find" && (
              <div className="hiw-demo hiw-match-card">
                <span className="hiw-sample">Sample data</span>
                <div className="hiw-role">
                  <div>
                    <b>Northwind</b>
                    <span>Software Engineer Intern, Summer 2027</span>
                    <span>$32/hr · Seattle, WA</span>
                  </div>
                  <div className="hiw-ring" role="img" aria-label="Match score 92 out of 100">
                    <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
                      <circle cx="42" cy="42" r="34" className="hiw-ring-bg" />
                      <circle
                        cx="42"
                        cy="42"
                        r="34"
                        className="hiw-ring-fg"
                        data-ring-fg
                        strokeDasharray={RING_C}
                        strokeDashoffset={0}
                      />
                    </svg>
                    <b data-ring-score>92</b>
                  </div>
                </div>
                <div className="hiw-match-note">92 match · Newest first</div>
              </div>
            )}
            {step.id === "swipe" && (
              <div className="hiw-demo hiw-swipe-deck">
                <span className="hiw-sample">Sample data</span>
                <div className="hiw-deck">
                  <div className="hiw-deck-card hiw-deck-back">
                    <b>Fernhill</b>
                    <span>Software Engineer, Early Career</span>
                  </div>
                  <div className="hiw-deck-card hiw-deck-mid">
                    <b>Atlas</b>
                    <span>Embedded Software Intern</span>
                  </div>
                  <div className="hiw-deck-card hiw-deck-top" data-swipe-card>
                    <b>Copperline</b>
                    <span>Associate AI Engineer (New Grad)</span>
                    <span>$38/hr · Remote</span>
                  </div>
                  <span className="hiw-saved" data-saved>
                    Saved to Leads
                  </span>
                </div>
                <div className="hiw-deck-hint">Swipe right to save · left to pass</div>
              </div>
            )}
            {step.id === "track" && (
              <div className="hiw-demo hiw-tracker-row">
                <span className="hiw-sample">Sample data</span>
                <div className="hiw-row-head">
                  <div>
                    <b>Fernhill</b>
                    <span>Software Engineer, Early Career</span>
                  </div>
                  <span className="hiw-row-date">Applied 9 days ago</span>
                </div>
                <div className="hiw-stages">
                  {(
                    [
                      ["applied", "Applied"],
                      ["oa", "OA"],
                      ["interview", "Interview"],
                    ] as const
                  ).map(([key, label]) => (
                    <div className="hiw-stage" key={key}>
                      <span className={`hiw-chip hiw-chip-${key}`} data-stage-chip={key}>
                        {label}
                        <i data-stage-check={key} aria-hidden="true">
                          ✓
                        </i>
                      </span>
                      <span className="hiw-bar">
                        <i data-stage-bar={key} />
                      </span>
                    </div>
                  ))}
                </div>
                <div className="hiw-row-foot">One row, every stage, color coded.</div>
              </div>
            )}
            {step.id === "people" && (
              <div className="hiw-demo hiw-network">
                <span className="hiw-sample">Sample data</span>
                <div className="hiw-net-rows">
                  <div className="hiw-net-row">
                    <span className="hiw-net-dot lit" data-graph-node aria-hidden="true" />
                    <div>
                      <b>You</b>
                      <span>UW Bothell · CS, Dec 2027</span>
                    </div>
                  </div>
                  <span className="hiw-net-link" aria-hidden="true">
                    <i data-graph-edge />
                  </span>
                  <div className="hiw-net-row">
                    <span className="hiw-net-dot" data-graph-node aria-hidden="true" />
                    <div>
                      <b>Maya R.</b>
                      <span>Recruiter · Fernhill</span>
                    </div>
                  </div>
                  <span className="hiw-net-link" aria-hidden="true">
                    <i data-graph-edge />
                  </span>
                  <div className="hiw-net-row">
                    <span className="hiw-net-dot" data-graph-node aria-hidden="true" />
                    <div>
                      <b>Jon K.</b>
                      <span>Alum · Atlas</span>
                    </div>
                  </div>
                  <span className="hiw-net-link" aria-hidden="true">
                    <i data-graph-edge />
                  </span>
                  <div className="hiw-net-row">
                    <span className="hiw-net-dot" data-graph-node aria-hidden="true" />
                    <div>
                      <b>Priya S.</b>
                      <span>Recruiter · Tidewater</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {step.id === "agent" && (
              <div className="hiw-demo hiw-agent">
                <span className="hiw-sample">Sample data</span>
                <div className="hiw-chat">
                  <div className="hiw-bubble hiw-bubble-user">{AGENT_PROMPT}</div>
                  <div className="hiw-bubble hiw-bubble-agent">
                    <span className="hiw-agent-tag">Pulse agent · MCP</span>
                    <span className="hiw-typing" data-typing-dots aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span>
                      {AGENT_REPLY_WORDS.map((w, i) => (
                        <span className="hiw-word" data-agent-word key={`${w}-${i}`}>
                          {w}{" "}
                        </span>
                      ))}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
