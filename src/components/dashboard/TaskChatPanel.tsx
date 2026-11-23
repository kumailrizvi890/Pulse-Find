"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { accountPipelineStore, demoPipelineStore } from "@/lib/pipeline";
import { todayISO } from "@/lib/metrics";
import type { Application, Contact, Lead, TrackerEvent } from "@/lib/types";
import {
  answerGeneralQuestion,
  answerTaskQuestion,
  buildGeneralAgentHandoff,
  buildTaskAgentHandoff,
  DEFAULT_APP_ORIGIN,
  GENERAL_CHAT_SUGGESTIONS,
  generalChatGreeting,
  TASK_CHAT_SUGGESTIONS,
  taskChatGreeting,
  type ChatMessage,
  type GeneralChatContext,
  type TaskChatContext,
} from "@/lib/task-chat";
import { btn, cx, fmtDate } from "./ui";
import { IconExternalLink } from "@/components/icons";
import { PULSE_POSES, PulseSprite, pulseSpriteSrc, type PulsePose } from "@/components/PulseSprite";

/**
 * The task chatbot. It opens next to the task drawer when a "Waiting on
 * you" item is opened, already knowing the task: company, role, what is
 * due, the link, the history, and the people at that company. It also
 * opens in general mode from the navbar and the dashboard "Ask Pulse"
 * button, with no task attached: then it answers from the whole tracker
 * (what is waiting, what is due next, who went quiet, how the week is
 * going) and docks at the right edge, since there is no drawer beside it.
 *
 * Answers come only from the tracker data (see lib/task-chat.ts). There is
 * no LLM call here. Anything the chat cannot answer is handed to the
 * user's connected agent through Talk to Agent.
 */

