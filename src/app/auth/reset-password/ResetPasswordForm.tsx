"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isConfigured } from "@/lib/env";
import { btn, field } from "@/components/dashboard/ui";

export function ResetPasswordForm() {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setStatus(data.session ? "ready" : "invalid");
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setStatus("ready");
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    if (password !== confirm) {
      setError("The passwords do not match.");
      return;
    }
    if (!isConfigured()) {
      setError("Password reset is not set up on this copy of Pulse Find yet.");
      return;
    }
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
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
    setDone(true);
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-panel">
        <h1 className="font-display text-xl font-bold tracking-tight">Password updated</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Your password has been changed. Sign in with your new password.
        </p>
        <button
          type="button"
          onClick={() => router.push("/login")}
          className={`${btn.primary} mt-4 w-full py-2.5`}
        >
          Sign in
        </button>
      </div>
    );
  }

  if (status === "checking") {
    return (
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-panel">
        <p className="text-sm text-muted">Checking your reset link…</p>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-panel">
        <h1 className="font-display text-xl font-bold tracking-tight">This link has expired</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Reset links work once and expire quickly. Request a fresh link and open it from your
          email.
        </p>
        <Link href="/forgot-password" className={`${btn.primary} mt-4 w-full py-2.5`}>
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-line bg-surface p-5 shadow-panel"
    >
      <h1 className="font-display text-xl font-bold tracking-tight">Choose a new password</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        At least 8 characters. You will use this to sign in from now on.
      </p>
      <label
        htmlFor="rp-pass"
        className="mt-4 flex flex-col gap-1.5 text-xs font-medium text-muted"
      >
        New password
        <input
          id="rp-pass"
          type="password"
          className={field}
          value={password}
          onChange={(ev) => setPassword(ev.target.value)}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          required
        />
      </label>
      <label
        htmlFor="rp-confirm"
        className="mt-4 flex flex-col gap-1.5 text-xs font-medium text-muted"
      >
        Confirm new password
        <input
          id="rp-confirm"
          type="password"
          className={field}
          value={confirm}
          onChange={(ev) => setConfirm(ev.target.value)}
          placeholder="Repeat your new password"
          autoComplete="new-password"
          required
        />
      </label>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" className={`${btn.primary} mt-5 w-full py-2.5`} disabled={busy}>
        {busy ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
