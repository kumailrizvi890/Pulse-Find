import type { Metadata } from "next";
import { DemoNav } from "./DemoNav";
import { DemoDashboard } from "./DemoDashboard";

export const metadata: Metadata = { title: "Live demo" };

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ chat?: string | string[]; tour?: string | string[] }> }) {
  const sp = await searchParams;
  return (
    <>
      <DemoNav />
      <DemoDashboard openChat={sp.chat === "1"} tour={typeof sp.tour === "string" ? sp.tour : undefined} />
    </>
  );
}
