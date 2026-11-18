import { afterEach, describe, expect, it } from "vitest";
import { demoPipelineStore } from "../pipeline";
import {
  JOB_PICKS_KEY,
  readJobPicks,
  removeJobPick,
  writeJobPicks,
  type JobPick,
  type JobPickMark,
} from "../job-picks";

const TODAY = "2026-11-17";

const ANDURIL: JobPick = {
  id: "job-anduril-1",
  company: "Anduril",
  title: "Software Engineer Intern",
  location: "Costa Mesa, CA",
  remote: false,
  url: "https://example.com/anduril",
  track: "Internship",
  tech: true,
  posted_at: "2026-11-16",
};
const ROBLOX: JobPick = {
  id: "job-roblox-2",
  company: "Roblox",
  title: "Software Engineer Intern",
  location: "San Mateo, CA",
  remote: false,
  url: "https://example.com/roblox",
  track: "Internship",
  tech: true,
  posted_at: "2026-11-15",
};
// Same company + role as seed lead 1, so it must never appear twice.
const WESTFIELD_DUP: JobPick = {
  id: "job-westfield-9",
  company: "Westfield Labs",
  title: "Software Engineer Intern",
  location: "Seattle, WA",
  remote: false,
  url: "",
  track: "Internship",
  tech: true,
  posted_at: null,
};

/** Minimal localStorage stand-in: the vitest env is node, so the real one does not exist. */
function installStorage(raw: string | null = null) {
  const data = new Map<string, string>();
  if (raw !== null) data.set(JOB_PICKS_KEY, raw);
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      },
      removeItem: (k: string) => {
        data.delete(k);
      },
      clear: () => data.clear(),
    },
    configurable: true,
  });
  return data;
}

function removeStorage() {
  delete (globalThis as Record<string, unknown>).localStorage;
}

/** Exactly what the jobs board writes when a visitor saves a job. */
function seedPicks(picks: { job: JobPick; mark: JobPickMark }[]) {
  const marks: Record<string, JobPickMark> = {};
  const saved: Record<string, JobPick> = {};
  for (const { job, mark } of picks) {
    marks[job.id] = mark;
    saved[job.id] = job;
  }
  writeJobPicks(marks, saved);
}

afterEach(() => {
  removeStorage();
});

describe("demo leads read the saved job picks", () => {
  it("without localStorage the demo still shows just the six seed leads", async () => {
    removeStorage();
    const leads = await demoPipelineStore(TODAY).loadLeads();
    expect(leads).toHaveLength(6);
    expect(leads[0].company).toBe("Westfield Labs");
  });

  it("a saved job appears as a lead after the seeds", async () => {
    installStorage();
    seedPicks([{ job: ANDURIL, mark: "saved" }]);
    const leads = await demoPipelineStore(TODAY).loadLeads();
    expect(leads).toHaveLength(7);
    const pick = leads[6];
    expect(pick.company).toBe("Anduril");
    expect(pick.role).toBe("Software Engineer Intern");
    expect(pick.track).toBe("Internship");
    expect(pick.location).toBe("Costa Mesa, CA");
    expect(pick.url).toBe("https://example.com/anduril");
    expect(pick.source).toBe("Job board");
    expect(pick.status).toBe("New");
    expect(pick.fit_note).toBe("Saved from Find jobs");
    expect(pick.date_found).toBe(TODAY);
  });

  it("a hidden mark never becomes a lead", async () => {
    installStorage();
    seedPicks([{ job: ANDURIL, mark: "hidden" }]);
    const leads = await demoPipelineStore(TODAY).loadLeads();
    expect(leads).toHaveLength(6);
    expect(leads.some((l) => l.company === "Anduril")).toBe(false);
  });

  it("a pick duplicating a seed lead is not shown twice", async () => {
    installStorage();
    seedPicks([{ job: WESTFIELD_DUP, mark: "saved" }]);
    const leads = await demoPipelineStore(TODAY).loadLeads();
    expect(leads).toHaveLength(6);
    expect(leads.filter((l) => l.company === "Westfield Labs")).toHaveLength(1);
  });

  it("a corrupt picks entry leaves the six seeds alone", async () => {
    installStorage("not json{{");
    const leads = await demoPipelineStore(TODAY).loadLeads();
    expect(leads).toHaveLength(6);
  });

  it("two picks keep their save order after the seeds", async () => {
    installStorage();
    seedPicks([
      { job: ANDURIL, mark: "saved" },
      { job: ROBLOX, mark: "saved" },
    ]);
    const leads = await demoPipelineStore(TODAY).loadLeads();
    expect(leads).toHaveLength(8);
    expect(leads.slice(6).map((l) => l.company)).toEqual(["Anduril", "Roblox"]);
  });

  it("deleting a pick-lead forgets the pick, so it stays gone after reload", async () => {
    installStorage();
    seedPicks([{ job: ANDURIL, mark: "saved" }]);
    const store = demoPipelineStore(TODAY);
    expect((await store.loadLeads()).some((l) => l.company === "Anduril")).toBe(true);

    await store.removeLead("demo-pick-job-anduril-1");
    expect((await store.loadLeads()).some((l) => l.company === "Anduril")).toBe(false);
    expect(readJobPicks()).toEqual({ marks: {}, saved: {} });
    // A fresh store (a reload) still has no Anduril.
    expect((await demoPipelineStore(TODAY).loadLeads()).some((l) => l.company === "Anduril")).toBe(false);
  });

  it("deleting a seed lead leaves saved picks alone", async () => {
    installStorage();
    seedPicks([{ job: ANDURIL, mark: "saved" }]);
    const store = demoPipelineStore(TODAY);
    await store.removeLead("demo-lead-1");
    expect(readJobPicks().saved["job-anduril-1"].company).toBe("Anduril");
    expect((await demoPipelineStore(TODAY).loadLeads()).some((l) => l.company === "Anduril")).toBe(true);
  });

  it("a pick-lead can be edited and queued like any other lead", async () => {
    installStorage();
    seedPicks([{ job: ANDURIL, mark: "saved" }]);
    const store = demoPipelineStore(TODAY);
    const next = await store.updateLead("demo-pick-job-anduril-1", { status: "Queued" });
    expect(next.status).toBe("Queued");
    expect(next.company).toBe("Anduril");
  });
});

describe("job-picks storage", () => {
  it("round-trips what the board writes and forgets one pick", () => {
    installStorage();
    writeJobPicks(
      { "job-anduril-1": "saved", "job-roblox-2": "saved" },
      { "job-anduril-1": ANDURIL, "job-roblox-2": ROBLOX },
    );
    expect(readJobPicks().saved["job-roblox-2"].company).toBe("Roblox");

    removeJobPick("job-anduril-1");
    const after = readJobPicks();
    expect(after.saved["job-anduril-1"]).toBeUndefined();
    expect(after.marks["job-anduril-1"]).toBeUndefined();
    expect(after.saved["job-roblox-2"].company).toBe("Roblox");

    expect(() => removeJobPick("job-never-there")).not.toThrow();
  });

  it("returns empty for a corrupt entry instead of throwing", () => {
    installStorage("{{bad");
    expect(readJobPicks()).toEqual({ marks: {}, saved: {} });
  });
});
