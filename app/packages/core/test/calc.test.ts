import { describe, expect, it } from "vitest";
import {
  computeSkillProfile,
  daysBetween,
  learningProgress,
  projectProgress,
  topicReview,
  type Taxonomy,
} from "../src/index.ts";

const TODAY = "2026-11-23";

describe("progress", () => {
  it("project: done / all tasks", () => {
    const tasks = [{ status: "done" }, { status: "todo" }, { status: "doing" }, { status: "review" }] as const;
    expect(projectProgress({ progress_override: null }, [...tasks])).toBe(25);
  });
  it("project: override wins", () => {
    expect(projectProgress({ progress_override: 60 }, [{ status: "todo" }])).toBe(60);
  });
  it("project: no tasks = 0", () => {
    expect(projectProgress({ progress_override: null }, [])).toBe(0);
  });
  it("learning: understood / all topics", () => {
    expect(learningProgress([{ status: "understood" }, { status: "learning" }, { status: "needs-review" }])).toBe(33);
  });
});

describe("dates", () => {
  it("counts days across months", () => {
    expect(daysBetween("2026-10-30", "2026-11-23")).toBe(24);
  });
});

describe("topicReview (SPEC §4.6)", () => {
  const t = (status: string, last_reviewed: string | null, last_score: number | null) =>
    topicReview({ status: status as never, last_reviewed, last_score }, TODAY);

  it("ignores not-started topics", () => {
    expect(t("not-started", null, null).reasons).toEqual([]);
  });
  it("fresh and good = no review", () => {
    expect(t("understood", "2026-11-13", 80).reasons).toEqual([]);
  });
  it("exactly 14 days is still fresh, 15 is stale", () => {
    expect(t("understood", "2026-11-09", 80).reasons).toEqual([]);
    expect(t("understood", "2026-11-08", 80).reasons).toEqual(["stale"]);
  });
  it("started but never reviewed = stale", () => {
    expect(t("learning", null, null).reasons).toEqual(["stale"]);
  });
  it("low score = weak", () => {
    expect(t("learning", "2026-11-22", 59).reasons).toEqual(["weak"]);
    expect(t("learning", "2026-11-22", 60).reasons).toEqual([]);
  });
  it("stale and weak = priority 2", () => {
    const r = t("learning", "2026-11-01", 40);
    expect(r.reasons).toEqual(["stale", "weak"]);
    expect(r.priority).toBe(2);
  });
  it("manual needs-review is kept", () => {
    expect(t("needs-review", "2026-11-22", 90).reasons).toEqual(["manual"]);
  });
});

describe("computeSkillProfile (SPEC §4.9)", () => {
  const taxonomy: Taxonomy = [
    { id: "d", title: "D", skills: [{ id: "a", title: "A" }, { id: "b", title: "B" }] },
  ];
  const level = (assessments: Parameters<typeof computeSkillProfile>[1], adjustments: { skill: string; delta: number }[] = []) =>
    computeSkillProfile(taxonomy, assessments, adjustments, TODAY)[0]!;

  it("applies difficulty factors", () => {
    expect(level([{ skills: { a: 1 }, score: 100, difficulty: "easy", date: TODAY }]).skills[0]!.level).toBe(40);
    expect(level([{ skills: { a: 1 }, score: 100, difficulty: "medium", date: TODAY }]).skills[0]!.level).toBe(70);
    expect(level([{ skills: { a: 1 }, score: 100, difficulty: "hard", date: TODAY }]).skills[0]!.level).toBe(100);
  });

  it("rounds half up despite float noise (85 × 0.7 = 59.5 → 60)", () => {
    expect(level([{ skills: { a: 1 }, score: 85, difficulty: "medium", date: TODAY }]).skills[0]!.level).toBe(60);
  });

  it("weights recent results more (90-day half-life)", () => {
    const d = level([
      { skills: { a: 1 }, score: 100, difficulty: "hard", date: TODAY },
      { skills: { a: 1 }, score: 0, difficulty: "hard", date: "2026-08-25" }, // 90 days ago → weight 0.5
    ]);
    expect(d.skills[0]!.level).toBe(67);
  });

  it("uses skill weights from the assessment", () => {
    const d = level([{ skills: { a: 0.7, b: 0.3 }, score: 50, difficulty: "hard", date: TODAY }]);
    expect(d.skills.map((s) => s.level)).toEqual([50, 50]);
    expect(d.skills.map((s) => s.assessments)).toEqual([1, 1]);
  });

  it("never-assessed skills are 0, even with adjustments", () => {
    const d = level([], [{ skill: "a", delta: 10 }]);
    expect(d.skills[0]!.level).toBe(0);
  });

  it("clamps total AI adjustment to ±15", () => {
    const d = level(
      [{ skills: { a: 1 }, score: 50, difficulty: "hard", date: TODAY }],
      [{ skill: "a", delta: 10 }, { skill: "a", delta: 10 }],
    );
    expect(d.skills[0]).toMatchObject({ computed: 50, adjustment: 15, level: 65 });
  });

  it("domain level = mean of skills (unassessed count as 0)", () => {
    const d = level([{ skills: { a: 1 }, score: 80, difficulty: "hard", date: TODAY }]);
    expect(d.level).toBe(40);
  });
});
