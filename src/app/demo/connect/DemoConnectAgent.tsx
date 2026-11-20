"use client";

import { useState } from "react";
import Link from "next/link";
import { buildAgentPrompt } from "@/lib/agent-prompt";
import { btn, cx, Panel } from "@/components/dashboard/ui";

/**
 * The Connect-agent page for signed-out demo visitors. It mirrors the
 * signed-in Connect page's four steps, but it is demo-safe: the token is
 * the placeholder pf_YOUR_TOKEN everywhere, no token is created, and
 * nothing here touches Supabase or the token table. A visitor who
 * wants a real token signs up from here instead.
 *
 * The per-client snippets mirror src/app/app/connect/ConnectAgent.tsx
 * on purpose (duplicated, not shared): the signed-in page keeps its
 * own copy, so a change here can never break it.
 *
 * The copy buttons sit in flow above their code blocks, not overlaid
 * on them: the overlaid version covered the end of the snippet on
 * narrow screens and covered prompt text in step 4 (and more once
 * the prompt block was scrolled).
 */

const PLACEHOLDER_TOKEN = "pf_YOUR_TOKEN";

// The four example questions for step 3. The first carries a "(Uses the
// scan_inbox prompt.)" note and the fourth a "[paste it]" note: both are
// hints for the human reading the page, not part of the question, so Copy
// takes the askable question only. For the fourth, paste the email after
// the question.
const EXAMPLE_QUESTIONS: { display: string; copy: string }[] = [
  {
    display: "Scan my email from the last 7 days and update Pulse Find. (Uses the scan_inbox prompt.)",
    copy: "Scan my email from the last 7 days and update Pulse Find.",
  },
  {
    display: "What's waiting on me in my job search, soonest first?",
    copy: "What's waiting on me in my job search, soonest first?",
  },
  {
    display: "Find remote software engineering internships posted this week.",
    copy: "Find remote software engineering internships posted this week.",
  },
  {
    display: "Is this recruiter email a scam? [paste it]",
    copy: "Is this recruiter email a scam?",
  },
];

const CLIENTS = ["Claude Code", "Cursor", "VS Code", "Claude Desktop", "Other"] as const;
type ClientName = (typeof CLIENTS)[number];

function snippet(client: ClientName, url: string, token: string) {
  const auth = `Bearer ${token}`;
  switch (client) {
    case "Claude Code":
      return `claude mcp add --transport http pulse-find ${url} \\\n  --header "Authorization: ${auth}"`;
    case "Cursor":
      return JSON.stringify({ mcpServers: { "pulse-find": { url, headers: { Authorization: auth } } } }, null, 2);
    case "VS Code":
      return JSON.stringify({ servers: { "pulse-find": { type: "http", url, headers: { Authorization: auth } } } }, null, 2);
    case "Claude Desktop":
      return JSON.stringify(
        { mcpServers: { "pulse-find": { command: "npx", args: ["-y", "mcp-remote", url, "--header", "Authorization:${PF_AUTH}"], env: { PF_AUTH: auth } } } },
        null,
        2,
      );
    default:
      return `URL:        ${url}
Transport:  Streamable HTTP
Header:     Authorization: ${auth}`;
  }
}

const WHERE: Record<ClientName, string> = {
  "Claude Code": "Run this in your terminal.",
  Cursor: "Add to ~/.cursor/mcp.json (or .cursor/mcp.json in a project).",
  "VS Code": "Add to .vscode/mcp.json, then start the server from the MCP view.",
  "Claude Desktop": "Add to claude_desktop_config.json (Settings → Developer → Edit config). Needs Node.js.",
  Other: "Any MCP client that supports Streamable HTTP and custom headers.",
};

