"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { accountPipelineStore, demoPipelineStore } from "@/lib/pipeline";
import { todayISO } from "@/lib/metrics";
import type { Application, Contact, TrackerEvent } from "@/lib/types";
import {
  answerTaskQuestion,
  buildTaskAgentHandoff,
  DEFAULT_APP_ORIGIN,
  TASK_CHAT_SUGGESTIONS,
  taskChatGreeting,
  type ChatMessage,
  type TaskChatContext,
} from "@/lib/task-chat";
import { btn, cx, fmtDate } from "./ui";

/**
 * The task chatbot. It opens next to the task drawer when a "Waiting on
 * you" item is opened, already knowing the task: company, role, what is
 * due, the link, the history, and the people at that company.
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
@keyframes pf-crystal-glow {
  0%, 100% { filter: drop-shadow(0 0 3px rgba(244, 63, 94, 0.45)); transform: scale(1); }
  50% { filter: drop-shadow(0 0 12px rgba(244, 63, 94, 0.85)); transform: scale(1.07); }
}
.pf-pulse-crystal { animation: pf-crystal-glow 2.8s ease-in-out infinite; }
@keyframes pf-thinking-dot {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40% { transform: translateY(-3px); opacity: 1; }
}
.pf-thinking-dot { animation: pf-thinking-dot 1.1s ease-in-out infinite; }
.pf-thinking-dot:nth-child(2) { animation-delay: 0.15s; }
.pf-thinking-dot:nth-child(3) { animation-delay: 0.3s; }
/* The panel docks from below: a short rise, no slide-across. */
@keyframes pf-chat-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.pf-chat-in { animation: pf-chat-in 0.25s cubic-bezier(0.22, 1, 0.36, 1) backwards; }
/* New messages fade up in place, so the panel growing with the
   conversation reads as motion rather than a jump. */
@keyframes pf-msg-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.pf-msg-in { animation: pf-msg-in 0.25s cubic-bezier(0.22, 1, 0.36, 1) backwards; }
@media (prefers-reduced-motion: reduce) {
  .pf-pulse-crystal, .pf-chat-in, .pf-msg-in { animation: none; }
}
`;

/** Pulse's mark: a small red crystal, gently glowing. */
export function PulseCrystal({ className }: { className?: string }) {
  const rawId = useId();
  const gradId = `pf-crystal-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg viewBox="0 0 48 48" className={cx("pf-pulse-crystal shrink-0", className)} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fb7185" />
          <stop offset="55%" stopColor="#f43f5e" />
          <stop offset="100%" stopColor="#be123c" />
        </linearGradient>
      </defs>
      <polygon points="24,3 39,13 39,29 24,45 9,29 9,13" fill={`url(#${gradId})`} />
      <polyline points="9,13 24,19 39,13" fill="none" stroke="#ffffff" strokeOpacity="0.4" strokeWidth="1" />
      <polyline points="24,3 24,19 24,45" fill="none" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="1" />
      <polyline points="9,29 24,19 39,29" fill="none" stroke="#ffffff" strokeOpacity="0.2" strokeWidth="1" />
      <polygon points="24,3 39,13 24,19 9,13" fill="#ffffff" fillOpacity="0.18" />
    </svg>
  );
}

type Props = {
  application: Application;
  events: TrackerEvent[];
  userId?: string;
  onClose: () => void;
};

