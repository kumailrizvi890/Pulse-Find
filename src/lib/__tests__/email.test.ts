import { describe, expect, it } from "vitest";
import {
  checkScam, classifyEmail, extractCompany, extractDeadline, matchApplication, planUpdate, type TrackedApp,
} from "../../../supabase/functions/_shared/email";

const D = "2026-11-05";
const mail = (from: string, subject: string, body = "", date = D) => ({ from, subject, body, date });

describe("classifyEmail", () => {
  it.each([
    [mail("Stripe Recruiting <no-reply@stripe.com>", "Thank you for applying to Stripe", "We've received your application for Software Engineer Intern."), "confirmation"],
    [mail("Roblox University <noreply@hackerrank.com>", "Roblox: your HackerRank assessment", "Please complete the online assessment. The link expires in 7 days."), "assessment"],
    [mail("Copperline Talent <talent@copperline.io>", "Interview invitation", "We'd love to schedule an interview. Please share your availability."), "interview"],
    [mail("Amazon <noreply@amazon.jobs>", "Your application is incomplete", "Finish your application for SDE Intern."), "nudge"],
    [mail("Dexcom <careers@dexcom.com>", "Update on your application", "Unfortunately, we have decided to move forward with other candidates."), "rejection"],
    [mail("Fernhill Capital <people@fernhill.com>", "Offer letter", "We're pleased to extend an offer for the role. Please respond by November 14."), "offer"],
    [mail("LinkedIn Job Alerts <jobalerts-noreply@linkedin.com>", "30 new jobs for you", "Software engineer intern at ..."), "ignore"],
    [mail("Handshake <noreply@joinhandshake.com>", "Recommended jobs for you", ""), "ignore"],
    [mail("Mom <mom@gmail.com>", "Dinner Sunday?", "Bring dessert"), "ignore"],
  ])("%#: %o → %s", (input, kind) => {
    expect(classifyEmail(input).kind).toBe(kind);
  });

  it("rejections beat confirmations when both phrases appear", () => {
    const c = classifyEmail(mail("Gemini <no-reply@gemini.com>", "Thank you for your application", "Thank you for applying. Unfortunately we will not be moving forward."));
    expect(c.kind).toBe("rejection");
  });
});

describe("extractCompany", () => {
  it.each([
    ["Stripe Recruiting <no-reply@stripe.com>", "Thank you for applying", "Stripe"],
    ["no-reply@myworkdayjobs.com", "Thank you for applying to Micron Technology", "Micron Technology"],
    ["Jane <jane.doe@gmail.com>", "Interview with Northwind Labs", "Northwind Labs"],
    ["careers@copperline.io", "Your application", "Copperline"],
    ["notifications@greenhouse.io", "Hello", null],
    ["Roblox <noreply@hackerrank.com>", "Your assessment invitation", "Roblox"],
    ["Workday <no-reply@myworkday.com>", "Micron: action required on your application", "Micron"],
    ["HackerRank <support@hackerrank.com>", "Reminder: test expires soon", null],
  ])("%s / %s → %s", (from, subject, expected) => {
    expect(extractCompany(from, subject)).toBe(expected);
  });
});

describe("extractDeadline", () => {
  it.each([
    ["The link expires in 7 days.", "2026-11-12"],
    ["Please complete it by November 14.", "2026-11-14"],
    ["Deadline: Friday, Nov 7, 2026", "2026-11-07"],
    ["Respond before 11/20/2026", "2026-11-20"],
    ["expires in 72 hours", "2026-11-08"],
    ["Complete by January 3", "2027-01-03"], // year rolls over
    ["No dates here", null],
  ])("%s → %s", (text, expected) => expect(extractDeadline(text, D)).toBe(expected));
});

describe("checkScam", () => {
  it("flags a classic fake-check job offer", () => {
    const r = checkScam({
      from: "HR Department <hiring.manager.corp@gmail.com>",
      subject: "You have been selected for the remote data entry position",
      body: "Our HR team at Global Corp Inc will interview you via Telegram. We will mail you a check to purchase equipment from our vendor.",
    });
    expect(r.risk).toBe("high");
    expect(r.reasons.length).toBeGreaterThanOrEqual(3);
  });
  it("leaves a normal recruiter email alone", () => {
    const r = checkScam(mail("Stripe Recruiting <no-reply@stripe.com>", "Interview invitation", "Please pick a time on our scheduling page."));
    expect(r.risk).toBe("low");
  });
});

describe("planUpdate", () => {
  const apps: TrackedApp[] = [
    { id: "a1", company: "Stripe", role: "Software Engineer Intern", status: "Applied", action_needed: "" },
    { id: "a2", company: "Roblox", role: "Software Engineer, Early Career", status: "Interviewing", action_needed: "" },
    { id: "a3", company: "Amazon (Leo)", role: "SDE Intern, Amazon Leo", status: "Applied", action_needed: "" },
    { id: "a4", company: "Amazon", role: "SDE Intern - Summer 2027", status: "OA Received", action_needed: "Finish OA" },
  ];
  const run = (m: ReturnType<typeof mail>) => planUpdate(apps, m, classifyEmail(m));

  it("advances an existing application and sets the action and deadline", () => {
    const p = run(mail("Stripe Recruiting <no-reply@stripe.com>", "Stripe: complete your CodeSignal assessment", "Please complete the coding assessment by November 12."));
    expect(p).toMatchObject({ action: "update", applicationId: "a1" });
    expect(p.fields).toMatchObject({ status: "OA Received", oa_received: true, action_due: "2026-11-12", last_contact: D });
  });

  it("never moves an application backward", () => {
    const p = run(mail("Roblox <careers@roblox.com>", "Reminder: complete your assessment", "HackerRank link inside"));
    expect(p.applicationId).toBe("a2");
    expect(p.fields.status).toBeUndefined();
    expect(p.fields.action_needed).toMatch(/assessment/i);
  });

  it("rejections always land and clear the action", () => {
    const p = run(mail("Amazon <noreply@amazon.jobs>", "Your application for SDE Intern - Summer 2027", "Unfortunately we will not be moving forward."));
    expect(p.applicationId).toBe("a4");
    expect(p.fields).toMatchObject({ status: "Rejected", action_needed: "", action_due: null });
  });

  it("creates an application from a new confirmation", () => {
    const p = run(mail("Ramp Recruiting <no-reply@ramp.com>", "Thanks for applying to Ramp", "We received your application for Software Engineer Intern."));
    expect(p).toMatchObject({ action: "create", fields: { company: "Ramp", status: "Applied", date_applied: D } });
  });

  it("skips job alerts and emails it can't place", () => {
    expect(run(mail("LinkedIn <jobalerts-noreply@linkedin.com>", "New jobs for you")).action).toBe("skip");
    expect(run(mail("no-reply@greenhouse.io", "Interview invitation", "Please share your availability")).action).toBe("skip");
  });

  it("picks the right application when one company has several", () => {
    expect(matchApplication(apps, "Amazon", "SDE Intern - Summer 2027")?.id).toBe("a4");
    expect(matchApplication(apps, "Amazon", "Interview: SDE Intern, Amazon Leo")?.id).toBe("a3");
    expect(matchApplication(apps, "Amazon", null)?.id).toBe("a4"); // most advanced open one
  });
});
