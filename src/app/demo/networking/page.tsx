import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoNav } from "../DemoNav";
import DemoNetworkingClient from "./DemoNetworkingClient";

export const metadata: Metadata = { title: "Networking — Live demo" };

// Public demo route for the Networking tracker. Renders the same
// NetworkingSection as the signed-in app, with fictional sample data only.
export default function DemoNetworkingPage() {
  return (
    <>
      <DemoNav />
      <Suspense fallback={null}>
        <DemoNetworkingClient />
      </Suspense>
    </>
  );
}
