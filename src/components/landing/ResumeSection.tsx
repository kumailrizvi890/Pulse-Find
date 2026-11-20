"use client";

import { useRef, useState } from "react";
import {
  matchDemoRoles,
  parseResume,
  resumeTips,
  type ParsedResume,
  type RoleMatch,
  type ResumeTips,
} from "@/lib/resume-parse";

// Resume check (landing only, Nov 20 2026): paste resume text, drop
// a .txt file, or upload a PDF. The PDF is read in the browser with
// pdf.js from a CDN, so the file never leaves the visitor's machine.
// Everything is client-side: the parse runs in src/lib/resume-parse.ts
// and matches against the repo's demo roles, never the live board and
// never real user data. Live matching would need a backend route, see
// NOTES.md in the preview package.

const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";

const SAMPLE_RESUME = `Kumail Rizvi
kumail@example.com | (425) 555-0142
linkedin.com/in/example | github.com/example

EDUCATION
B.S. Computer Science, University of Washington Bothell, Dec 2027

SKILLS
TypeScript, JavaScript, React, Next.js, Node.js, Python, SQL, Git, Docker

EXPERIENCE
Software Engineering Intern, Northwind Labs, Jun 2026 - Sep 2026
- Built a dashboard in React and TypeScript used by 40 teammates
- Cut page load time by 35% by trimming bundle size and caching API calls
- Shipped 12 features across 3 months with code review from 2 engineers

PROJECTS
Pulse Find, job tracker with Next.js and Supabase
- Tracks 200 applications with stages, reminders, and an MCP server
- Grew to 500 users in the first month after launch`;

declare global {
  interface Window {
    pdfjsLib?: {
      getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: { str?: string }[] }> }> }> };
    };
  }
}

function loadPdfJs(): Promise<void> {
  if (window.pdfjsLib) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PDFJS_CDN;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("pdf.js did not load"));
    document.head.appendChild(script);
  });
}

async function readPdfText(file: File): Promise<string> {
  await loadPdfJs();
  const data = await file.arrayBuffer();
  const pdf = await window.pdfjsLib!.getDocument({ data }).promise;
  const parts: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    parts.push(content.items.map((item) => item.str ?? "").join(" "));
  }
  return parts.join("\n");
}

export function ResumeSection() {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedResume | null>(null);
  const [matches, setMatches] = useState<RoleMatch[]>([]);
  const [tips, setTips] = useState<ResumeTips | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = (value: string) => {
    setError("");
    if (value.trim().length < 40) {
      setError("Paste a bit more first. A few lines are not enough to check.");
      setParsed(null);
      setMatches([]);
      setTips(null);
      return;
    }
    const p = parseResume(value);
    const m = matchDemoRoles(p);
    setParsed(p);
    setMatches(m.slice(0, 5));
    setTips(resumeTips(p, m));
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const value = file.name.toLowerCase().endsWith(".pdf")
        ? await readPdfText(file)
        : await file.text();
      setText(value);
      run(value);
    } catch {
      setError("That file did not read. For a PDF, check the connection and try again, or paste the text instead.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="resume-check" id="resume" aria-label="Check your resume">
      <span className="about-kicker">Resume check</span>
      <h2 className="big">
        See how your resume <em>reads to a tracker.</em>
      </h2>
      <p className="lede">
        Paste your resume or drop a file. It stays in your browser, nothing
        is uploaded, and you get matching sample roles plus fixes you can
        make today.
      </p>
      <div className="resume-grid">
        <div>
          <label className="resume-label" htmlFor="resumeText">
            Your resume
          </label>
          <textarea
            id="resumeText"
            className="resume-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your resume text here"
            rows={14}
          />
          <div className="resume-actions">
            <button type="button" className="cta2" onClick={() => run(text)} disabled={busy}>
              {busy ? "Reading file" : "Check my resume"}
            </button>
            <button type="button" className="cta2 ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
              Upload .txt or .pdf
            </button>
            <button
              type="button"
              className="cta2 ghost"
              onClick={() => {
                setText(SAMPLE_RESUME);
                run(SAMPLE_RESUME);
              }}
            >
              Try a sample resume
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.pdf,text/plain,application/pdf"
              hidden
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
          {error ? (
            <p className="resume-error" role="alert">{error}</p>
          ) : null}
          <p className="resume-privacy">
            Client-side only. Your resume never leaves this page.
          </p>
        </div>
        <div>
          {parsed && tips ? (
            <div className="resume-results">
              <h3>What we found</h3>
              <div className="resume-chips">
                {parsed.skills.length > 0 ? (
                  parsed.skills.map((s) => <span key={s}>{s}</span>)
                ) : (
                  <span className="dim">No skills found yet</span>
                )}
              </div>
              <p className="resume-facts">
                {parsed.wordCount} words · {parsed.bulletCount} bullets ·{" "}
                {parsed.yearsExperience !== null ? `${parsed.yearsExperience} years experience` : "no years stated"}
                {parsed.education.length > 0 ? ` · ${parsed.education[0]}` : ""}
              </p>
              <h3>Matching sample roles</h3>
              <ul className="resume-matches">
                {matches.map((m) => (
                  <li key={`${m.company}-${m.role}`}>
                    <div>
                      <b>{m.role}</b>
                      <span>{m.company} · {m.track}</span>
                    </div>
                    <b className="resume-score">{m.score}%</b>
                    <p>
                      {m.matched.length > 0 ? `You have: ${m.matched.join(", ")}` : "No listed skills match yet."}
                      {m.missing.length > 0 ? ` Missing: ${m.missing.join(", ")}.` : ""}
                    </p>
                  </li>
                ))}
              </ul>
              <h3>Fixes to make</h3>
              <ul className="resume-tips">
                {tips.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="resume-empty">
              <p>Your matches and fixes show up here.</p>
              <p>Try the sample resume to see how it works.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
