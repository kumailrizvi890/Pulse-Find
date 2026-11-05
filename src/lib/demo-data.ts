import { addDays, todayISO } from "./metrics";
import type { Application, ISODate, TrackerEvent } from "./types";

/**
 * Invented companies and roles for the public demo. Dates are relative to today so the
 * demo always looks current. Nothing here is anyone's real application.
 */
type Seed = Omit<Application, "id" | "date_applied" | "last_contact" | "action_due"> & {
  applied: number; // days ago
  contact: number; // days ago
  due?: number; // days from today (negative = overdue)
};

const SEEDS: Seed[] = [
  { company: "Northwind Labs", role: "Software Engineer Intern, Summer 2027", track: "Internship", status: "OA Received", applied: 9, contact: 2, due: 3, oa_received: true, interviews_done: 0, latest_update: "HackerRank assessment sent (2 problems, 90 min)", link: "", notes: "Expires in 5 days from invite", action_needed: "Finish the HackerRank assessment" },
  { company: "Copperline", role: "Associate AI Engineer (New Grad)", track: "New Grad", status: "Interview Invited", applied: 16, contact: 1, due: 2, oa_received: true, interviews_done: 0, latest_update: "Recruiter asked for availability next week", link: "", notes: "", action_needed: "Reply with 3 interview time slots" },
  { company: "Brightwater Health", role: "Data Analyst Intern", track: "Internship", status: "Incomplete", applied: 4, contact: 4, oa_received: false, interviews_done: 0, latest_update: "Portal says profile is 70% complete", link: "", notes: "", action_needed: "Upload transcript and finish the portal application" },
  { company: "Atlas Robotics", role: "Embedded Software Intern", track: "Internship", status: "Interviewing", applied: 27, contact: 5, oa_received: true, interviews_done: 2, latest_update: "Technical round done, waiting on team match", link: "", notes: "Interviewer: robotics perception team", action_needed: "" },
  { company: "Fernhill Capital", role: "Software Engineer, Early Career", track: "New Grad", status: "Final Round", applied: 33, contact: 3, due: 6, oa_received: true, interviews_done: 3, latest_update: "Final round scheduled", link: "", notes: "", action_needed: "Prep system design: rate limiter + URL shortener" },
  { company: "Lumen Mobile", role: "iOS Engineer Intern", track: "Internship", status: "Applied", applied: 2, contact: 2, oa_received: false, interviews_done: 0, latest_update: "Application received", link: "", notes: "", action_needed: "" },
  { company: "Quarry Analytics", role: "Backend Engineer Intern", track: "Internship", status: "Applied", applied: 3, contact: 3, oa_received: false, interviews_done: 0, latest_update: "Application received", link: "", notes: "", action_needed: "" },
  { company: "Tidewater Cloud", role: "Cloud Support Associate", track: "New Grad", status: "Recruiter Screen", applied: 12, contact: 6, oa_received: false, interviews_done: 1, latest_update: "Phone screen went well", link: "", notes: "", action_needed: "" },
  { company: "Pinecrest Games", role: "Gameplay Programmer Intern", track: "Internship", status: "Applied", applied: 24, contact: 24, oa_received: false, interviews_done: 0, latest_update: "Application received; no response since", link: "", notes: "", action_needed: "" },
  { company: "Harbor & Pike", role: "Product Manager Intern", track: "Internship", status: "Applied", applied: 30, contact: 30, oa_received: false, interviews_done: 0, latest_update: "Application received", link: "", notes: "", action_needed: "" },
  { company: "Saltmarsh Security", role: "Security Engineer Intern", track: "Internship", status: "Rejected", applied: 41, contact: 19, oa_received: true, interviews_done: 0, latest_update: "Not moving forward after OA", link: "", notes: "", action_needed: "" },
  { company: "Kestrel Fintech", role: "Full Stack Developer (New Grad)", track: "New Grad", status: "Rejected", applied: 38, contact: 22, oa_received: false, interviews_done: 1, latest_update: "Rejected after recruiter screen", link: "", notes: "", action_needed: "" },
  { company: "Oakline Coffee", role: "Barista (Part-Time)", track: "Part-Time", status: "Offer", applied: 20, contact: 1, due: 4, oa_received: false, interviews_done: 1, latest_update: "Offer: 18 hrs/week, $21/hr", link: "", notes: "", action_needed: "Accept or decline the offer" },
  { company: "Verdant Energy", role: "Machine Learning Intern", track: "Internship", status: "OA Completed", applied: 14, contact: 8, oa_received: true, interviews_done: 0, latest_update: "Assessment submitted", link: "", notes: "", action_needed: "" },
  { company: "Glassbridge", role: "Frontend Engineer Intern", track: "Internship", status: "Applied", applied: 11, contact: 11, oa_received: false, interviews_done: 0, latest_update: "Application received", link: "", notes: "", action_needed: "" },
  { company: "Meridian Retail", role: "Sales Associate", track: "Part-Time", status: "Applied", applied: 26, contact: 26, oa_received: false, interviews_done: 0, latest_update: "Applied in store", link: "", notes: "", action_needed: "" },
  { company: "Cobalt Systems", role: "SDE Intern, 2027", track: "Internship", status: "Applied", applied: 6, contact: 6, oa_received: false, interviews_done: 0, latest_update: "Application received", link: "", notes: "", action_needed: "" },
  { company: "Ridgeview Bank", role: "Technology Analyst Intern", track: "Internship", status: "Withdrawn", applied: 45, contact: 35, oa_received: false, interviews_done: 0, latest_update: "Withdrew: role moved to on-site only", link: "", notes: "", action_needed: "" },
  { company: "Sable Studio", role: "Software Developer, New Grad", track: "New Grad", status: "Applied", applied: 52, contact: 40, oa_received: false, interviews_done: 0, latest_update: "Application received", link: "", notes: "", action_needed: "" },
  { company: "Ember Logistics", role: "Operations Intern", track: "Internship", status: "Applied", applied: 61, contact: 61, oa_received: false, interviews_done: 0, latest_update: "Application received", link: "", notes: "", action_needed: "" },
  { company: "Westfield Labs", role: "Software Engineer Intern", track: "Internship", status: "Applied", applied: 0, contact: 0, oa_received: false, interviews_done: 0, latest_update: "Application received", link: "", notes: "", action_needed: "" },
  { company: "Orchard AI", role: "AI Research Engineer Intern", track: "Internship", status: "Applied", applied: 1, contact: 1, oa_received: false, interviews_done: 0, latest_update: "Application received", link: "", notes: "", action_needed: "" },
];

export function demoApplications(today: ISODate = todayISO()): Application[] {
  return SEEDS.map((s, i) => {
    const { applied, contact, due, ...rest } = s;
    return {
      ...rest,
      id: `demo-${i + 1}`,
      date_applied: addDays(today, -applied),
      last_contact: addDays(today, -contact),
      action_due: due === undefined ? null : addDays(today, due),
    };
  });
}

export function demoEvents(apps: Application[]): TrackerEvent[] {
  const ev: TrackerEvent[] = [];
  apps.forEach((a, i) => {
    if (a.date_applied) ev.push({ id: `de-${i}-a`, application_id: a.id, event_date: a.date_applied, kind: "Applied", details: "Application submitted" });
    if (a.last_contact && a.last_contact !== a.date_applied)
      ev.push({ id: `de-${i}-u`, application_id: a.id, event_date: a.last_contact, kind: a.status, details: a.latest_update });
  });
  return ev.sort((x, y) => y.event_date.localeCompare(x.event_date));
}
