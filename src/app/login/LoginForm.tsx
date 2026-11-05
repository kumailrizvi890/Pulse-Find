"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isConfigured } from "@/lib/env";
import { btn, field } from "@/components/dashboard/ui";

export function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">(params.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get("error") === "link" ? "That sign-in link expired or was already used. Sign in below." : "");
  const [sent, setSent] = useState(false);
  const nextParam = params.get("next") ?? "/app";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/app";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isConfigured()) return setError("Sign-in isn't set up on this copy of Pulse Find yet. Try the demo instead.");
    if (password.length < 8) return setError("Use at least 8 characters for your password.");
    setBusy(true);
    setError("");
    const supabase = createClient();
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
            data: { display_name: name.trim() || undefined },
          },
        });
        if (error) throw error;
        if (data.session) {
          router.replace(next);
          router.refresh();
        } else setSent(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next);
        router.refresh();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(
        /invalid login/i.test(msg)
          ? "That email and password don't match. Check them, or create an account."
          : /already registered/i.test(msg)
            ? "There's already an account with that email. Sign in instead."
            : /rate limit/i.test(msg)
              ? "Too many attempts. Wait a minute and try again."
              : msg || "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-panel">
        <h1 className="font-display text-xl font-bold">Check your email</h1>
        <p className="mt-2 text-sm text-muted">
          We sent a confirmation link to <b className="text-ink">{email}</b>. Open it on this device to finish creating your account.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-6 shadow-panel">
      <h1 className="font-display text-2xl font-extrabold tracking-tight">{mode === "signup" ? "Create your tracker" : "Welcome back"}</h1>
      <p className="mt-1 text-sm text-muted">{mode === "signup" ? "Free. Your applications are private to you." : "Sign in to see what's waiting on you."}</p>
      <div className="mt-5 flex flex-col gap-3">
        {mode === "signup" && (
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted" htmlFor="l-name">
            First name
            <input id="l-name" className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={60} />
          </label>
        )}
        <label className="flex flex-col gap-1.5 text-xs font-medium text-muted" htmlFor="l-email">
          Email
          <input id="l-email" type="email" required className={field} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-muted" htmlFor="l-pass">
          Password
          <input
            id="l-pass"
            type="password"
            required
            minLength={8}
            className={field}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </label>
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <button type="submit" className={`${btn.primary} mt-5 w-full py-2.5`} disabled={busy}>
        {busy ? "One sec…" : mode === "signup" ? "Create account" : "Sign in"}
      </button>
      <p className="mt-4 text-center text-sm text-muted">
        {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
        <button type="button" className="font-semibold text-accent" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(""); }}>
          {mode === "signup" ? "Sign in" : "Create an account"}
        </button>
      </p>
      <p className="mt-2 text-center text-xs text-faint">
        Just looking? <Link href="/demo" className="underline underline-offset-2">Open the demo</Link>
      </p>
    </form>
  );
}
