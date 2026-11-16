import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Every env var the code reads must be listed in .env.example with a
// placeholder, so a stranger cloning the repo knows what to set and no
// deploy quietly depends on an undocumented variable. SUPABASE_URL is
// the one exception: Supabase provides it inside edge functions, so it
// never belongs in .env.local.
const repoRoot = join(__dirname, "..", "..", "..");

function readText(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
      walk(path, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

function envExampleKeys(): Set<string> {
  const keys = new Set<string>();
  for (const line of readText(".env.example").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const name = trimmed.split("=")[0].trim();
    if (name) keys.add(name);
  }
  return keys;
}

describe(".env.example coverage", () => {
  it("lists every env var the Next.js code reads", () => {
    const keys = envExampleKeys();
    const read = new Set<string>();
    for (const file of walk(join(repoRoot, "src"))) {
      for (const m of readText(file.replace(repoRoot + "/", "")).matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) {
        read.add(m[1]);
      }
    }
    for (const name of read) {
      expect(keys.has(name), `${name} is read by the code but missing from .env.example`).toBe(true);
    }
    expect(read.size).toBeGreaterThan(0);
  });

  it("lists every env var the edge functions read, except the platform-provided one", () => {
    const keys = envExampleKeys();
    const read = new Set<string>();
    for (const file of walk(join(repoRoot, "supabase", "functions"))) {
      for (const m of readText(file.replace(repoRoot + "/", "")).matchAll(/Deno\.env\.get\("([A-Z_][A-Z0-9_]*)"\)/g)) {
        read.add(m[1]);
      }
    }
    // Supabase sets SUPABASE_URL inside edge functions; it is not a local var.
    read.delete("SUPABASE_URL");
    for (const name of read) {
      expect(keys.has(name), `${name} is read by an edge function but missing from .env.example`).toBe(true);
    }
    expect(read.size).toBeGreaterThan(0);
  });

  it("contains placeholders, not real values", () => {
    const text = readText(".env.example");
    expect(text).not.toMatch(/sbp_[A-Za-z0-9]/);
    expect(text).not.toMatch(/sb_publishable_[A-Za-z0-9]{4,}/);
    expect(text).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
    expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.eyJ/);
  });
});
