// Sync trigger. Called every 2 hours by pg_cron to start the tracker's
// in-app sync. It forwards the call to the app's /api/cron/sync-sheet
// route on Vercel and retries it: pg_net's HTTP client drops every other
// call to Vercel with an HTTP/2 framing error, so the trigger goes
// through this function instead of straight from pg_cron.
//
// Set the route's secret as an Edge Function secret named CRON_SECRET.
// verify_jwt stays on: pg_cron calls this with the project's anon key.
const SYNC_URL = "https://pulse-find-two.vercel.app/api/cron/sync-sheet";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const secret = Deno.env.get("CRON_SECRET");
  if (!secret) return json({ error: "CRON_SECRET is not set" }, 500);

  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(SYNC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": secret },
        body: JSON.stringify({ source: "cron" }),
        signal: AbortSignal.timeout(55_000),
      });
      const sync = await res.json().catch(() => ({}));
      return json({ ok: res.ok, attempts: attempt, sync }, res.ok ? 200 : 502);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  return json({ ok: false, error: lastError }, 502);
});
