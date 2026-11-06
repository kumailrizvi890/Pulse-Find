"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { btn, cx, field, Panel } from "@/components/dashboard/ui";

type TokenRow = { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null };

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** 40 random alphanumerics from the browser's CSPRNG (rejection sampling keeps it unbiased). */
function newToken() {
  let out = "";
  while (out.length < 40) {
    for (const b of crypto.getRandomValues(new Uint8Array(64))) {
      if (b < 248 && out.length < 40) out += ALPHABET[b % 62];
    }
  }
  return `pf_${out}`;
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

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
      return `URL:        ${url}\nTransport:  Streamable HTTP\nHeader:     Authorization: ${auth}`;
  }
}

const WHERE: Record<ClientName, string> = {
  "Claude Code": "Run this in your terminal.",
  Cursor: "Add to ~/.cursor/mcp.json (or .cursor/mcp.json in a project).",
  "VS Code": "Add to .vscode/mcp.json, then start the server from the MCP view.",
  "Claude Desktop": "Add to claude_desktop_config.json (Settings → Developer → Edit config). Needs Node.js.",
  Other: "Any MCP client that supports Streamable HTTP and custom headers.",
};

export function ConnectAgent() {
  const db = useMemo(() => createClient(), []);
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [name, setName] = useState("My agent");
  const [fresh, setFresh] = useState<string | null>(null);
  const [client, setClient] = useState<ClientName>("Claude Code");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reload, setReload] = useState(0);
  const [origin, setOrigin] = useState("https://pulsefind-app.vercel.app");

  useEffect(() => {
    let live = true;
    Promise.resolve().then(() => live && setOrigin(window.location.origin));
    db.from("api_tokens")
      .select("id,name,prefix,created_at,last_used_at,revoked_at")
      .order("created_at", { ascending: false })
      .then(({ data, error: e }) => {
        if (!live) return;
        if (e) setError("Couldn't load your tokens. Refresh to try again.");
        else setTokens((data ?? []) as TokenRow[]);
      });
    return () => { live = false; };
  }, [db, reload]);

  const url = `${origin}/api/mcp`;

  async function create() {
    setBusy(true);
    setError(null);
    const token = newToken();
    const { error: e } = await db.from("api_tokens").insert({
      name: name.trim().slice(0, 60) || "My agent",
      prefix: token.slice(0, 7),
      token_hash: await sha256Hex(token),
    });
    setBusy(false);
    if (e) return setError("Couldn't create the token. Try again.");
    setFresh(token);
    setCopied(false);
    setReload((n) => n + 1);
  }

  async function revoke(id: string) {
    const { error: e } = await db.from("api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    if (e) return setError("Couldn't revoke that token.");
    setReload((n) => n + 1);
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  }

  const shown = fresh ?? "pf_YOUR_TOKEN";
  const active = tokens?.filter((t) => !t.revoked_at) ?? [];

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-8 sm:py-10">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Connect your AI agent</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Pulse Find is an MCP server. Give any agent you already use (Claude, Cursor, Copilot and others) an access token and it can
          read your tracker, log new applications, turn job emails into updates and search open roles. Your agent does the reading with
          its own email tools; Pulse Find never sees your inbox.
        </p>
      </header>

      <Panel title="1. Create an access token" hint="It's shown once. Pulse Find stores only a fingerprint of it.">
        {fresh ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 font-mono text-[13px]">{fresh}</code>
              <button className={btn.secondary} onClick={() => copy(fresh)}>{copied ? "Copied" : "Copy"}</button>
            </div>
            <p className="text-xs text-warn">Copy it now. You won&apos;t be able to see it again; if you lose it, revoke it and create a new one.</p>
            <button className={btn.ghost} onClick={() => setFresh(null)}>Done</button>
          </div>
        ) : (
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void create(); }}>
            <input className={cx(field, "min-w-0 flex-1")} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Token name" />
            <button className={btn.primary} disabled={busy}>{busy ? "Creating…" : "Create token"}</button>
          </form>
        )}
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
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
        <div className="relative">
          <pre className="overflow-x-auto rounded-xl border border-line bg-surface-2 p-3 font-mono text-[12.5px] leading-relaxed">{snippet(client, url, shown)}</pre>
          <button className={cx(btn.ghost, "absolute right-1.5 top-1.5 bg-surface")} onClick={() => copy(snippet(client, url, shown))}>Copy</button>
        </div>
        {!fresh && <p className="mt-2 text-xs text-faint">Replace pf_YOUR_TOKEN with the token from step 1.</p>}
      </Panel>

      <Panel title="3. Ask your agent" hint="Try one of these.">
        <ul className="space-y-2 text-sm">
          {[
            "Scan my email from the last 7 days and update Pulse Find. (Uses the scan_inbox prompt.)",
            "What's waiting on me in my job search, soonest first?",
            "Find remote software engineering internships posted this week.",
            "Is this recruiter email a scam? [paste it]",
          ].map((q) => (
            <li key={q} className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-ink">&ldquo;{q}&rdquo;</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Tools: get_summary, list_applications, add_application, update_application, process_job_email, check_job_scam, search_jobs.
          Agents are told to stay read-only in your inbox and never send email or apply for you.
        </p>
      </Panel>

      <Panel title="Your tokens" hint={tokens ? `${active.length} active` : "Loading…"}>
        {tokens && tokens.length === 0 && <p className="text-sm text-muted">No tokens yet.</p>}
        <ul className="divide-y divide-line">
          {tokens?.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className={cx("text-sm font-medium", t.revoked_at && "text-faint line-through")}>{t.name}</p>
                <p className="text-xs text-faint">
                  <code>{t.prefix}…</code> · created {new Date(t.created_at).toLocaleDateString()} ·{" "}
                  {t.revoked_at ? "revoked" : t.last_used_at ? `last used ${new Date(t.last_used_at).toLocaleString()}` : "never used"}
                </p>
              </div>
              {!t.revoked_at && <button className={btn.ghost} onClick={() => revoke(t.id)}>Revoke</button>}
            </li>
          ))}
        </ul>
      </Panel>
    </main>
  );
}
