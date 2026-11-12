import { describe, expect, it } from "vitest";
import {
  getAuthCallbackUrl,
  getEmailRedirectTo,
  getPasswordResetRedirectTo,
  isAlreadyConfirmedMessage,
  isAlreadyRegisteredMessage,
  isExistingUserSignUp,
  isRateLimitMessage,
  LIVE_APP_URL,
} from "../auth-redirect";

describe("getAuthCallbackUrl", () => {
  it("always points at the live app, never localhost", () => {
    expect(LIVE_APP_URL).toBe("https://pulse-find-two.vercel.app");
    expect(getAuthCallbackUrl()).toBe(
      "https://pulse-find-two.vercel.app/auth/callback?next=%2Fdashboard",
    );
    expect(getAuthCallbackUrl("/auth/reset-password")).toBe(
      "https://pulse-find-two.vercel.app/auth/callback?next=%2Fauth%2Freset-password",
    );
    expect(getAuthCallbackUrl()).not.toContain("localhost");
  });

  it("keeps the ?next= handling for sign-up and password reset", () => {
    expect(getEmailRedirectTo("/dashboard")).toBe(getAuthCallbackUrl("/dashboard"));
    expect(getPasswordResetRedirectTo()).toBe(getAuthCallbackUrl("/auth/reset-password"));
  });
});

describe("auth error classification", () => {
  it("detects an already-registered email", () => {
    expect(isAlreadyRegisteredMessage("User already registered")).toBe(true);
    expect(isAlreadyRegisteredMessage("Email already confirmed")).toBe(true);
    expect(isAlreadyRegisteredMessage("Invalid login credentials")).toBe(false);
  });

  it("detects an already-confirmed email for resend", () => {
    expect(isAlreadyConfirmedMessage("Email already confirmed")).toBe(true);
    expect(isAlreadyConfirmedMessage("Email rate limit exceeded")).toBe(false);
  });

  it("detects a rate limit", () => {
    expect(isRateLimitMessage("Email rate limit exceeded")).toBe(true);
    expect(isRateLimitMessage("Something went wrong", 429)).toBe(true);
    expect(isRateLimitMessage("Something went wrong")).toBe(false);
  });

  it("detects an existing user from a sign-up response with no identities", () => {
    expect(isExistingUserSignUp({ user: { identities: [] } })).toBe(true);
    expect(isExistingUserSignUp({ user: { identities: [{ id: "1" }] } })).toBe(false);
    expect(isExistingUserSignUp({ user: null })).toBe(false);
  });
});