export function DemoConnectAgent() {
  const [client, setClient] = useState<ClientName>("Claude Code");
  const [snippetCopied, setSnippetCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [copiedQuestion, setCopiedQuestion] = useState<number | null>(null);
  // The origin is only known on the client; the lazy initializer reads it
  // on first render (in production it matches the fallback, so the server
  // and client render the same). No effect, so no extra render pass.
  const [origin] = useState(
    () => (typeof window !== "undefined" ? window.location.origin : "https://pulsefind-app.vercel.app"),
  );

  const url = `${origin}/api/mcp`;
  const prompt = buildAgentPrompt({ endpoint: url, token: PLACEHOLDER_TOKEN });

  async function copy(text: string, done: (v: boolean) => void) {
    try {
      await navigator.clipboard.writeText(text);
      done(true);
      setTimeout(() => done(false), 2600);
    } catch {
      // Clipboard blocked: the text stays visible in the code block, so
      // the visitor can still select it by hand.
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-8 sm:py-10">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Connect your AI agent</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Pulse Find is an MCP server. Give any agent you already use (Claude, Cursor, Copilot and others) an access token and it can
          read your tracker, log new applications, turn job emails into updates and search open roles. Your agent does the reading with
          its own email tools; Pulse Find never sees your inbox.
        </p>
        <div className="mt-4 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm leading-relaxed">
          <b>Demo mode.</b> The token below is a placeholder — this page creates nothing and touches no account.{" "}
          <Link href="/signup" className="font-semibold text-accent underline-offset-2 hover:underline">
            Sign up to get a real token →
          </Link>
        </div>
      </header>

      <Panel title="1. Create an access token" hint="In the demo, this is a placeholder. A real token is created after you sign up.">
        <div className="space-y-3">
          {/* No Copy button here on purpose: this is a placeholder, not a
          working token, and copying it would hand a visitor a dead token
          to paste into an agent config. It stays visible as an example
          of what a real token looks like. */}
          <code className="block break-all rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 font-mono text-[13px]">{PLACEHOLDER_TOKEN}</code>
          <p className="text-xs text-muted">
            After you sign up, your Connect page creates a real token for you. It is shown once, and Pulse Find stores only a
            fingerprint of it.
          </p>
          <Link href="/signup" className={btn.primary}>
            Sign up to get a real token
          </Link>
        </div>
      </Panel>

      <Panel title="2. Add Pulse Find to your agent" hint={WHERE[client]}>
        <div className="mb-3 flex flex-wrap gap-1.5" role="tablist">
          {CLIENTS.map((c) => (
            <button key={c} role="tab" aria-selected={c === client} onClick={() => setClient(c)}
              className={cx("rounded-full border px-3 py-1 text-xs font-medium transition", c === client ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-ink")}>
              {c}
            </button>
          ))}
        </div>
        <div className="mb-2 flex justify-end">
          <button className={btn.ghost} onClick={() => void copy(snippet(client, url, PLACEHOLDER_TOKEN), setSnippetCopied)}>
            {snippetCopied ? "Copied" : "Copy"}
          </button>
        </div>
        {/* The Claude Code command is one long line; the JSON snippets
        are already multi-line. Wrapping here (like the step-4 prompt
        block) keeps the whole command readable at once instead of
        behind a horizontal scrollbar. Copy still takes the exact
        snippet string, not the wrapped rendering. */}
        <pre className="whitespace-pre-wrap break-words rounded-xl border border-line bg-surface-2 p-3 font-mono text-[12.5px] leading-relaxed">{snippet(client, url, PLACEHOLDER_TOKEN)}</pre>
        <p className="mt-2 text-xs text-muted">Claude Code shows a terminal command; Cursor, VS Code and Claude Desktop show a JSON config; Other shows the connection details.</p>
        <p className="mt-2 text-xs text-faint">Replace pf_YOUR_TOKEN with the real token from step 1 after you sign up.</p>
      </Panel>

      <Panel title="3. Ask your agent" hint="Try one of these.">
        <ul className="space-y-2 text-sm">
          {EXAMPLE_QUESTIONS.map((q, i) => (
            <li key={q.display} className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-ink">
              <span className="min-w-0 flex-1">&ldquo;{q.display}&rdquo;</span>
              <button
                type="button"
                className={btn.ghost}
                aria-label={`Copy question ${i + 1}`}
                onClick={() => void copy(q.copy, (v) => setCopiedQuestion(v ? i : null))}
              >
                {copiedQuestion === i ? "Copied" : "Copy"}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Tools: get_summary, list_applications, add_application, update_application, process_job_email, check_job_scam, search_jobs.
          Agents are told to stay read-only in your inbox and never send email or apply for you.
        </p>
      </Panel>

      <Panel title="4. Copy the full agent prompt" hint="Everything your agent needs, in one paste.">
        <p className="text-sm leading-relaxed text-muted">
          This is the full operator prompt: every capability, the automatic setup (your spreadsheet, Gmail, the inbox
          scan), and the rules. Paste it into your agent and it sets everything up, so you can hop back into the
          dashboard and start using it with nothing else to do.
        </p>
        <div className="mb-2 mt-3 flex justify-end">
          <button className={btn.ghost} onClick={() => void copy(prompt, setPromptCopied)}>
            {promptCopied ? "Copied" : "Copy full prompt"}
          </button>
        </div>
        <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-line bg-surface-2 p-3 font-mono text-[12.5px] leading-relaxed">
          {prompt}
        </pre>
        <p className="mt-2 text-xs text-faint">Replace pf_YOUR_TOKEN with the real token from step 1 after you sign up.</p>
      </Panel>

      <div className="flex flex-wrap gap-2 pb-2">
        <Link href="/demo" className={btn.secondary}>
          ← Back to the demo
        </Link>
        <Link href="/signup" className={btn.primary}>
          Sign up to get a real token
        </Link>
      </div>
    </main>
  );
}
