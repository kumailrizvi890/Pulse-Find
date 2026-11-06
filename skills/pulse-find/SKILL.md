---
name: pulse-find
description: Keep the user's Pulse Find job tracker current from their email, and answer questions about their job search. Use when the user asks to scan or sync job emails, update their job/internship tracker, asks what's waiting on them, which companies ghosted them, whether a recruiter email is a scam, or wants to find open internships or new-grad roles.
---

# Pulse Find

Pulse Find is the user's job application tracker. You reach it through the `pulse-find` MCP server
(tools listed below). If those tools aren't available, tell the user to connect it first:
https://pulsefind-app.vercel.app/app/connect

## Hard rules

- The user's inbox is **read-only** to you. Never send, reply to, forward, archive, label or delete email.
- Never apply to a job, fill in an application, or contact a recruiter on the user's behalf.
- If `process_job_email` returns `flagged_scam`, warn the user plainly and do not engage with the sender.

## Sync job email (the main workflow)

1. Call `get_summary` to see what's already tracked.
2. With your own email tools, search the requested window (default: last 7 days) for:
   - confirmations: "thank you for applying", "application received"
   - assessments: HackerRank, CodeSignal, Codility, HireVue, "online assessment"
   - interviews: "schedule", "availability", "phone screen", calendly / goodtime links
   - nudges: "still interested", "complete your application"
   - rejections and offers
   - plus a search for each company already in the tracker
   Skip job alerts and newsletters (LinkedIn job alerts, Handshake, Indeed, ZipRecruiter, Glassdoor digests).
3. Oldest first, call `process_job_email` once per email with `from`, `subject`, the plain-text `body`,
   the received `date` and the email's `message_id`. Duplicates are ignored, so re-running is safe.
   Use `dry_run: true` if the user wants a preview first.
4. If a result is `skipped` because the company couldn't be identified but the email clearly is about an
   application, call `add_application` or `update_application` yourself.
5. Reply in 3-6 lines: new applications, status changes, what's now waiting on the user with due dates,
   and any scam warnings. No preamble.

The MCP server also ships this as a prompt: `scan_inbox` (argument `days`).

## Other requests

| User asks | Do |
| --- | --- |
| "What's waiting on me?" | `get_summary`, then list `waiting_on_you` soonest first |
| "Who ghosted me?" | `list_applications` with `filter: "ghosted"` |
| "I applied to X" | `add_application` |
| "I finished the Roblox OA" | `list_applications` (company) → `update_application` with `status: "OA Completed"`, `action_needed: ""` |
| "Is this a scam?" | `check_job_scam` with the text; explain the reasons |
| "Find me internships" | `search_jobs` (`track`, `remote`, `query`); link each result |

## Tools

`get_summary` · `list_applications` · `add_application` · `update_application` ·
`process_job_email` · `check_job_scam` · `search_jobs`
