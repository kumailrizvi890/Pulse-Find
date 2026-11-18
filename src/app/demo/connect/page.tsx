import type { Metadata } from "next";
import { DemoNav } from "../DemoNav";
import { DemoConnectAgent } from "./DemoConnectAgent";

export const metadata: Metadata = { title: "Connect your agent — Live demo" };

// Public demo route for the Connect-agent flow. Mirrors the signed-in
// Connect page's four steps, but demo-safe: the token is a placeholder,
// no token is created, and nothing reads or writes the api_tokens table.
// Visitors who want a real token sign up from here.
export default async function DemoConnectPage({ searchParams }: { searchParams: Promise<{ tour?: string | string[] }> }) {
  const sp = await searchParams;
  return (
    <>
      <DemoNav tour={typeof sp.tour === "string" ? sp.tour : undefined} />
      <DemoConnectAgent />
    </>
  );
}
