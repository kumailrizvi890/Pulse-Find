# Run your own Pulse Find

Everything runs on free tiers: a Supabase project (database, auth, two edge functions) and a Vercel project (the web app). No paid AI API is involved. The "smart" part is whatever agent you already use, talking to your Pulse Find over MCP.

About 15 minutes.

## 1. Supabase

1. Create a project at [supabase.com](https://supabase.com/dashboard). Note the project ref (the `xxxx` in `https://xxxx.supabase.co`).
2. Install the CLI and link it:

   ```bash
   npm i -g supabase        # or: brew install supabase/tap/supabase
   supabase login
   supabase link --project-ref <project-ref>
   ```

3. Store the two values the job-refresh schedule needs. In **SQL editor**:

   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
   select vault.create_secret('<publishable key from Project Settings → API>', 'anon_key');
   ```

4. Create the tables, security policies and the 6-hourly schedule, then deploy the functions:

   ```bash
   supabase db push
   supabase functions deploy refresh-jobs
   supabase functions deploy mcp --no-verify-jwt   # the MCP server checks its own pf_ tokens
   ```

5. Fill the job board once now instead of waiting for the schedule:

   ```bash
   curl -X POST "https://<project-ref>.supabase.co/functions/v1/refresh-jobs" \
     -H "Authorization: Bearer <publishable key>"
   ```

6. **Authentication → Sign In / Providers → Email:** turn off *Confirm email* unless you've set up your own SMTP (Supabase's built-in mailer only delivers to your team members).
   **Authentication → URL Configuration:** set *Site URL* to your Vercel URL and add `https://<your-domain>/**` to redirect URLs.

7. Optional: run the security advisor (**Advisors → Security**). It should report no issues.

## 2. Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fkumailrizvi890%2FPulse-Find&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,NEXT_PUBLIC_SITE_URL&envDescription=Supabase%20project%20URL%20and%20publishable%20key%20(Project%20Settings%20%E2%86%92%20API)%2C%20and%20this%20site%27s%20public%20URL&envLink=https%3A%2F%2Fgithub.com%2Fkumailrizvi890%2FPulse-Find%2Fblob%2Fmain%2Fdocs%2FSELF_HOST.md&project-name=pulse-find&repository-name=pulse-find)

The button forks the repo and asks for:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` |
| `NEXT_PUBLIC_SITE_URL` | your Vercel URL, e.g. `https://pulse-find-you.vercel.app` |

Your agent endpoint is then `https://<your-domain>/api/mcp` (the app forwards it to the `mcp` edge function).

## 3. Connect an agent

Sign up on your deployment, open **Connect agent** (`/app/connect`), create a token and copy the config for your client. Claude Code, for example:

```bash
claude mcp add --transport http pulse-find https://<your-domain>/api/mcp \
  --header "Authorization: Bearer pf_..."
```

Then give the agent the playbook in [`skills/pulse-find/SKILL.md`](../skills/pulse-find/SKILL.md) (as a skill, a project rule, or pasted into a prompt) and ask: *"Scan my email from the last week and update Pulse Find."*

### Run it on a schedule

Any agent that can run on a timer works. With Claude, create a scheduled task with a prompt like:

> Use the pulse-find skill: scan my job email from the last 2 days and update Pulse Find. Read-only in my inbox; never send email or apply to anything. Finish with a 3-line summary.

## Adding job boards

Boards live in the `job_boards` table. Add a row with `source` (`greenhouse`, `lever` or `ashby`), the board `slug` from the company's careers URL, and the company name. The next refresh picks it up; boards that fail show their error in `job_boards.last_error`.

```sql
insert into job_boards (company, source, slug) values ('Figma', 'greenhouse', 'figma');
```

## Troubleshooting

- **401 from `/api/mcp`:** the header must be exactly `Authorization: Bearer pf_` + 40 characters, and the token must not be revoked.
- **Agent says the server has no tools:** your client must support the Streamable HTTP transport. For stdio-only clients, use `npx mcp-remote <url> --header "Authorization:${PF_AUTH}"` (see the Claude Desktop tab on `/app/connect`).
- **Job board is empty:** check `select * from job_refresh_runs order by started_at desc limit 5;`, `job_boards.last_error` and the `refresh-jobs` function logs.