// Scoped animations for the panel. Kept in this file so the feature
// stays self contained and does not touch the global stylesheet.
// Motion follows the design spine: entrances on cubic-bezier(0.22, 1,
// 0.36, 1), under 300ms, and everything still under
// prefers-reduced-motion.
const PANEL_CSS = `
/* Pulse in the chat (Nov 23 2026): he stands at the foot of the
   conversation and answers in thought bubbles: a soft cloud bubble with
   two little circles trailing down toward him. */
.pf-thought {
  position: relative;
  border-radius: 30px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.02)), var(--surface-2);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.09), 0 4px 10px -2px rgba(0, 0, 0, 0.55), 0 22px 48px -14px rgba(0, 0, 0, 0.95), 0 0 26px -10px rgba(253, 88, 93, 0.35);
}
/* Speech-bubble tail: a little point at the bottom-right corner,
   aimed down at Pulse, who stands at the bottom-right of the chat. */
.pf-thought::after {
  content: "";
  position: absolute;
  right: 26px;
  bottom: -13px;
  width: 18px;
  height: 14px;
  background: var(--surface-2);
  clip-path: polygon(0 0, 100% 0, 100% 100%);
}
@keyframes pf-think-dot { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
.pf-think-dot { display: inline-block; width: 7px; height: 7px; border-radius: 9999px; background: var(--accent); animation: pf-think-dot 1.2s ease-in-out infinite; }
.pf-think-dot:nth-child(2) { animation-delay: 0.15s; }
.pf-think-dot:nth-child(3) { animation-delay: 0.3s; }
@keyframes pf-stage-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
.pf-stage-pulse { animation: pf-stage-bob 3.2s ease-in-out infinite; filter: drop-shadow(0 8px 12px rgba(0, 0, 0, 0.55)); }
@keyframes pf-stage-nod { 0% { transform: scale(1.06, 0.92); } 50% { transform: scale(0.97, 1.04); } 100% { transform: scale(1, 1); } }
.pf-stage-nod { animation: pf-stage-nod 0.45s cubic-bezier(0.22, 1, 0.36, 1); transform-origin: 50% 100%; }
.pf-stage-floor { background: radial-gradient(ellipse at center, rgba(248, 52, 62, 0.35), rgba(0, 0, 0, 0.3) 45%, transparent 72%); }
@media (prefers-reduced-motion: reduce) {
  .pf-think-dot, .pf-stage-pulse, .pf-stage-nod { animation: none; }
}
@keyframes pf-crystal-glow {
  0%, 100% { filter: drop-shadow(0 0 3px rgba(244, 63, 94, 0.45)); transform: scale(1); }
  50% { filter: drop-shadow(0 0 12px rgba(244, 63, 94, 0.85)); transform: scale(1.07); }
}
.pf-pulse-crystal { animation: pf-crystal-glow 2.8s ease-in-out infinite; }
/* The panel docks from below: a short rise, no slide-across. */
@keyframes pf-chat-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.pf-chat-in { animation: pf-chat-in 0.25s cubic-bezier(0.22, 1, 0.36, 1) backwards; }
/* Opening from Pulse (Nov 23 2026): the mini Pulse in the corner grows a
   little into the chat's Pulse, and the speech bubbles and input bloom
   out of him, scaling up from the bottom-right corner where he stands. */
@keyframes pf-chat-bloom {
  from { opacity: 0; transform: scale(0.2); }
  60% { opacity: 1; }
  to { opacity: 1; transform: scale(1); }
}
.pf-chat-bloom { transform-origin: 100% 100%; animation: pf-chat-bloom 0.5s cubic-bezier(0.34, 1.4, 0.64, 1) backwards; }
.pf-chat-bloom-late { animation-delay: 0.08s; }
@keyframes pf-stage-grow {
  from { transform: scale(0.78); }
  55% { transform: scale(1.08); }
  to { transform: scale(1); }
}
.pf-stage-grow { transform-origin: 100% 100%; animation: pf-stage-grow 0.5s cubic-bezier(0.22, 1, 0.36, 1) backwards; }
@media (prefers-reduced-motion: reduce) {
  .pf-chat-bloom, .pf-stage-grow { animation: none; }
}
/* New messages fade up in place, so the panel growing with the
   conversation reads as motion rather than a jump. */
@keyframes pf-msg-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.pf-msg-in { animation: pf-msg-in 0.25s cubic-bezier(0.22, 1, 0.36, 1) backwards; }
/* 3D depth for the panel itself: a top-edge highlight, a faint red rim,
   and layered drop shadows so the dock floats above the tracker instead
   of sitting flat on it. The gradient keeps the glass feel without
   washing out the text. */
/* No window (Nov 23 2026): the chat is a conversation floating over
   the page in clouds, with nothing behind it, so you can still see your
   work. Each piece (title pill, clouds, Pulse, input) carries its own
   surface; the column itself is transparent, and older clouds fade out
   at the top instead of hitting a hard edge. */
.pf-chat-panel-3d { background: transparent; box-shadow: none; }
/* A soft black glow behind the conversation, no box and no edges: a
   feathered dark haze that sets the chat a little apart from the work
   underneath while you can still see it. */
.pf-chat-panel-3d::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.82) 72%, rgba(0, 0, 0, 0) 100%);
  filter: blur(6px);
}
.pf-chat-float-list {
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 56px);
  mask-image: linear-gradient(to bottom, transparent 0, #000 56px);
}
.pf-float-pill {
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  box-shadow: 0 3px 8px -2px rgba(0, 0, 0, 0.6), 0 14px 34px -10px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(253, 88, 93, 0.18);
}
/* The crystal avatar reads as 3D with a soft red halo behind it and a
   hard drop shadow under it, so it lifts off the panel. */
.pf-crystal-halo { position: relative; display: inline-flex; flex-shrink: 0; }
.pf-crystal-halo::before {
  content: "";
  position: absolute;
  inset: -6px;
  border-radius: 9999px;
  background: radial-gradient(circle, rgba(248, 52, 62, 0.38), transparent 70%);
  filter: blur(2px);
}
.pf-crystal-halo > svg {
  position: relative;
  filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.5)) drop-shadow(0 0 6px rgba(248, 52, 62, 0.55));
}
/* Message bubbles carry their own depth: the user bubble is a red
   gradient with a top highlight and a red cast shadow; the assistant
   bubble is layered glass with a top highlight and a deep drop shadow. */
.pf-chat-bubble-user-3d {
  background: linear-gradient(160deg, #fb7185, #f43f5e 55%, #e11d48);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 6px 16px -6px rgba(244, 63, 94, 0.55),
    0 2px 6px rgba(0, 0, 0, 0.4);
}
.pf-chat-bubble-ai-3d {
  background: linear-gradient(180deg, var(--surface-2), color-mix(in srgb, var(--surface-2) 88%, black));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.07),
    0 8px 20px -10px rgba(0, 0, 0, 0.7),
    0 2px 6px rgba(0, 0, 0, 0.35);
}
/* The composer sits like a floating bar: a deep shadow under it, and on
   focus it lifts a pixel and gains a red glow, so it reads as the front
   layer of the panel. */
.pf-chat-composer-3d {
  box-shadow:
    0 10px 28px -12px rgba(0, 0, 0, 0.75),
    0 0 0 1px rgba(253, 88, 93, 0.12);
  transition:
    box-shadow 0.25s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.25s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}
/* The message bar: a solid, full-width bar with a red rim so it is
   obvious where to type, sitting to Pulse's left. */
.pf-chat-bar { background: var(--surface); }
@keyframes pf-talk-flap { 0%, 49% { opacity: 0; } 50%, 100% { opacity: 1; } }
.pf-talk-flap { animation: pf-talk-flap 0.32s linear infinite; }
@media (prefers-reduced-motion: reduce) { .pf-talk-flap { display: none; } }
.pf-chat-composer-3d:focus-within {
  border-color: rgba(253, 88, 93, 0.6);
  box-shadow:
    0 12px 32px -12px rgba(0, 0, 0, 0.8),
    0 0 24px -6px rgba(248, 52, 62, 0.55);
  transform: translateY(-1px);
}
@media (prefers-reduced-motion: reduce) {
  .pf-pulse-crystal, .pf-chat-in, .pf-msg-in { animation: none; }
  .pf-chat-composer-3d { transition: none; }
  .pf-chat-composer-3d:focus-within { transform: none; }
}
`;

