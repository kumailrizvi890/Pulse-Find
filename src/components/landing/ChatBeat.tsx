import Link from "next/link";
import { answerGeneralQuestion, DEFAULT_APP_ORIGIN, type GeneralChatContext } from "@/lib/task-chat";
import { demoApplications, demoEvents } from "@/lib/demo-data";
import { demoContacts } from "@/lib/pipeline";
import { todayISO } from "@/lib/metrics";
import { PulseDot } from "@/components/PulseBrand";

// The chatbot beat in the landing "Watch it work" section: short copy plus
// a real exchange with Ask Pulse. The answer is not typed by hand, it is
// computed here from the same demo data the page runs on, through the same
// deterministic function the chat itself uses, so the beat always shows a
// true answer. Dates move with the day, so tests pin the shape (two
// follow-ups, Marcus then Priya), not the date strings.
export const CHAT_BEAT_QUESTION = "What networking follow-ups are due?";

export function ChatBeat() {
  const today = todayISO();
  const apps = demoApplications(today);
  const ctx: GeneralChatContext = {
    apps,
    events: demoEvents(apps),
    contacts: demoContacts(today),
    today,
    origin: DEFAULT_APP_ORIGIN,
    ghostDays: 21,
    weeklyGoal: 8,
    trackerPath: "/demo",
  };
  const answer = answerGeneralQuestion(CHAT_BEAT_QUESTION, ctx);
  return (
    <div className="mt-8 grid grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div>
        <h3 className="font-display text-2xl font-extrabold tracking-tight">Ask Pulse, get an answer</h3>
        <p className="mt-3 max-w-[56ch] text-muted">
          Pulse answers straight from your tracker. It never guesses, and anything it cannot answer goes to your
          connected agent.
        </p>
        <p className="mt-4">
          <Link href="/demo?chat=1" className="text-sm font-semibold text-accent">
            Try it in the demo →
          </Link>
        </p>
      </div>
      <div className="rounded-[22px] border border-line bg-surface p-5 shadow-panel" aria-label="Ask Pulse answering a question">
        <p className="ml-auto w-fit max-w-full rounded-xl rounded-br-sm bg-accent-soft px-3 py-2 text-sm text-ink">
          {CHAT_BEAT_QUESTION}
        </p>
        <p className="mt-2 flex items-start gap-2 text-sm text-muted">
          <PulseDot className="mt-1.5 shrink-0" />
          <span className="w-fit max-w-full whitespace-pre-line rounded-xl rounded-bl-sm bg-surface-2 px-3 py-2 text-ink">
            {answer.text}
          </span>
        </p>
      </div>
    </div>
  );
}
