import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoNav } from "../DemoNav";
import DemoNetworkingClient from "./DemoNetworkingClient";

export const metadata: Metadata = { title: "Networking — Live demo" };

// Public demo route for the Networking tracker. Renders the same
// NetworkingSection as the signed-in app, with fictional sample data only.
export default async function DemoNetworkingPage({ searchParams }: { searchParams: Promise<{ tour?: string | string[] }> }) {
  const sp = await searchParams;
  return (
    <>
      <DemoNav tour={typeof sp.tour === "string" ? sp.tour : undefined} />
      <Suspense fallback={null}>
        <DemoNetworkingClient />
      </Suspense>
    </>
  );
}
