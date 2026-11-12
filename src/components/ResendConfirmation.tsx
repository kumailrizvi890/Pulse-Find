"use client";

import Link from "next/link";
import { useState } from "react";
import { btn, field } from "@/components/dashboard/ui";
import {
  getEmailRedirectTo,
  isAlreadyConfirmedSignUp,
  isRateLimitMessage,
} from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase/client";

type ResendStatus = "idle" | "sending" | "sent" | "already-confirmed" | "rate-limited" | "error";

/**
 * "Didn't get the email? Resend it" — sends a fresh sign-up confirmation
 * email for the address already entered on the page. The redirect in the
 * email always points at the live app, never localhost.
 */
export default function ResendConfirmation({
  email,
  onEmailChange,
  next = "/dashboard",
  onGoToSignIn,
}: {
  email: string;
  onEmailChange: (email: string) => void;
  next?: string;
  onGoToSignIn?: () => void;
}) {
  const [status, setStatus] = useState<ResendStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleResend() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage("Enter the email address you signed up with.");
      setStatus("error");
      return;
    }
    setStatus("sending");
    setErrorMessage("");
    const supabase = createClient();
    // A plain resend cannot tell a confirmed account apart: Supabase
    // returns success for one even though it sends nothing. So the resend
    // goes through sign-up instead. For an address that already has a
    // confirmed account Supabase returns a user with no identities, or an
    // "already registered" error, and the already-confirmed panel below
    // points back to sign-in. For an address that is still unconfirmed,
    // sign-up sends a fresh confirmation email, so that case needs no
    // second call. The password is random and discarded: it is never used
    // to sign in, and an existing account is never changed by the attempt.
    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password: crypto.randomUUID(),
      options: { emailRedirectTo: getEmailRedirectTo(next) },
    });
    if (isAlreadyConfirmedSignUp(data, error?.message)) {
      setStatus("already-confirmed");
      return;
    }
    if (error) {
      const errorStatus = (error as { status?: number }).status;
      if (isRateLimitMessage(error.message, errorStatus)) {
        setStatus("rate-limited");
        return;
      }
      setErrorMessage(error.message);
      setStatus("error");
      return;
    }
    setStatus("sent");
  }

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-sm font-semibold text-white">
        {"Didn't get the email? Resend it"}
      </p>
      <p className="mt-1 text-xs text-zinc-400">
        Enter the email address you signed up with and we will send a new confirmation link.
      </p>
      <label className="mt-3 block text-sm font-medium text-zinc-300" htmlFor="resend-email">
        Email
        <input
          id="resend-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          placeholder="you@example.com"
          className={`${field} mt-1`}
        />
      </label>
      {status === "already-confirmed" ? (
        <div role="alert" className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3">
          <p className="text-sm font-semibold text-amber-200">You already have an account</p>
          <p className="mt-1 text-sm text-zinc-300">
            Your account is already confirmed — sign in below
          </p>
          {onGoToSignIn ? (
            <button type="button" onClick={onGoToSignIn} className={`${btn.primary} mt-3 inline-flex w-full justify-center`}>
              Go to sign in
            </button>
          ) : (
            <Link href="/login" className={`${btn.primary} mt-3 inline-flex w-full justify-center`}>
              Go to sign in
            </Link>
          )}
          <button
            type="button"
            onClick={() => setStatus("idle")}
            className="mt-2 w-full text-center text-xs text-zinc-400 underline"
          >
            Use a different email
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleResend}
          disabled={status === "sending"}
          className={`${btn.secondary} mt-3 w-full justify-center disabled:opacity-60`}
        >
          {status === "sending" ? "Sending…" : "Resend confirmation email"}
        </button>
      )}
      {status === "sent" && (
        <p role="status" className="mt-3 text-sm text-emerald-300">
          Check your email — we sent a new confirmation link
        </p>
      )}
      {status === "rate-limited" && (
        <p role="alert" className="mt-3 text-sm text-amber-200">
          Give it a minute, then try again
        </p>
      )}
      {status === "error" && errorMessage && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
