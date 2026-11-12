/**
 * Auth-email redirects for Pulse Find.
 *
 * Supabase auth emails (sign-up confirmation, resend, password reset)
 * must always point back at the live app. The code used to build the
 * redirect from `window.location.origin`, so a confirmation email sent
 * while developing locally redirected to http://localhost:3000 instead
 * of the live app. Every auth-email call now uses the explicit live URL
 * below instead of the current origin or the Supabase project default.
 */
export const LIVE_APP_URL = "https://pulse-find-two.vercel.app";

/** Absolute URL of the auth callback, preserving the post-login `next` page. */
export function getAuthCallbackUrl(next = "/dashboard"): string {
  return `${LIVE_APP_URL}/auth/callback?next=${encodeURIComponent(next)}`;
}

/** `emailRedirectTo` value for sign-up confirmation and resend emails. */
export function getEmailRedirectTo(next = "/dashboard"): string {
  return getAuthCallbackUrl(next);
}

/** `emailRedirectTo` value for forgot-password (reset) emails. */
export function getPasswordResetRedirectTo(): string {
  return getAuthCallbackUrl("/auth/reset-password");
}

/** True when a Supabase error means the email already has an account. */
export function isAlreadyRegisteredMessage(message?: string | null): boolean {
  if (!message) return false;
  return /already (registered|exists|confirmed)|user already/i.test(message);
}

/** True when a Supabase error means the email is already confirmed. */
export function isAlreadyConfirmedMessage(message?: string | null): boolean {
  if (!message) return false;
  return /already confirmed/i.test(message);
}

/** True when a Supabase error is a rate limit (too many emails, too fast). */
export function isRateLimitMessage(message?: string | null, status?: number | null): boolean {
  if (status === 429) return true;
  if (!message) return false;
  return /rate limit|too many requests/i.test(message);
}

/**
 * True when a sign-up response is for an email that already has an
 * account: Supabase returns a user with no identities and sends no
 * confirmation email in that case, so callers must not show a
 * "check your email" message for it.
 */
export function isExistingUserSignUp(data: {
  user?: { identities?: unknown[] | null } | null;
}): boolean {
  const identities = data?.user?.identities;
  return Array.isArray(identities) && identities.length === 0;
}