export function TaskChatPanel({ application, events, userId, onClose }: Props) {
  const today = todayISO();
  const origin = typeof window !== "undefined" ? window.location.origin : DEFAULT_APP_ORIGIN;
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);
  const idRef = useRef(0);
  const nextId = (prefix: string) => `${prefix}-${++idRef.current}`;
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [contactsState, setContactsState] = useState<"loading" | "ready" | "error">("loading");
  const [contacts, setContacts] = useState<Contact[]>([]);

  const pipeline = useMemo(
    () => (userId ? accountPipelineStore(createClient(), userId) : demoPipelineStore(today)),
    [userId, today],
  );

  useEffect(() => {
    let alive = true;
    pipeline
      .loadContacts()
      .then((rows) => {
        if (!alive) return;
        setContacts(rows.filter((c) => c.company.trim().toLowerCase() === application.company.trim().toLowerCase()));
        setContactsState("ready");
      })
      .catch(() => {
        if (!alive) return;
        setContactsState("error");
      });
    return () => {
      alive = false;
    };
  }, [pipeline, application.company]);

  const ctx: TaskChatContext = useMemo(
    () => ({
      app: application,
      events: events.filter((e) => e.application_id === application.id),
      contacts,
      today,
      origin,
    }),
    [application, events, contacts, today, origin],
  );

  const [messages, setMessages] = useState<ChatMessage[]>(() => [taskChatGreeting(ctx)]);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [onClose]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, thinking]);

  function ask(text: string) {
    const question = text.trim();
    if (!question || thinking) return;
    const userMsg: ChatMessage = { id: nextId("u"), role: "user", text: question };
    setMessages((p) => [...p, userMsg]);
    setInput("");
    setThinking(true);
    timerRef.current = window.setTimeout(() => {
      setMessages((p) => [...p, { ...answerTaskQuestion(question, ctx), id: nextId("a") }]);
      setThinking(false);
    }, 350);
  }

  const handoff = useMemo(
    () => (handoffOpen ? buildTaskAgentHandoff({ ctx, messages }) : ""),
    [handoffOpen, ctx, messages],
  );

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
        drawer, so the backdrop covers the whole screen above it.
      */}
      <button
        type="button"
        aria-label="Close chat"
        className="fixed inset-0 z-40 lg:right-[876px]"
        onClick={onClose}
      />
      <div
        className="pf-chat-in fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-2xl border-t border-line bg-surface/95 shadow-panel backdrop-blur-md lg:inset-x-auto lg:bottom-4 lg:right-[476px] lg:w-[400px] lg:rounded-2xl lg:border lg:max-h-[calc(100dvh-32px)]"
        role="dialog"
        aria-modal="true"
        aria-label={`Chat about ${application.company}`}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <style>{PANEL_CSS}</style>
        {/* Bottom-sheet grabber on phones; hidden on desktop. */}
        <div aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line lg:hidden" />

        <header className="flex items-center gap-3 border-b border-line px-4 py-3.5">
          <PulseCrystal className="h-9 w-9" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold tracking-tight">Ask Pulse</h2>
            <p className="truncate text-xs text-muted">
              {application.company}
              {application.role ? ` · ${application.role}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} className={btn.ghost} aria-label="Close chat">
            Close
          </button>
        </header>

        {/* The list uses flex-auto (basis auto), not flex-1: it sizes to its
            content while the conversation is short, so the panel hugs the
            chat and the composer sits right under it. Once the panel hits
            its max height, min-h-0 lets this list shrink and scroll inside
            instead of pushing the footer off screen. */}
        <div ref={listRef} className="min-h-0 flex-auto space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="pf-msg-in flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2.5 text-sm text-accent-ink shadow-sm">
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={m.id} className="pf-msg-in flex items-start gap-2.5">
                <PulseCrystal className="mt-0.5 h-6 w-6" />
                <div className="min-w-0 max-w-[85%] rounded-2xl rounded-tl-md border border-line bg-surface-2 px-3.5 py-2.5 shadow-sm">
                  <p className="whitespace-pre-line text-sm leading-relaxed">{m.text}</p>
                  {m.links && m.links.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {m.links.map((l) => (
                        <a
                          key={l.href + l.label}
                          href={l.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full border border-accent/30 bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent transition hover:brightness-110"
                        >
                          {l.label} ↗
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ),
          )}
          {thinking && (
            <div className="pf-msg-in flex items-start gap-2.5">
              <PulseCrystal className="mt-0.5 h-6 w-6" />
              <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md border border-line bg-surface-2 px-3.5 py-3 shadow-sm" aria-label="Pulse is thinking">
                <span className="pf-thinking-dot h-1.5 w-1.5 rounded-full bg-accent" />
                <span className="pf-thinking-dot h-1.5 w-1.5 rounded-full bg-accent" />
                <span className="pf-thinking-dot h-1.5 w-1.5 rounded-full bg-accent" />
                <span className="ml-1 text-xs text-muted">Thinking it over…</span>
              </div>
            </div>
          )}
          {contactsState === "error" && (
            <p className="rounded-xl bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn">
              I could not pull up your contacts just now, but you can still ask about the task itself.
            </p>
          )}
          {onlyGreeting && !thinking && (
            <div className="pt-1">
              <p className="mb-2 text-xs text-muted">Not sure where to start? Try one of these:</p>
              <div className="flex flex-wrap gap-1.5">
                {TASK_CHAT_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="border-t border-line px-4 py-3">
          <button type="button" className={cx(btn.secondary, "w-full")} onClick={() => setHandoffOpen(true)}>
            Talk to Agent
          </button>
          <p className="mt-1.5 text-center text-[11px] leading-relaxed text-faint">
            Hands this task, your chat, and the full setup prompt to your connected agent.
          </p>
          <form
            className="mt-2.5 flex items-center gap-2 rounded-full border border-line bg-surface-2 py-1.5 pl-4 pr-1.5 shadow-sm transition focus-within:border-accent/60"
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
          >
            <input
              ref={inputRef}
              className="w-full min-w-0 bg-transparent text-sm text-ink placeholder:text-faint focus:outline-none"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about this task…"
              aria-label="Ask about this task"
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
          {application.action_due && (
            <p className="mt-2 text-center text-[11px] text-muted">
              Due {fmtDate(application.action_due)}
              {application.action_needed ? ` · ${application.action_needed}` : ""}
            </p>
          )}
        </footer>

        {handoffOpen && (
          <div className="absolute inset-0 z-10 flex flex-col bg-surface" role="dialog" aria-modal="true" aria-label="Talk to Agent">
            <header className="flex items-center gap-3 border-b border-line px-4 py-3.5">
              <PulseCrystal className="h-8 w-8" />
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
                Here is everything your agent needs: this task and your chat, plus the full operator prompt with every
                capability and the automatic setup, so it can pick up right where we left off and set everything up.
                Your agent already has your tracker access through Pulse Find, so there is no token in here.
              </p>
              <pre className="whitespace-pre-wrap break-words rounded-xl border border-line bg-surface-2 p-3 font-mono text-[12.5px] leading-relaxed">
                {handoff}
              </pre>
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
