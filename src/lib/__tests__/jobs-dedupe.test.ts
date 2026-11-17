import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isAlreadyTracked, leadKey } from "../pipeline";
import type { Application } from "../types";

// JobsBoard "I applied" dedupe gap (pass-28 live audit): setMark(job,
// "applied") inserted a tracker application with no check at all, and the
// board never loaded the tracker applications, so a job whose company +
// role was already tracked (synced in by the agent, added by hand, or
// applied to on another device) still offered "I applied" and a tap made
// a duplicate row. A double-tap did the same: the marks state only
// updates after the insert resolves, so both taps inserted.
//
// The match reuses the leads fix (pass 28): company + role
// (leadKey, case-insensitive), never company alone — a second role at the
// same company is a genuinely new application. A board job's title is its
// role, so the key is leadKey({ company, role: title }).
function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

function app(company: string, role: string): Pick<Application, "company" | "role"> {
  return { company, role };
}

describe("isAlreadyTracked for board jobs (title is the role)", () => {
  it("matches a job whose company + title is already tracked, ignoring case and padding", () => {
    const apps = [app("Zoox", "Data Scientist Intern [Summer 2027]")];
    expect(
      isAlreadyTracked(apps, { company: " zoox ", role: "data scientist intern [summer 2027]" }),
    ).toBe(true);
    expect(isAlreadyTracked(apps, { company: "Zoox", role: "Data Scientist Intern [Summer 2027]" })).toBe(true);
  });

  it("does not match a different role at the same company", () => {
    const apps = [app("Zoox", "Data Scientist Intern [Summer 2027]")];
    expect(isAlreadyTracked(apps, { company: "Zoox", role: "Software Engineer Intern" })).toBe(false);
  });

  it("does not match the same role at a different company", () => {
    const apps = [app("Zoox", "Data Scientist Intern [Summer 2027]")];
    expect(isAlreadyTracked(apps, { company: "Acme Corp", role: "Data Scientist Intern [Summer 2027]" })).toBe(false);
  });

  it("is false with no applications", () => {
    expect(isAlreadyTracked([], { company: "Zoox", role: "Data Scientist Intern [Summer 2027]" })).toBe(false);
  });

  it("keys a board job on company + title, the same key the leads fix uses", () => {
    expect(leadKey({ company: "Zoox", role: "Data Scientist Intern [Summer 2027]" })).toBe(
      "zoox::data scientist intern [summer 2027]",
    );
  });
});

describe("JobsBoard dedupe guard (source pins)", () => {
  const board = read("app/jobs/JobsBoard.tsx");

  it("loads the tracker applications so the board knows what is already tracked", () => {
    expect(board).toContain('const [trackedApps, setTrackedApps] = useState<Pick<Application, "company" | "role">[]>([]);');
    expect(board).toContain("accountStore(supabase, userId)");
    expect(board).toContain(".load()");
    expect(board).toContain("setTrackedApps(apps)");
  });

  it("derives a tracked-keys set from the loaded applications", () => {
    expect(board).toContain("const trackedKeys = useMemo(() => new Set(trackedApps.map((a) => leadKey(a))), [trackedApps]);");
  });

  it("shows In tracker instead of the Applied button on a saved job that is already tracked", () => {
    expect(board).toContain("trackedKeys.has(leadKey({ company: j.company, role: j.title })) ? (");
    expect(board).toContain('<Tag tone="muted">In tracker</Tag>');
  });

  it("shows In tracker instead of I applied in the list view for an already-tracked job", () => {
    expect(board).toContain('m === "applied" || trackedKeys.has(leadKey({ company: j.company, role: j.title })) ? (');
  });

  it("refuses the tap when the loaded set already holds the job, with the same words as the leads fix", () => {
    const setMark = board.slice(board.indexOf("async function setMark"), board.indexOf("async function mark("));
    expect(setMark).toContain('isAlreadyTracked(trackedApps, { company: job.company, role: job.title })');
    expect(setMark).toContain('toast(`${job.company} is already in your tracker.`, "error");');
  });

  it("guards the in-flight tap, so a double-tap cannot insert twice", () => {
    const setMark = board.slice(board.indexOf("async function setMark"), board.indexOf("async function mark("));
    expect(board).toContain("const applying = useRef(new Set<string>());");
    expect(setMark).toContain("if (applying.current.has(key)) return false;");
    expect(setMark).toContain("applying.current.add(key);");
    expect(setMark).toContain("applying.current.delete(key);");
  });

  it("re-checks the tracker fresh inside setMark before inserting, so a background sync cannot slip a duplicate in", () => {
    const setMark = board.slice(board.indexOf("async function setMark"), board.indexOf("async function mark("));
    expect(setMark).toContain("fresh = (await accountStore(supabase, userId).load()).apps;");
    expect(setMark).toContain("setTrackedApps(fresh);");
    expect(setMark).toContain("isAlreadyTracked(fresh, { company: job.company, role: job.title })");
  });

  it("still inserts a genuinely new job into the tracker, and remembers it afterwards", () => {
    const setMark = board.slice(board.indexOf("async function setMark"), board.indexOf("async function mark("));
    expect(setMark).toContain('await supabase.from("applications").insert({');
    expect(setMark).toContain("user_id: userId, company: job.company, role: job.title,");
    expect(setMark).toContain("setTrackedApps((prev) => [...prev, { company: job.company, role: job.title }]);");
    expect(setMark).toContain("toast(`Added ${job.company} to your tracker`)");
  });

  it("keeps the saved/hidden marks on the old path, untouched by the applied branch", () => {
    const setMark = board.slice(board.indexOf("async function setMark"), board.indexOf("async function mark("));
    expect(setMark).toContain('await supabase.from("saved_jobs").upsert({ user_id: userId, job_id: job.id, state: next })');
    expect(setMark).toContain('await supabase.from("saved_jobs").delete().eq("user_id", userId).eq("job_id", job.id)');
  });

  it("uses no em dash in the new copy", () => {
    // The old label is not in this file; the new toast is a plain period.
    expect(board).toContain("is already in your tracker.");
    expect(board).not.toContain("is already in your tracker\u2014");
  });
});

describe("Dashboard indentation nit (source pins)", () => {
  const dashboard = read("components/dashboard/Dashboard.tsx");
  // Split on a real newline without writing a backslash-n escape in this
  // file, so the whole file pastes cleanly through the web editor.
  const lines = dashboard.split(String.fromCharCode(10));

  it("mounts the header-date block at the same indent as its siblings", () => {
    const mounted = lines.find((l) => l.includes("const [mounted, setMounted]"));
    expect(mounted).toBeDefined();
    expect(mounted!.startsWith("  const [mounted, setMounted]")).toBe(true);
    const effect = lines.find((l) => l.includes("useEffect(() => {") && lines.indexOf(l) > lines.indexOf(mounted!));
    expect(effect!.startsWith("  useEffect(() => {")).toBe(true);
    const timer = lines.find((l) => l.includes("const t = window.setTimeout"));
    expect(timer!.startsWith("    const t = window.setTimeout")).toBe(true);
  });

  it("aligns the blank-date fallback with its ternary question mark", () => {
    const fallback = lines.find((l) => l.includes(': "\\u00A0"}'));
    expect(fallback).toBeDefined();
    expect(fallback!.startsWith('              : "\\u00A0"}')).toBe(true);
  });

  it("puts the header action row at the same indent as its sibling div", () => {
    const row = lines.find((l) => l.includes('<div className="flex flex-wrap gap-2">'));
    expect(row).toBeDefined();
    expect(row!.startsWith('        <div className="flex flex-wrap gap-2">')).toBe(true);
  });
});
