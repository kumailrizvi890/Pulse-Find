// Supabase Edge Function: refresh the public job feed from company job boards.
// Triggered every 6 hours by pg_cron and by the "Refresh" button. Rate-limited to one run per 20 minutes.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { boardUrl, normalizeBoard, type NormalizedJob, type Source } from "../_shared/jobs.ts";

const MIN_GAP_MS = 20 * 60 * 1000;
const CONCURRENCY = 8;
const TIMEOUT_MS = 15_000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: last } = await db.from("job_refresh_runs").select("started_at").order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (last && Date.now() - new Date(last.started_at).getTime() < MIN_GAP_MS) {
    return json({ skipped: true, reason: "Refreshed recently", last_run: last.started_at });
  }
  const { data: run } = await db.from("job_refresh_runs").insert({}).select("id").single();

  const { data: boards, error } = await db.from("job_boards").select("source,slug,company").eq("active", true);
  if (error || !boards) return json({ error: "Couldn't read job boards" }, 500);

  const seenAt = new Date().toISOString();
  let ok = 0, failed = 0, total = 0;
  const okBoards: { source: Source; slug: string }[] = [];

  const queue = [...boards] as { source: Source; slug: string; company: string }[];
  async function worker() {
    for (let b = queue.shift(); b; b = queue.shift()) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        const res = await fetch(boardUrl(b), { signal: ctrl.signal, headers: { "User-Agent": "PulseFind/1.0 (+https://pulsefind-app.vercel.app)" } });
        clearTimeout(t);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const jobs: NormalizedJob[] = normalizeBoard(b, await res.json());
        for (let i = 0; i < jobs.length; i += 500) {
          const rows = jobs.slice(i, i + 500).map((j) => ({ ...j, last_seen: seenAt, active: true }));
          const { error: upErr } = await db.from("jobs").upsert(rows, { onConflict: "id", ignoreDuplicates: false });
          if (upErr) throw new Error(upErr.message);
        }
        total += jobs.length;
        ok++;
        okBoards.push(b);
        await db.from("job_boards").update({ last_ok_at: seenAt, last_error: null, job_count: jobs.length }).eq("source", b.source).eq("slug", b.slug);
      } catch (e) {
        failed++;
        await db.from("job_boards").update({ last_error: String(e instanceof Error ? e.message : e).slice(0, 300) }).eq("source", b.source).eq("slug", b.slug);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Postings that vanished from a board we read successfully have closed.
  for (const b of okBoards) {
    await db.from("jobs").update({ active: false }).eq("source", b.source).eq("board", b.slug).lt("last_seen", seenAt).eq("active", true);
  }
  // Keep the table small: forget closed postings after 45 days.
  await db.from("jobs").delete().eq("active", false).lt("last_seen", new Date(Date.now() - 45 * 86_400_000).toISOString());

  if (run) await db.from("job_refresh_runs").update({ finished_at: new Date().toISOString(), boards_ok: ok, boards_err: failed, jobs_seen: total }).eq("id", run.id);
  return json({ boards_ok: ok, boards_failed: failed, jobs_seen: total });
});
