"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ImportDialog } from "./dashboard/ImportDialog";
import { btn, field, Panel } from "./dashboard/ui";
import { buildAgentPrompt, getMcpEndpoint } from "@/lib/agent-prompt";
import { createAgentToken } from "@/lib/agent-tokens";
import { trackEvent } from "@/lib/analytics";
import { todayISO } from "@/lib/metrics";
import { dedupeImport } from "@/lib/sheet";
import { accountStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { emptyApplication, type Application, type ApplicationInput } from "@/lib/types";

const SETUP_DONE_COOKIE =
  "pulse-find-setup-done=1; path=/; max-age=31536000; SameSite=Lax";

const STEPS = [
  "Add your tracker",
  "Connect your agent",
  "Give your agent its instructions",
];

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={btn.secondary}
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        }
      }}
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

/**
 * Guided first-run setup: get one application into the tracker (import
 * a sheet or add one by hand) and land on the dashboard — that is the
 * success moment, no agent or token required. The agent-connect and
 * agent-prompt steps stay for users who want them, clearly optional
 * and skippable. Shown to new or empty accounts right after login
 * (see src/app/app/setup/page.tsx) and linked from Connect your agent.
 */
export default function SetupWizard({ userId }: { userId: string }) {
  const router = useRouter();
  const store = useMemo(() => accountStore(createClient(), userId), [userId]);

  const [step, setStep] = useState(1);
  const [apps, setApps] = useState<Application[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
  } | null>(null);
  const [manualCompany, setManualCompany] = useState("");
  const [manualRole, setManualRole] = useState("");
  const [manualLink, setManualLink] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [tokenName, setTokenName] = useState("My agent");
  const [token, setToken] = useState<string | null>(null);
  const [creatingToken, setCreatingToken] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState(() => getMcpEndpoint());

  useEffect(() => {
    let live = true;
    void Promise.resolve().then(() => {
      if (live) setEndpoint(getMcpEndpoint(window.location.origin));
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    store
      .load()
      .then((state) => {
        if (!cancelled) setApps(state.apps);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [store]);

  async function handleImport(inputs: ApplicationInput[]) {
    const { fresh, duplicates } = dedupeImport(inputs, apps);
    const made = fresh.length ? await store.createMany(fresh) : [];
    if (apps.length === 0 && made.length > 0) trackEvent("first_import_completed");
    setApps((prev) => [...made, ...prev]);
    setImportResult({ imported: made.length, skipped: duplicates.length });
  }

  async function handleManualAdd() {
    const company = manualCompany.trim();
    if (!company) {
      setManualError("Add the company name first.");
      return;
    }
    setManualError(null);
    setManualBusy(true);
    try {
      const made = await store.create({
        ...emptyApplication(todayISO()),
        company,
        role: manualRole.trim(),
        link: manualLink.trim(),
      });
      if (apps.length === 0) trackEvent("first_application_added");
      setApps((prev) => [made, ...prev]);
      setManualCompany("");
      setManualRole("");
      setManualLink("");
    } catch (err) {
      setManualError(
        err instanceof Error ? err.message : "Could not save that application. Try again.",
      );
    } finally {
      setManualBusy(false);
    }
  }

  async function handleCreateToken() {
    setTokenError(null);
    setCreatingToken(true);
    try {
      const created = await createAgentToken(tokenName);
      setToken(created.token);
    } catch (err) {
      setTokenError(
        err instanceof Error ? err.message : "Could not create the token. Try again.",
      );
    } finally {
      setCreatingToken(false);
    }
  }

  function finishSetup() {
    document.cookie = SETUP_DONE_COOKIE;
    try {
      window.localStorage.setItem("pulse-find-setup-done", "1");
    } catch {
      // Storage is optional; the cookie is what keeps the wizard from returning.
    }
    router.push("/app");
    router.refresh();
  }

  const prompt = token ? buildAgentPrompt({ endpoint, token }) : "";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Get set up</h1>
        <p className="mt-1 text-sm text-muted">
          Two minutes and you&apos;re done: add an application or import your
          sheet, and your dashboard takes it from there. The agent steps
          after that are optional — set them up whenever you like, or never.
        </p>
      </div>

      <ol className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {STEPS.map((label, index) => {
          const number = index + 1;
          const done = number < step;
          const current = number === step;
          const reachable = number === 1 || number === 2 || Boolean(token);
          return (
            <li key={label} className="flex-1">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => setStep(number)}
                aria-current={current ? "step" : undefined}
                className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                  current
                    ? "border-accent bg-accent font-semibold text-accent-ink"
                    : done
                      ? "border-good/40 text-good"
                      : "border-line text-faint"
                }`}
              >
                <span aria-hidden="true">{done ? "✓" : number}</span>
                <span>
                  Step {number} — {label}
                  {number > 1 ? " (optional)" : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <Panel>
          <h2 className="text-lg font-semibold">Step 1 — Add your tracker</h2>
          <p className="mt-1 text-sm text-muted">
            Import the sheet you already use (CSV or .xlsx — Pulse Find reads
            the same columns as the sheet export, and the dialog offers a
            blank template too), or add one application by hand below.
            Landing on your dashboard with your data in it is the whole
            point of setup.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={btn.primary}
              onClick={() => setImportOpen(true)}
            >
              Import a sheet (.xlsx or .csv)
            </button>
          </div>
          <div className="mt-6 border-t border-line pt-5">
            <p className="text-sm font-medium">Or add one application by hand</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="block text-sm font-medium">
                Company
                <input
                  className={field}
                  value={manualCompany}
                  onChange={(event) => setManualCompany(event.target.value)}
                  placeholder="Stripe"
                />
              </label>
              <label className="block text-sm font-medium">
                Role
                <input
                  className={field}
                  value={manualRole}
                  onChange={(event) => setManualRole(event.target.value)}
                  placeholder="SWE Intern"
                />
              </label>
              <label className="block text-sm font-medium">
                Posting link (optional)
                <input
                  className={field}
                  value={manualLink}
                  onChange={(event) => setManualLink(event.target.value)}
                  placeholder="https://…"
                />
              </label>
            </div>
            <div className="mt-3">
              <button
                type="button"
                className={btn.secondary}
                disabled={manualBusy}
                onClick={handleManualAdd}
              >
                {manualBusy ? "Adding…" : "Add application"}
              </button>
            </div>
            {manualError && (
              <p role="alert" className="mt-3 text-sm text-danger">
                {manualError}
              </p>
            )}
          </div>
          {importResult && (
            <p
              role="status"
              className="mt-4 rounded-lg border border-good/30 bg-good-soft px-3 py-2 text-sm text-good"
            >
              Imported {importResult.imported} application
              {importResult.imported === 1 ? "" : "s"}. Skipped{" "}
              {importResult.skipped} duplicate
              {importResult.skipped === 1 ? "" : "s"} already in your tracker.
              Your tracker now has {apps.length} application
              {apps.length === 1 ? "" : "s"}.
            </p>
          )}
          {apps.length > 0 ? (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={btn.primary}
                onClick={finishSetup}
              >
                See my dashboard
              </button>
              <button
                type="button"
                className={btn.ghost}
                onClick={() => setStep(2)}
              >
                Set up the agent too (optional)
              </button>
            </div>
          ) : (
            <p className="mt-6 text-sm text-muted">
              Add at least one application above and you&apos;re set — or use
              &ldquo;Skip setup for now&rdquo; below and add them later.
            </p>
          )}
          <ImportDialog
            open={importOpen}
            onClose={() => setImportOpen(false)}
            onImport={handleImport}
          />
        </Panel>
      )}

      {step === 2 && (
        <Panel>
          <h2 className="text-lg font-semibold">Step 2 — Connect your agent (optional)</h2>
          <p className="mt-1 text-sm text-muted">
            Optional — your tracker works fine without an agent. If you use
            one, it talks to Pulse Find through the MCP server. Create one
            API token for it — Pulse Find stores only a hash of the token, so
            keep the copy below safe.
          </p>
          {!token && (
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium">
                Token name
                <input
                  className={field}
                  value={tokenName}
                  onChange={(event) => setTokenName(event.target.value)}
                  placeholder="My agent"
                />
              </label>
              <div>
                <button
                  type="button"
                  className={btn.primary}
                  disabled={creatingToken}
                  onClick={handleCreateToken}
                >
                  {creatingToken ? "Creating token…" : "Create API token"}
                </button>
              </div>
              {tokenError && (
                <p role="alert" className="text-sm text-danger">
                  {tokenError}
                </p>
              )}
            </div>
          )}
          {token && (
            <div className="mt-4 space-y-3">
              <p
                role="status"
                className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-warn"
              >
                This token is shown once. Copy it now — you won&apos;t be able
                to see it again. You can revoke it or create more tokens
                anytime from{" "}
                <Link href="/app/connect" className="underline">
                  Connect your agent
                </Link>
                .
              </p>
              <div>
                <p className="text-sm font-medium">Your API token</p>
                <code className="mt-1 block break-all rounded-lg border border-line bg-surface-2 p-3 font-mono text-sm">
                  {token}
                </code>
                <div className="mt-2">
                  <CopyButton text={token} label="Copy token" />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium">MCP endpoint</p>
                <code className="mt-1 block break-all rounded-lg border border-line bg-surface-2 p-3 font-mono text-sm">
                  {endpoint}
                </code>
                <div className="mt-2">
                  <CopyButton text={endpoint} label="Copy endpoint" />
                </div>
              </div>
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              className={btn.secondary}
              onClick={() => setStep(1)}
            >
              Back
            </button>
            <button
              type="button"
              className={btn.primary}
              disabled={!token}
              onClick={() => setStep(3)}
            >
              Continue to step 3
            </button>
            <button
              type="button"
              className={btn.ghost}
              onClick={finishSetup}
            >
              Skip for now — go to my dashboard
            </button>
          </div>
        </Panel>
      )}

      {step === 3 && (
        <Panel>
          <h2 className="text-lg font-semibold">
            Step 3 — Give your agent its instructions (optional)
          </h2>
          <p className="mt-1 text-sm text-muted">
            Optional, like step 2. Paste this into any AI agent — ChatGPT, Claude, Gemini, or your own.
            Your MCP endpoint and API token are already filled in.
          </p>
          {!token ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-muted">
                Create your API token in step 2 first, so the prompt can include it.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className={btn.primary}
                  onClick={() => setStep(2)}
                >
                  Back to step 2
                </button>
                <button
                  type="button"
                  className={btn.ghost}
                  onClick={finishSetup}
                >
                  Skip for now — go to my dashboard
                </button>
              </div>
            </div>
          ) : (
            <>
              <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface-2 p-4 font-mono text-xs leading-relaxed">
                {prompt}
              </pre>
              <div className="mt-4 flex flex-wrap gap-3">
                <CopyButton text={prompt} label="Copy the whole prompt" />
                <button
                  type="button"
                  className={btn.primary}
                  onClick={finishSetup}
                >
                  Finish — go to my dashboard
                </button>
                <button
                  type="button"
                  className={btn.secondary}
                  onClick={() => setStep(2)}
                >
                  Back
                </button>
              </div>
            </>
          )}
        </Panel>
      )}

      <p className="text-center text-sm">
        <button type="button" className="text-muted underline" onClick={finishSetup}>
          Skip setup for now
        </button>
      </p>
    </div>
  );
}
