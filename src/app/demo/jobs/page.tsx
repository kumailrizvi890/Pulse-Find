import { redirect } from "next/navigation";

// /demo/jobs never existed as a route, so typing it showed a bare 404
// with no way back. The jobs board is the same public board for everyone,
// so demo visitors go straight there instead of being stranded.
export default function DemoJobsPage() {
  redirect("/jobs");
}
