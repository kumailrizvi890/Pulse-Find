// Supabase Edge Function: Pulse Find MCP server (Streamable HTTP, JSON responses).
// Auth: "Authorization: Bearer pf_..." personal access token created in the app.
// The service role is used, so EVERY query below is explicitly scoped to the token's user.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { handleBody, type AppRow, type JobRow, type Store } from "../_shared/mcp.ts";

const MAX_BODY = 256 * 1024;
const APP_COLS =
  "id,company,role,track,status,date_applied,last_contact,latest_update,action_needed,action_due,interviews_done,oa_received,link,notes";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-session-id, mcp-protocol-version, accept",
  "Access-Control-Expose-Headers": "mcp-session-id, www-authenticate",
};
const reply = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { ...cors, ...(body === null ? {} : { "Content-Type": "application/json" }), ...extra },
  });

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function userStore(db: SupabaseClient, uid: string): Store {
  const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message); };
  return {
    async listApps() {
      const { data, error } = await db.from("applications").select(APP_COLS).eq("user_id", uid).order("last_contact", { ascending: false });
      fail(error);
      return (data ?? []) as AppRow[];
    },
    async insertApp(fields) {
      const { data, error } = await db.from("applications").insert({ ...fields, user_id: uid }).select(APP_COLS).single();
      fail(error);
      return data as AppRow;
    },
    async updateApp(id, fields) {
      const { data, error } = await db.from("applications").update(fields).eq("id", id).eq("user_id", uid).select(APP_COLS).maybeSingle();
      if (error && /invalid input syntax for type uuid/i.test(error.message)) return null;
      fail(error);
      return (data as AppRow | null) ?? null;
    },
    async addEvent(e) {
      const { error } = await db.from("events").insert({ ...e, user_id: uid });
      if (error?.code === "23505") return false; // duplicate source_ref
      fail(error);
      return true;
    },
    async hasEvent(ref) {
      const { count, error } = await db.from("events").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("source_ref", ref);
      fail(error);
      return (count ?? 0) > 0;
    },
    async searchJobs(p) {
      let q = db.from("jobs").select("company,title,location,remote,url,track,posted_at").eq("active", true);
      if (p.track) q = q.eq("track", p.track);
      if (p.remote) q = q.eq("remote", true);
      if (p.tech_only) q = q.eq("tech", true);
      if (p.query) {
        const safe = p.query.replace(/[%_,()*]/g, " ").trim();
        if (safe) q = q.or(`title.ilike.%${safe}%,company.ilike.%${safe}%,location.ilike.%${safe}%`);
      }
      const { data, error } = await q.order("posted_at", { ascending: false, nullsFirst: false }).limit(p.limit);
      fail(error);
      return (data ?? []) as JobRow[];
    },
    async ghostDays() {
      const { data } = await db.from("profiles").select("ghost_days").eq("user_id", uid).maybeSingle();
      return (data as { ghost_days: number } | null)?.ghost_days ?? 21;
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // No server-initiated stream and no sessions: GET and DELETE aren't supported.
  if (req.method !== "POST") return reply({ error: "This MCP endpoint accepts POST only." }, 405, { Allow: "POST, OPTIONS" });

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.match(/^Bearer\s+(pf_[A-Za-z0-9]{40})$/)?.[1];
  const unauthorized = (msg: string) =>
    reply({ jsonrpc: "2.0", id: null, error: { code: -32001, message: msg } }, 401, { "WWW-Authenticate": 'Bearer realm="pulse-find"' });
  if (!token) return unauthorized("Add your Pulse Find access token: Authorization: Bearer pf_...  Create one at https://pulse-find-two.vercel.app/app/connect");

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: row } = await db.from("api_tokens").select("id,user_id,revoked_at,last_used_at").eq("token_hash", await sha256Hex(token)).maybeSingle();
  if (!row || row.revoked_at) return unauthorized("That access token is invalid or was revoked. Create a new one in Pulse Find.");
  // record use at most once a minute
  if (!row.last_used_at || Date.now() - new Date(row.last_used_at).getTime() > 60_000) {
    await db.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
  }

  const text = await req.text();
  if (text.length > MAX_BODY) return reply({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } }, 413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return reply({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }

  const out = await handleBody(body, userStore(db, row.user_id));
  return out === null ? reply(null, 202) : reply(out);
});
