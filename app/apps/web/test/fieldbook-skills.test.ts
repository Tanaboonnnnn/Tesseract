import { describe, expect, it } from "vitest";
import { assessmentTrend, skillCoverage } from "../src/lib/fieldbook-skills.ts";

describe("Fieldbook Skills", () => {
  it("counts assessed domains and distinguishes a real zero from no assessments", () => {
    expect(skillCoverage([
      { skills: [{ assessments: 1 }, { assessments: 0 }] },
      { skills: [{ assessments: 0 }] },
      { skills: [] },
    ])).toEqual({ assessedDomains: 1, totalDomains: 3 });
  });

  it("only shows a trend for two or more real assessments", () => {
    expect(assessmentTrend([{ date: "2026-11-01", score: 0 }])).toEqual([]);
  });

  it("uses the latest raw assessment scores in chronological order, without mutating the source", () => {
    const points = Array.from({ length: 15 }, (_, i) => ({ date: `2026-11-${String(15 - i).padStart(2, "0")}`, score: i }));
    const trend = assessmentTrend(points);
    expect(trend).toHaveLength(12);
    expect(trend[0]).toEqual({ date: "2026-11-04", score: 11 });
    expect(trend.at(-1)).toEqual({ date: "2026-11-15", score: 0 });
    expect(points[0]?.date).toBe("2026-11-15");
  });
});
