import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoNav } from "../DemoNav";
import DemoSheetClient from "./DemoSheetClient";

export const metadata: Metadata = { title: "Sheet — Live demo" };

// Public demo route for the Sheet view. Renders the same SheetView as the
// signed-in app, with fictional sample data only.
export default function DemoSheetPage() {
  return (
    <>
      <DemoNav />
      <Suspense fallback={null}>
        <DemoSheetClient />
      </Suspense>
    </>
  );
}
