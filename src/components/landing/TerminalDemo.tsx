"use client";

import { useEffect, useRef, useState } from "react"; 
import { IconUndo } from "@/components/icons";

/**
 * The MCP section's terminal, typed live instead of sitting as a static
 * block of text. Lines appear one at a time once the section scrolls
 * into view; a replay button runs it again. Under reduced motion the
 * whole transcript renders at once — no typing, no waiting.
 */
const LINES: { symbol: string; symbolTone: "dim" | "plain" | "good" | "bad"; text: string }[] = [
  { symbol: "$", symbolTone: "dim", text: " claude mcp add --transport http pulse-find" },
  { symbol: "", symbolTone: "dim", text: "    https://pulsefind-app.vercel.app/api/mcp" },
  { symbol: "", symbolTone: "dim", text: '    --header "Authorization: Bearer pf_…"' },
  { symbol: "", symbolTone: "plain", text: "" },
  { symbol: ">", symbolTone: "plain", text: " Scan my email from the last week and update Pulse Find." },
  { symbol: "", symbolTone: "plain", text: "" },
  { symbol: "✓", symbolTone: "good", text: " Roblox · OA received · due Nov 11" },
  { symbol: "✓", symbolTone: "good", text: " Ramp · new application" },
  { symbol: "!", symbolTone: "bad", text: ' "Global Corp" · likely a fake job offer, nothing added' },
];

const SYMBOL_CLASS = {
  dim: "text-faint",
  plain: "text-ink",
  good: "text-good",
  bad: "text-danger",
} as const;

export function TerminalDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      const t = window.setTimeout(() => setStarted(true), 0);
      return () => window.clearTimeout(t);
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const t = window.setTimeout(() => setShown(LINES.length), 0);
      return () => window.clearTimeout(t);
    }
    if (shown >= LINES.length) return;
    const t = window.setTimeout(() => setShown((s) => s + 1), shown === 0 ? 350 : 480);
    return () => window.clearTimeout(t);
  }, [started, shown]);

  const done = shown >= LINES.length;
  return (
    <div ref={ref} className="min-w-0">
      <pre className="min-w-0 overflow-x-auto rounded-2xl border border-line bg-bg p-4 font-mono text-[12.5px] leading-relaxed text-muted">
        {LINES.slice(0, shown).map((line, i) => (
          <span key={i}>
            {line.symbol && <span className={SYMBOL_CLASS[line.symbolTone]}>{line.symbol}</span>}
            {line.text}
            {"\n"}
          </span>
        ))}
        {!done && <span className="landing-caret text-accent">▌</span>}
      </pre>
      <p className="mt-3 text-right">
        <button
          type="button"
          onClick={() => setShown(0)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:brightness-110"
          aria-label="Replay the terminal demo"
        >
          <IconUndo className="h-3 w-3" /> Replay
        </button>
      </p>
    </div>
  );
}
