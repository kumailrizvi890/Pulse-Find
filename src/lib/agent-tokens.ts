import { createClient } from "@supabase/supabase-js";

const TOKEN_ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** A new Pulse Find API token, `pf_` followed by 40 random characters. */
export function randomAgentToken(): string {
  const bytes = new Uint8Array(40);
  crypto.getRandomValues(bytes);
  let token = "pf_";
  for (const byte of bytes) token += TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length];
  return token;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface CreatedAgentToken {
  token: string;
  name: string;
}

/**
 * Create an API token for the signed-in user's agent and store only its
 * SHA-256 hash, exactly as the Connect your agent page does. The returned
 * token is shown to the user once and is never stored in full.
 */
export async function createAgentToken(name: string): Promise<CreatedAgentToken> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const db = createClient(supabaseUrl, supabaseAnonKey);
  const displayName = name.trim().slice(0, 60) || "My agent";
  const token = randomAgentToken();
  const { error } = await db.from("api_tokens").insert({
    name: displayName,
    prefix: token.slice(0, 7),
    token_hash: await sha256Hex(token),
  });
  if (error) throw new Error(error.message || "Could not create the token. Try again.");
  return { token, name: displayName };
}
