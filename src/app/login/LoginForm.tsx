"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import ResendConfirmation from "@/components/ResendConfirmation";
import {
  getAuthCallbackUrl,
  getEmailRedirectTo,
  isAlreadyRegisteredMessage,
  isExistingUserSignUp,
} from "@/lib/auth-redirect";
import { trackEvent } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/client";
import { isConfigured } from "@/lib/env";
import { btn, field } from "@/components/dashboard/ui";

/** Session marker set just before the Google OAuth redirect; the dashboard
 *  consumes it on arrival to fire google_signin_completed. */
export const GOOGLE_SIGNIN_MARKER = "pulse-find-google-signin";

/**
 * Rate-limit pre-flight (POST /api/auth/attempt). Only a 429 blocks:
 * any other response, a missing route, or a network error must never
 * keep a real user out of sign-in, so every failure path returns true.
 */
async function authAttemptAllowed(email: string): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/attempt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return res.status !== 429;
  } catch {
    return true;
  }
}

export function LoginForm({ initialMode }: { initialMode?: "signin" | "signup" } = {}) {
  const params = useSearchParams();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">(
    initialMode ?? (params.get("mode") === "signup" ? "signup" : "signin"),
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    params.get("error") === "link"
      ? "That sign-in link expired or was already used. Sign in below."
      : "",
  );
  const [sent, setSent] = useState(false);
  const [alreadyHaveAccount, setAlreadyHaveAccount] = useState(false);
  const nextParam = params.get("next") ?? "/app";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/app";

  function goToSignIn() {
    // A plain link to /login is not enough when the user is already on
    // /login in sign-up mode: the form state would stay put. Switch the
    // form to sign-in mode explicitly, then go to the login page.
    setSent(false);
    setAlreadyHaveAccount(false);
    setMode("signin");
    router.replace("/login");
  }

  async function signInWithGoogle() {
    if (!isConfigured())
      return setError("Sign-in isn't set up on this copy of Pulse Find yet. Try the demo instead.");
    trackEvent("google_signin_started");
    setBusy(true);
    setError("");
    const supabase = createClient();
    try {
      try {
        window.sessionStorage.setItem(GOOGLE_SIGNIN_MARKER, "1");
      } catch {
        // Storage is optional; the event marker is best-effort.
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: getAuthCallbackUrl(next) },
      });
      if (error) throw error;
      // Success: the browser is leaving for Google; the auth callback
      // brings the user back with a session.
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Google sign-in didn't start. Try again.");
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setAlreadyHaveAccount(false);
    if (!isConfigured())
      return setError("Sign-in isn't set up on this copy of Pulse Find yet. Try the demo instead.");
    if (password.length < 8) return setError("Use at least 8 characters for your password.");
    if (!(await authAttemptAllowed(email)))
      return setError("Too many attempts. Wait a minute and try again.");
    setBusy(true);
    setError("");
    const supabase = createClient();
    try {
      if (mode === "signup") {
        trackEvent("signup_started");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: getEmailRedirectTo(next),
            data: { display_name: name.trim() || undefined },
          },
        });
        if (error) throw error;
        if (isExistingUserSignUp(data)) {
          // Supabase sends no confirmation email for an email that already
          // has an account, so never show "check your email" for it.
          setAlreadyHaveAccount(true);
          return;
        }
        trackEvent("signup_completed");
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
      if (mode === "signup" && isAlreadyRegisteredMessage(msg)) {
        setAlreadyHaveAccount(true);
        return;
      }
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

  if (alreadyHaveAccount) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-panel">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-xl">
          ✓
        </div>
        <h1 className="mt-4 font-display text-xl font-bold">You already have an account</h1>
        <p className="mt-2 text-sm text-muted">
          This email already has a Pulse Find account, so no new confirmation email is sent.
          Sign in with your existing password instead.
        </p>
        <button type="button" onClick={goToSignIn} className={`${btn.primary} mt-5 inline-flex w-full justify-center`}>
          Go to sign in
        </button>
        <button
          type="button"
          onClick={() => setAlreadyHaveAccount(false)}
          className="mt-3 w-full text-center text-sm text-muted underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-panel">
        <h1 className="font-display text-xl font-bold">Check your email</h1>
        <p className="mt-2 text-sm text-muted">
          We sent a confirmation link to <b className="text-ink">{email}</b>. Open it on this device
          to finish creating your account.
        </p>
        <ResendConfirmation email={email} onEmailChange={setEmail} next={next} onGoToSignIn={goToSignIn} />
      </div>
    );
  }

  return (
    <>
      <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-6 shadow-panel">
        <h1 className="font-display text-2xl font-extrabold tracking-tight">
          {mode === "signup" ? "Create your tracker" : "Welcome back"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {mode === "signup" ? "Free. Your applications are private to you." : "Sign in to see what's waiting on you."}
        </p>
        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={busy}
          className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-accent/50 disabled:opacity-60"
        >
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.58v2.97h3.88c2.27-2.09 3.57-5.17 3.57-8.74Z" />
            <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.92l-3.88-2.97c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.29v3.07A11.99 11.99 0 0 0 12 24Z" />
            <path fill="#FBBC05" d="M5.29 14.31A7.2 7.2 0 0 1 4.91 12c0-.8.14-1.58.38-2.31V6.62H1.29a12 12 0 0 0 0 10.76l4-3.07Z" />
            <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.58 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 11.99 11.99 0 0 0 1.29 6.62l4 3.07C6.23 6.86 8.88 4.75 12 4.75Z" />
          </svg>
          Continue with Google
        </button>
        <div className="mt-4 flex items-center gap-3 text-xs text-faint" aria-hidden="true">
          <span className="h-px flex-1 bg-line" />
          or with email
          <span className="h-px flex-1 bg-line" />
        </div>
        <div className="mt-5 flex flex-col gap-3">
          {mode === "signup" && (
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted" htmlFor="l-name">
              First name
              <input id="l-name" className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={60} />
            </label>
          )}
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted" htmlFor="l-email">
            Email
            <input id="l-email" type="email" required className={field} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@work.com" autoComplete="email" />
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
          {mode === "signin" && (
            <div className="text-right">
              <Link href="/forgot-password" className="text-sm font-medium text-accent hover:brightness-110">
                Forgot password?
              </Link>
            </div>
          )}
        </div>
        {error && <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <button type="submit" className={`${btn.primary} mt-5 w-full py-2.5`} disabled={busy}>
          {busy ? "One sec…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>
        <p className="mt-4 text-center text-sm text-muted">
          {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
          <button type="button" data-tour="connect-signup" className="font-semibold text-accent" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(""); setAlreadyHaveAccount(false); }}>
            {mode === "signup" ? "Sign in" : "Create an account"}
          </button>
        </p>
        <p className="mt-2 text-center text-xs text-faint">
          Just looking? <Link href="/demo" className="underline underline-offset-2">Open the demo</Link>
        </p>
      </form>
      {mode === "signin" && (
        <ResendConfirmation email={email} onEmailChange={setEmail} next={next} onGoToSignIn={goToSignIn} />
      )}
    </>
  );
}
