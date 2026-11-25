import type { Tone } from "../components/ui.tsx";

/** Why a topic needs review (SPEC §4.6). */
export const REVIEW_REASON: Record<string, { text: string; tone: Tone; hint: string }> = {
  stale: { text: "Review", tone: "amber", hint: "Not reviewed for 14+ days" },
  weak: { text: "Weak", tone: "red", hint: "Last score below 60" },
  manual: { text: "Flagged", tone: "neutral", hint: "Marked for review" },
};

export const TOPIC_STATUS_LABEL = {
  "not-started": "Not started",
  learning: "Learning",
  understood: "Understood",
  "needs-review": "Needs review",
} as const;

export const SOURCE_LABEL: Record<string, string> = {
  "ai-quiz": "AI quiz",
  "web-quiz": "Web quiz",
  ctf: "CTF",
  lab: "Lab",
  competition: "Competition",
  exam: "Exam",
  project: "Project",
};

export const DIFFICULTY_TONE = { easy: "green", medium: "blue", hard: "red" } as const;
