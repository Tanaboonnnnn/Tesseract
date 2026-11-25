/**
 * Pure calculations: progress, review rules, skill levels.
 * No I/O here — everything is testable with plain objects.
 */
import { MAX_AI_ADJUSTMENT } from "./schemas.ts";
import type { Adjustment, Assessment, Project, Taxonomy, Task, Topic, TopicStatus } from "./schemas.ts";

/* ---------- tunables (SPEC §4.6, §4.9) ---------- */

export const DIFFICULTY_FACTOR = { easy: 0.4, medium: 0.7, hard: 1 } as const;
export const RECENCY_HALF_LIFE_DAYS = 90;
export const REVIEW_STALE_DAYS = 14;
export const REVIEW_WEAK_SCORE = 60;

/* ---------- dates ---------- */

/** Local calendar date as YYYY-MM-DD. */
export function toIsoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function isoToUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round((isoToUtc(to) - isoToUtc(from)) / 86_400_000);
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Round half up, immune to float noise (85 × 0.7 = 59.49999… must round to 60). */
export function roundScore(n: number): number {
  return Math.round(Math.round(n * 1e9) / 1e9);
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return roundScore(values.reduce((a, b) => a + b, 0) / values.length);
}

/* ---------- progress ---------- */

/** Done tasks / all tasks, unless overridden (SPEC §4.2). */
export function projectProgress(project: Pick<Project, "progress_override">, tasks: Pick<Task, "status">[]): number {
  if (project.progress_override != null) return project.progress_override;
  if (tasks.length === 0) return 0;
  return roundScore((tasks.filter((t) => t.status === "done").length / tasks.length) * 100);
}

/** Understood topics / all topics (SPEC §4.4). */
export function learningProgress(topics: Pick<Topic, "status">[]): number {
  if (topics.length === 0) return 0;
  return roundScore((topics.filter((t) => t.status === "understood").length / topics.length) * 100);
}

/* ---------- review rules (SPEC §4.6) ---------- */

/** stale = not reviewed recently · weak = last score too low · manual = set by hand */
export type ReviewReason = "stale" | "weak" | "manual";

export interface TopicReview {
  reasons: ReviewReason[];
  /** 0 = fine, 1 = one reason, 2 = stale and weak */
  priority: number;
  days_since_review: number | null;
}

export function topicReview(
  topic: Pick<Topic, "status" | "last_reviewed" | "last_score">,
  today: string,
): TopicReview {
  const days = topic.last_reviewed ? daysBetween(topic.last_reviewed, today) : null;
  if (topic.status === "not-started") return { reasons: [], priority: 0, days_since_review: days };

  const reasons: ReviewReason[] = [];
  if (days === null || days > REVIEW_STALE_DAYS) reasons.push("stale");
  if (topic.last_score != null && topic.last_score < REVIEW_WEAK_SCORE) reasons.push("weak");
  if (reasons.length === 0 && topic.status === "needs-review") reasons.push("manual");
  return { reasons, priority: reasons.length, days_since_review: days };
}

export function effectiveTopicStatus(topic: Pick<Topic, "status">, review: TopicReview): TopicStatus {
  return review.reasons.length > 0 ? "needs-review" : topic.status;
}

/* ---------- skill levels (SPEC §4.9) ---------- */

export interface SkillLevel {
  id: string;
  title: string;
  /** From assessments only. */
  computed: number;
  /** Sum of AI adjustments, clamped to ±MAX_AI_ADJUSTMENT. */
  adjustment: number;
  /** Final 0–100. Never-assessed skills are 0. */
  level: number;
  assessments: number;
}

export interface DomainLevel {
  id: string;
  title: string;
  /** Mean of its skills' levels (unassessed count as 0). */
  level: number;
  skills: SkillLevel[];
}

export function computeSkillProfile(
  taxonomy: Taxonomy,
  assessments: Pick<Assessment, "skills" | "score" | "difficulty" | "date">[],
  adjustments: Pick<Adjustment, "skill" | "delta">[],
  today: string,
): DomainLevel[] {
  return taxonomy.map((domain) => {
    const skills = domain.skills.map((skill): SkillLevel => {
      let weighted = 0;
      let weights = 0;
      let count = 0;
      for (const a of assessments) {
        const w = a.skills[skill.id];
        if (!w) continue;
        count++;
        const age = Math.max(0, daysBetween(a.date, today));
        const recency = 0.5 ** (age / RECENCY_HALF_LIFE_DAYS);
        weighted += a.score * DIFFICULTY_FACTOR[a.difficulty] * w * recency;
        weights += w * recency;
      }
      const computed = weights > 0 ? weighted / weights : 0;
      const rawAdjustment = adjustments.filter((x) => x.skill === skill.id).reduce((t, x) => t + x.delta, 0);
      const adjustment = clamp(rawAdjustment, -MAX_AI_ADJUSTMENT, MAX_AI_ADJUSTMENT);
      const level = count > 0 ? clamp(computed + adjustment, 0, 100) : 0;
      return {
        id: skill.id,
        title: skill.title,
        computed: roundScore(computed),
        adjustment,
        level: roundScore(level),
        assessments: count,
      };
    });
    return { id: domain.id, title: domain.title, level: average(skills.map((s) => s.level)), skills };
  });
}
