"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getPasswordResetRedirectTo } from "@/lib/auth-redirect";
import { isConfigured } from "@/lib/env";
import { btn, field } from "@/components/dashboard/ui";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isConfigured()) {
      setError("Password reset is not set up on this copy of Pulse Find yet.");
      return;
    }
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: getPasswordResetRedirectTo(),
    });
    setBusy(false);
    if (error) {
      const msg = error.message;
      setError(
        /rate limit/i.test(msg)
          ? "Too many attempts. Wait a minute and try again."
          : msg || "Something went wrong. Try again.",
      );
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-panel">
        <h1 className="font-display text-xl font-bold tracking-tight">Check your email</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          If an account exists for <span className="font-medium text-ink">{email}</span>, we sent
          it a password reset link. The link expires soon, so use it promptly.
        </p>
        <Link href="/login" className="mt-5 block w-full text-center text-sm text-muted">
          Back to <span className="font-semibold text-accent">sign in</span>
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-line bg-surface p-5 shadow-panel"
    >
      <h1 className="font-display text-xl font-bold tracking-tight">Reset your password</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        Enter the email you signed up with and we will send you a link to choose a new password.
      </p>
      <label className="mt-4 flex flex-col gap-1.5 text-xs font-medium text-muted" htmlFor="fp-email">
        Email
        <input
          id="fp-email"
          type="email"
          className={field}
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          placeholder="you@work.com"
          autoComplete="email"
          required
        />
      </label>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" className={`${btn.primary} mt-5 w-full py-2.5`} disabled={busy}>
        {busy ? "Sending…" : "Send reset link"}
      </button>
      <Link href="/login" className="mt-5 block w-full text-center text-sm text-muted">
        Remembered it? <span className="font-semibold text-accent">Sign in</span>
      </Link>
    </form>
  );
}
