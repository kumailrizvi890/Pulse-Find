// Job-hunt knowledge: general advice Pulse can give when a question is
// not about the user's tracker.
//
// Deterministic, like the rest of the chat: no LLM, no network calls, no
// new secrets, no cost. Every answer here is general knowledge, never a
// tracker fact, so it can never invent an application, a status, or a
// deadline. The router tries the tracker first and only reaches this
// layer when no tracker intent matches, and the Talk to Agent handoff
// still covers anything that needs live data, sending email, or changing
// the tracker. No em dashes in any user-facing string.

export interface KnowledgeAnswer {
  id: string;
  text: string;
}

interface KnowledgeIntent {
  id: string;
  test: (q: string) => boolean;
  text: string;
}

const INTENTS: KnowledgeIntent[] = [
  {
    id: "knowledge-who-are-you",
    test: (q) => /\bwho are you\b|\bwhat are you\b|\bwhat is pulse\b/.test(q),
    text: "I am Pulse, your job-hunt helper inside Pulse Find. I keep track of your applications, and I can help with interview prep, resumes, assessments, salary talk, and the rest of the hunt. Ask me anything about your tracker or the job search.",
  },
  {
    id: "knowledge-thanks",
    test: (q) => /\b(thank you|thanks|thank u|thx)\b/.test(q),
    text: "Anytime. You are doing the hard part, I just keep the notes. What is next?",
  },
  {
    id: "knowledge-joke",
    test: (q) => /\bjoke\b/.test(q),
    text: "Why did the developer go broke? Because he used up all his cache. Now let us put that brain to work, want to practice an interview question or check what is waiting on you?",
  },
  {
    id: "knowledge-how-are-you",
    test: (q) =>
      /\bhow are you\b|\bwhat'?s up\b|\bwhat is up\b|\bhow'?s it going\b|\bgood (morning|afternoon|evening)\b/.test(q),
    text: "I am doing well, thanks for asking. I am keeping an eye on your tracker and your job hunt. What is on your mind today, an application, an interview, or just a thought about the hunt?",
  },
  {
    id: "knowledge-oa-hackerrank",
    test: (q) => /\bhackerrank\b/.test(q),
    text: "For HackerRank, read the whole prompt first and check the sample input and output before you write anything. Most questions give you a function to fill in, so keep your solution inside it and test the edge cases: empty input, one item, and the biggest input. Pick the language you are fastest in and set your editor up the same way every time. If the clock is short, get a working answer first and then make it faster.",
  },
  {
    id: "knowledge-oa-codesignal",
    test: (q) => /\bcodesignal\b/.test(q),
    text: "For CodeSignal, expect a mix of straightforward coding and a few questions that test how you think under time pressure. Do the practice test first so the layout feels familiar. Write clean code as you go, since some employers read it afterwards. If a question is eating your time, move on and come back, a finished easy question beats a half done hard one.",
  },
  {
    id: "knowledge-oa-proctored",
    test: (q) => /\b(glider|proctor\w*)\b/.test(q),
    text: "For a proctored test like Glider, set up before you start: a quiet room, a charged laptop, stable wifi, and a webcam and mic that work. Use Chrome or Firefox on your own computer, close extra tabs, and turn off extensions and ad blockers that can trip the monitor. Keep your face in frame and your eyes on the screen, since the system flags looking away or switching tabs. You get one sitting and one attempt, so do the practice question first and start only when you are settled.",
  },
  {
    id: "knowledge-interview-behavioral",
    test: (q) =>
      /\b(behavioral|behavioural|\bstar\b|tell me about yourself|why should we hire|why do you want to work|greatest strength|greatest weakness|tell me about a time|describe a time)\b/.test(
        q,
      ),
    text: "For behavioral questions, use STAR: Situation, Task, Action, Result. Pick four or five stories from real work you did: a hard bug, a team disagreement, a tight deadline, something you built, a time you learned fast. For each one, know the one-line setup, what you personally did, and the result with a number if you have one. Keep each answer under two minutes and end on the result. If you blank mid-answer, say the story in your own words first, the structure follows.",
  },
  {
    id: "knowledge-interview-technical-prep",
    test: (q) =>
      /\b(technical interviews?|coding interviews?|leetcode|system design|dynamic programming)\b/.test(q) ||
      (/\b(prep|prepare|preparing|practice)\b/.test(q) && /\b(interviews?|technical|coding|algorithm|data structures?)\b/.test(q)),
    text: "For technical prep, practice the patterns, not random problems: arrays and strings, hash maps, two pointers, sliding window, trees, graphs, and basic dynamic programming. Do one or two problems a day and talk out loud while you solve them, since the interviewer grades how you think. Time yourself, then study the cleanest solution and write down what you missed. The day before, do one easy problem to stay warm and stop early so you are fresh.",
  },
  {
    id: "knowledge-interview-round",
    test: (q) =>
      /\b(what to expect|what happens|technical rounds?|interview process|interview format|onsite|phone screen|recruiter screen)\b/.test(q) ||
      /\bhow does (a|an|the) (interview|technical|round)\b/.test(q),
    text: "A technical round usually runs 45 to 60 minutes: a short intro, then one or two coding problems or a design question, then your questions. Expect to share your screen and talk through your thinking out loud. They grade how you break the problem down, not just whether the code runs. If you get stuck, say what you tried and ask for a hint, interviewers would rather see you recover than go silent. Bring one good question about the team or the work for the end.",
  },
  {
    id: "knowledge-resume",
    test: (q) => /\b(resume|resum[eé]|cv)\b/.test(q),
    text: "Keep your resume to one page and lead with what you built, not what you studied. Each bullet should say what you did, how you did it, and the result, with a number when you can. Put your strongest project first and cut anything that does not help this role. Match the words in the posting where they are true for you, since screeners and parsers both look for them. Check it in plain text too, so a parser sees the same resume a human sees.",
  },
  {
    id: "knowledge-salary",
    test: (q) =>
      /\b(salary|salaries|compensat\w*|negotiat\w*|offer letter|how much should i ask|what should i ask for|what is (a|the) (fair|good) (salary|pay)|what'?s the pay|what is the pay|the pay (for|is|range))\b/.test(q),
    text: "Never give a number first if you can help it: ask for their range and say you are flexible while you learn the full package. When you do negotiate, look at the whole offer, base pay, signing bonus, equity, and start date, not just salary. It is normal to ask for a day to think it over, and a polite counter is expected, not rude. Get the final offer in writing before you accept, and compare offers by total pay over the first year.",
  },
  {
    id: "knowledge-offer-choice",
    test: (q) => /\b(two offers|compare offers|choose between|which offer|should i accept|accept or decline)\b/.test(q),
    text: "When you have more than one offer, compare total pay over the first year, not just the headline salary, and weigh the team, the work, and where you will learn most. It is fine to ask each company for a few days to decide, and to tell them you are choosing between offers. Take the one you would still pick if the pay were equal, and get the final terms in writing before you accept.",
  },
  {
    id: "knowledge-referral",
    test: (q) => /\b(referral|referrals|referred|get (a )?referral|ask (for )?(a )?referral)\b/.test(q),
    text: "A referral helps most when it comes from someone who knows your work. Find people at the company on LinkedIn, ideally alumni or people on the team, and send a short note: who you are, why the role fits, and one thing you built. Ask for a referral only after a real exchange, not in the first message. If you have no connection there, apply anyway and keep building the connection for next time.",
  },
  {
    id: "knowledge-followup",
    test: (q) =>
      /\bfollow[- ]?up (after|email)\b/.test(q) ||
      /\bfollow[- ]?up (an? )?(application|interview|assessment)\b/.test(q) ||
      /\bfollow[- ]?up with (the )?(recruiter|hiring manager|interviewer)\b/.test(q) ||
      /\bthank you (note|email|letter)\b/.test(q),
    text: "After an interview, send a short thank you the same day: what you enjoyed, one thing you would bring to the role, and that you are looking forward to hearing back. After an application, wait a week or two, then send one short follow up restating your interest and asking about the timeline. One follow up is enough, if there is still no reply, keep applying elsewhere and let the tracker watch it.",
  },
  {
    id: "knowledge-networking",
    test: (q) =>
      /\bhow (do|can|should) i (network|connect)\b/.test(q) ||
      /\bnetworking (tips|advice|help|how)\b/.test(q) ||
      /\blinkedin (tips|profile|advice|help|message|request|headline)\b/.test(q) ||
      /\bhow to (network|connect with|reach out)\b/.test(q) ||
      /\bgrow my network\b|\bcold (email|message|outreach)\b/.test(q),
    text: "On LinkedIn, keep your headline clear about what you are looking for and your projects visible, since recruiters search by skills. Connect with a short personal note, not a blank request, and follow up with something useful: a question, an article, or a comment on their work. One real conversation a week beats fifty cold requests. When someone helps you, thank them and tell them how it went.",
  },
  {
    id: "knowledge-oa-general",
    test: (q) =>
      /\bonline assessments?\b/.test(q) ||
      (/\bassessments?\b/.test(q) && /\b(prep|prepare|tips|practice|how|timed|nervous)\b/.test(q)) ||
      /\b(timed|proctored) (test|assessment)\b/.test(q) ||
      /\bhow (do|can) i (do well on|pass|ace) (an? )?(assessment|test|oa)\b/.test(q),
    text: "For any timed assessment, do it when you are fresh, not late at night, and give yourself the full window with no interruptions. Skim all the questions first, answer the ones you are sure about, then come back to the hard ones. Keep water nearby and take one slow breath before each question. If the platform lets you test your code, run the samples before you submit.",
  },
  {
    id: "knowledge-interview-general",
    test: (q) =>
      /\binterviews?\b/.test(q) &&
      /\b(tips|advice|questions?|prep|prepare|preparing|practice|how to|how do i|help|ace|pass|do well)\b/.test(q),
    text: "A few things that help in any interview: research the company and the role the night before, and have two or three stories ready about things you actually built. Answer in the order they asked, keep it under two minutes, and end on the result. Ask one real question at the end, about the team or the work, not about perks. And send a short thank you the same day, it is the easiest way to stand out.",
  },
  {
    id: "knowledge-strategy",
    test: (q) =>
      /\bhow many (should|do) i (apply|send)\b/.test(q) ||
      /\bapplication (strategy|tips|plan|timeline)\b/.test(q) ||
      /\bhow (do|can|should) i (find|get|land)\b.*\b(job|role|internship)\b/.test(q) ||
      /\bwhere (do|can|should) i (apply|look|find)\b/.test(q),
    text: "Aim for a steady pace, around five to ten good applications a week beats fifty rushed ones. Apply to roles that fit your level and graduation date, and track every one with its date, status, and next step, so nothing goes quiet without you noticing. Follow up once after a week or two of silence, then move on and keep the pipeline full.",
  },
  {
    id: "knowledge-timeline",
    test: (q) =>
      /\bhow long (does|will|should) (it|take|until)\b/.test(q) ||
      /\bhow long (to|until|before)\b/.test(q) ||
      /\bwhen (will|should) i hear\b/.test(q),
    text: "Most companies reply in one to three weeks, and some take a month or more, especially for intern roles with hundreds of applicants. If a posting says nothing after three weeks, treat it as quiet and follow up once. A rejection is not a verdict on you, it usually means the timing or the fit was off, so keep the pipeline moving and review what you can improve for the next one.",
  },
  {
    id: "knowledge-day-plan",
    test: (q) =>
      /\bwhat should i (do|focus on|work on) today\b/.test(q) ||
      /\bplan (my|for) today\b/.test(q) ||
      /\bhow should i spend today\b/.test(q),
    text: "A good hunt day has three parts: one thing that moves an application forward, one thing that makes you stronger, and one thing that keeps a connection warm. That could be finishing an assessment, one practice problem, and one follow-up message. Start with what is waiting on you, ask me 'what is waiting on me' and do the soonest one first, then pick one of the other two. Small days add up fast.",
  },
  {
    id: "knowledge-rejected",
    test: (q) =>
      /\b(i got|i was|just got|got another|been) (rejected|turned down)\b/.test(q) || /\brejected again\b/.test(q),
    text: "That one hurts, and it is okay to feel it for a bit. A rejection is usually about timing or fit, not about you. If you want, ask me about that company and I can check what happened there in your tracker. Otherwise keep the pipeline moving, one more application today, and the next yes gets closer.",
  },
  {
    id: "knowledge-motivation",
    test: (q) =>
      /\bmotivat\w*\b/.test(q) ||
      /\bgiving up\b|\bgive up\b|\bburnt out\b|\bburned out\b|\blosing hope\b/.test(q) ||
      /\bi (feel|am) (so |really |very )?(stressed|overwhelmed|exhausted|tired|stuck|down|lost|discouraged)\b/.test(q),
    text: "It is okay to feel tired of the hunt, it is a lot of waiting and a lot of no. But every application you send is one more chance, and you only need one yes. Take a short break, then do one small thing today: one application, one practice problem, or one message to someone. Small days add up fast, and you are closer than it feels right now.",
  },
  {
    id: "knowledge-general-search",
    test: (q) =>
      /\b(job (search|hunt|market)|am i doing (this|it) right|is the (job hunt|search) (hard|hopeless)|job hunt (tips|advice|help)|how (do|can) i get (a|an) job)\b/.test(
        q,
      ),
    text: "The job hunt is a numbers game with a system behind it: apply steadily, track everything, follow up once, and keep one project improving so every application is a little stronger than the last. If you feel stuck, change one thing: the roles you target, your resume bullets, or who you reach out to. Small steady steps win, and I am here to keep the whole thing in one place.",
  },
];

/**
 * The knowledge answer for a question, or null when nothing in the
 * knowledge base matches. The router calls this only after the tracker
 * intents, so a tracker question never lands here.
 */
export function findKnowledgeAnswer(question: string): KnowledgeAnswer | null {
  const q = question.trim().toLowerCase();
  if (!q) return null;
  for (const intent of INTENTS) {
    if (intent.test(q)) return { id: intent.id, text: intent.text };
  }
  return null;
}
