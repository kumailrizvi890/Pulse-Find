import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoNav } from "../DemoNav";
import DemoLeadsClient from "./DemoLeadsClient";

export const metadata: Metadata = { title: "Leads — Live demo" };

// Public demo route for the Leads pipeline. Renders the same LeadsSection
// as the signed-in app, with fictional sample data only.
export default async function DemoLeadsPage({ searchParams }: { searchParams: Promise<{ tour?: string | string[] }> }) {
  const sp = await searchParams;
  return (
    <>
      <DemoNav tour={typeof sp.tour === "string" ? sp.tour : undefined} />
      <Suspense fallback={null}>
        <DemoLeadsClient />
      </Suspense>
    </>
  );
}
