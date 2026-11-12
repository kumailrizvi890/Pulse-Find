import { createClient } from "@/lib/supabase/client";

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function hasSecureRandom(): boolean {
  return (
    typeof globalThis.crypto?.getRandomValues === "function" &&
    typeof globalThis.crypto?.subtle?.digest === "function"
  );
}

/** A new Pulse Find API token, `pf_` followed by 40 random characters. */
export function randomAgentToken(): string {
  if (!hasSecureRandom()) {
    throw new Error("Secure random is unavailable in this browser.");
  }
  const bytes = new Uint8Array(40);
  const chars: string[] = [];
  while (chars.length < 40) {
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < 248 && chars.length < 40) chars.push(ALPHABET[byte % ALPHABET.length]);
    }
  }
  return `pf_${chars.join("")}`;
}

export async function sha256Hex(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
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
  const displayName = name.trim().slice(0, 60) || "My agent";
  const token = randomAgentToken();
  const db = createClient();
  const { error } = await db.from("api_tokens").insert({
    name: displayName,
    prefix: token.slice(0, 7),
    token_hash: await sha256Hex(token),
  });
  if (error) throw new Error(error.message || "Could not create the token. Try again.");
  return { token, name: displayName };
}