type Props = {
  /** Task mode: the application this chat is about. */
  application?: Application;
  /** General mode: the whole tracker. One of application / general is set. */
  general?: { apps: Application[]; ghostDays: number; weeklyGoal: number };
  events: TrackerEvent[];
  userId?: string;
  onClose: () => void;
};

export function TaskChatPanel({ application, general, events, userId, onClose }: Props) {
  const isGeneral = general !== undefined;
  const today = todayISO();
  const origin = typeof window !== "undefined" ? window.location.origin : DEFAULT_APP_ORIGIN;
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);
  const idRef = useRef(0);
  const nextId = (prefix: string) => `${prefix}-${++idRef.current}`;
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  // Pulse "talks" for a moment after each reply: his talk pose with a
  // quick mouth flap, then back to idle.
  const [talking, setTalking] = useState(false);
  const talkTimerRef = useRef<number | null>(null);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [contactsState, setContactsState] = useState<"loading" | "ready" | "error">("loading");
  const [contacts, setContacts] = useState<Contact[]>([]);
  // General mode also answers from leads (what leads do I have, leads at
  // a company). Task mode ignores them. A failed leads load leaves the
  // list empty and the chat still answers from applications and contacts.
  const [leads, setLeads] = useState<Lead[]>([]);

  const pipeline = useMemo(() => (userId ? accountPipelineStore(createClient(), userId) : demoPipelineStore(today)), [userId, today]);

  useEffect(() => {
    let alive = true;
    pipeline
      .loadContacts()
      .then((rows) => {
        if (!alive) return;
        // Task mode answers about one company; general mode answers about
        // the whole tracker, so it keeps every contact.
        setContacts(application ? rows.filter((c) => c.company.trim().toLowerCase() === application.company.trim().toLowerCase()) : rows);
        setContactsState("ready");
      })
      .catch(() => {
        if (!alive) return;
        setContactsState("error");
      });
    return () => {
      alive = false;
    };
  }, [pipeline, application]);

  useEffect(() => {
    let alive = true;
    pipeline
      .loadLeads()
      .then((rows) => {
        if (alive) setLeads(rows);
      })
      .catch(() => {
        // Leads stay empty; the chat answers from applications and contacts.
      });
    return () => {
      alive = false;
    };
  }, [pipeline]);

  const taskCtx: TaskChatContext | null = useMemo(() => {
    if (!application) return null;
    return {
      app: application,
      events: events.filter((e) => e.application_id === application.id),
      contacts,
      today,
      origin,
      trackerPath: userId ? "/app" : "/demo",
    };
  }, [application, events, contacts, today, origin, userId]);

  const generalCtx: GeneralChatContext | null = useMemo(() => {
    if (!general) return null;
    return {
      apps: general.apps,
      events,
      contacts,
      leads,
      today,
      origin,
      ghostDays: general.ghostDays,
      weeklyGoal: general.weeklyGoal,
      trackerPath: userId ? "/app" : "/demo",
    };
  }, [general, events, contacts, leads, today, origin, userId]);

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    // One of the two contexts is always set: general mode passes general,
    // task mode passes application. The greeting is built once at mount.
    isGeneral ? generalChatGreeting(generalCtx as GeneralChatContext) : taskChatGreeting(taskCtx as TaskChatContext),
  ]);

  useEffect(() => {
    // The composer is focused on mount so the visitor can type straight
    // away, but the focus must never move the page: a plain focus()
    // scrolls the document on iOS Safari, and that is what sent the
    // dashboard to the bottom when the chat opened from the landing
    // page (the navigation itself lands at the top). preventScroll
    // keeps the page where the navigation put it.
    const t = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 60);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (talkTimerRef.current !== null) window.clearTimeout(talkTimerRef.current);
    };
  }, [onClose]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, thinking]);

  function ask(text: string) {
    const question = text.trim();
    if (!question || thinking) return;
    const userMsg: ChatMessage = {
      id: nextId("u"),
      role: "user",
      text: question,
    };
    setMessages((p) => [...p, userMsg]);
    setInput("");
    setThinking(true);
    timerRef.current = window.setTimeout(() => {
      const reply = isGeneral ? answerGeneralQuestion(question, generalCtx as GeneralChatContext) : answerTaskQuestion(question, taskCtx as TaskChatContext);
      setMessages((p) => [...p, { ...reply, id: nextId("a") }]);
      setThinking(false);
      setTalking(true);
      if (talkTimerRef.current) window.clearTimeout(talkTimerRef.current);
      talkTimerRef.current = window.setTimeout(() => setTalking(false), Math.min(4000, 1200 + reply.text.length * 12));
    }, 350);
  }

  const handoff = useMemo(() => {
    if (!handoffOpen) return "";
    return isGeneral
      ? buildGeneralAgentHandoff({
          ctx: generalCtx as GeneralChatContext,
          messages,
        })
      : buildTaskAgentHandoff({ ctx: taskCtx as TaskChatContext, messages });
  }, [handoffOpen, generalCtx, taskCtx, messages, isGeneral]);

  async function copyHandoff() {
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(handoff);
      setCopied(true);
      setTimeout(() => setCopied(false), 2600);
    } catch {
      setCopyFailed(true);
    }
  }

  const onlyGreeting = messages.length <= 1;
  // Preload every pose so Pulse never blinks out when he switches.
  useEffect(() => {
    for (const p of PULSE_POSES) {
      const img = new window.Image();
      img.src = pulseSpriteSrc(p);
    }
  }, []);
  const stagePose: PulsePose = thinking ? "think" : talking ? "talk" : onlyGreeting ? "wave" : "idle";

  return (
    <>
      {/*
        Outside-click to close. The drawer already dims the screen with its
        own bg-black/60 backdrop, so this one stays transparent — a dark
        layer here would double-dim and show a seam. It sits at z-40, below
        the panel (z-50) and level with the drawer root, but it is rendered
        after the drawer, so it wins clicks over the drawer's backdrop in
        the area it covers: tapping the dimmed dashboard closes only the
        chat and leaves the drawer open. On desktop it is limited to the
        free strip left of both panels (right-[876px] = the panel's
        right-[476px] offset plus its 400px width), so it can never swallow
        a click meant for the drawer. On phones the sheet is modal over the
        drawer, so the backdrop covers the whole screen above it. In
        general mode there is no drawer: the panel docks at the right edge
        (right-4, 400px wide), so its left edge is 432px from the
        viewport's right edge and the backdrop ends there instead.
      */}
      <button type="button" aria-label="Close chat" className={cx("fixed inset-0 z-40", isGeneral ? "lg:right-[432px]" : "lg:right-[876px]")} onClick={onClose} />
      <div
        className={cx(
          "pf-chat-in fixed inset-x-0 bottom-0 z-50 flex max-h-[60dvh] flex-col overflow-hidden lg:inset-x-auto lg:bottom-4 lg:w-[400px] lg:max-h-[calc(100dvh-32px)] pf-chat-panel-3d",
          // Task mode docks left of the 476px drawer; general mode has no
          // drawer, so it docks at the right edge instead.
          isGeneral ? "lg:right-4" : "lg:right-[476px]",
        )}
        role="dialog"
        aria-modal="true"
        aria-label={isGeneral ? "Chat about your tracker" : `Chat about ${application?.company}`}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <style>{PANEL_CSS}</style>
        {/* No title bar: the chat floats on its own. Phones get a small
            close button in the corner; desktop has the round close button
            beside the panel, and a tap outside closes it everywhere. */}
        <button
          type="button"
          onClick={onClose}
          className="pf-float-pill absolute right-3 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full text-base leading-none text-muted transition hover:text-ink lg:hidden"
          aria-label="Close chat"
        >
          ×
        </button>

        {/* The list uses flex-auto (basis auto), not flex-1: it sizes to its
            content while the conversation is short, so the panel hugs the
            chat and the composer sits right under it. Once the panel hits
            its max height, min-h-0 lets this list shrink and scroll inside
            instead of pushing the footer off screen. */}
        <div ref={listRef} className="pf-chat-bloom pf-chat-float-list min-h-0 flex-auto space-y-3 overflow-y-auto px-3 pb-1 pt-4 lg:px-4 lg:pb-2 lg:pt-10">
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="pf-msg-in flex justify-start">
                <div className="pf-chat-bubble-user-3d max-w-[85%] rounded-2xl rounded-bl-md bg-accent px-3.5 py-2.5 text-sm text-accent-ink shadow-sm">{m.text}</div>
              </div>
            ) : (
              <div key={m.id} className="pf-msg-in flex justify-end pb-4">
                <div className="pf-thought min-w-0 max-w-[92%] border border-line px-3.5 py-2.5 lg:max-w-[88%] lg:px-4 lg:py-3">
                  <p className="whitespace-pre-line text-[13px] leading-snug lg:text-sm lg:leading-relaxed">{m.text}</p>
                  {m.links && m.links.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {m.links.map((l) => (
                        <a
                          key={l.href + l.label}
                          href={l.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent transition hover:brightness-110"
                        >
                          {l.label} <IconExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ),
          )}
          {thinking && (
            <div className="pf-msg-in flex justify-end pb-4">
              <div className="pf-thought flex items-center gap-1.5 border border-line px-4 py-3" aria-label="Pulse is thinking">
                <span className="pf-think-dot" />
                <span className="pf-think-dot" />
                <span className="pf-think-dot" />
                <span className="ml-2 text-xs text-muted">Thinking it over…</span>
              </div>
            </div>
          )}
          {contactsState === "error" && (
            <p className="rounded-xl bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn">
              I could not pull up your contacts just now, but you can still ask about the task itself.
            </p>
          )}
          {onlyGreeting && !thinking && (
            <div className="pt-1 text-right">
              <p className="pf-float-pill mb-2 inline-block rounded-full px-3 py-1 text-xs text-muted">Not sure where to start? Try one of these:</p>
              <div className="flex flex-wrap justify-end gap-1.5">
                {(isGeneral ? GENERAL_CHAT_SUGGESTIONS : TASK_CHAT_SUGGESTIONS).map((s) => (
                  <button key={s} type="button" onClick={() => ask(s)} className="pf-float-pill rounded-full px-3 py-1.5 text-xs font-medium text-ink transition hover:text-accent">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* The foot of the chat: Talk to Agent and the input on the left,
            Pulse himself standing on the right, in the corner the mini
            Pulse opened from. He waves when you open it, thinks while he
            works on an answer, and gives a little hop each time he replies. */}
        <footer className="flex items-end gap-1 pb-2 pl-3 pr-0 pt-1 lg:pb-3">
          <div className="pf-chat-bloom pf-chat-bloom-late mb-6 min-w-0 flex-1 lg:mb-8">
            <button
              type="button"
              className="pf-float-pill w-full rounded-full px-4 py-1.5 text-xs font-semibold lg:py-2 lg:text-sm text-ink transition hover:text-accent"
              onClick={() => setHandoffOpen(true)}
              title="Hands this task, your chat, and the full setup prompt to your connected agent."
            >
              Talk to Agent
            </button>
            <form
              className="pf-chat-composer-3d pf-chat-bar mt-2 flex h-12 w-full items-center gap-2 rounded-full border border-accent/45 pl-4 pr-1.5 transition focus-within:shadow-[0_0_0_1.5px_rgba(253,88,93,0.7)] lg:h-[52px]"
              onSubmit={(e) => {
                e.preventDefault();
                ask(input);
              }}
            >
              <input
                ref={inputRef}
                className="w-full min-w-0 bg-transparent text-[15px] text-ink placeholder:text-muted focus:outline-none"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isGeneral ? "Ask about your tracker…" : "Ask about this task…"}
                aria-label={isGeneral ? "Ask about your tracker" : "Ask about this task"}
                maxLength={500}
              />
              <button
                type="submit"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-base leading-none text-accent-ink transition hover:brightness-110 disabled:opacity-40"
                disabled={!input.trim() || thinking}
                aria-label="Send"
              >
                ↑
              </button>
            </form>
            {!isGeneral && application?.action_due && (
              <p className="mt-2 text-center text-[11px] text-muted">
                Due {fmtDate(application.action_due)}
                {application.action_needed ? ` · ${application.action_needed}` : ""}
              </p>
            )}
          </div>
          <span className="pf-stage-grow relative block shrink-0" aria-hidden="true">
            <span className="pf-stage-floor absolute bottom-0 left-1/2 h-4 w-24 -translate-x-1/2 rounded-full" />
            <span key={messages.length} className="pf-stage-nod block">
              <span className="pf-stage-pulse relative block h-[124px] w-[124px] lg:h-[150px] lg:w-[150px]">
                <PulseSprite pose={stagePose} className="h-full w-full object-contain" />
                {talking && <PulseSprite pose="idle" className="pf-talk-flap absolute inset-0 h-full w-full object-contain" />}
              </span>
            </span>
          </span>
        </footer>

        {handoffOpen && (
          <div
            className="absolute inset-2 z-10 flex flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Talk to Agent"
          >
            <header className="flex items-center gap-3 border-b border-line px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-base font-bold tracking-tight">Talk to Agent</h2>
                <p className="truncate text-xs text-muted">Your agent picks up right where we left off.</p>
              </div>
              <button type="button" onClick={() => setHandoffOpen(false)} className={btn.ghost}>
                Back to chat
              </button>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <p className="text-sm leading-relaxed text-muted">
                Here is everything your agent needs: this task and your chat, plus the full operator prompt with every capability and the automatic setup, so it can pick up right
                where we left off and set everything up. There is no token in here: an agent that is already connected has its own access from the Connect page.
              </p>
              <pre className="whitespace-pre-wrap break-words rounded-xl border border-line bg-surface-2 p-3 font-mono text-[12.5px] leading-relaxed">{handoff}</pre>
              {copyFailed && (
                <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                  Copy did not work in this browser. You can select the text above by hand.
                </p>
              )}
              <p className="text-xs leading-relaxed text-muted">
                Not connected yet? Set up your agent on the{" "}
                <Link href={userId ? "/app/connect" : "/demo/connect"} className="font-medium text-accent hover:underline">
                  Connect page
                </Link>
                , then paste this there.
              </p>
            </div>
            <footer className="border-t border-line px-4 py-3">
              <button type="button" className={cx(btn.primary, "w-full")} onClick={copyHandoff}>
                {copied ? "Copied, ready to paste" : "Copy for my agent"}
              </button>
            </footer>
          </div>
        )}
      </div>
    </>
  );
}
