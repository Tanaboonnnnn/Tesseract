type Measured = { assessments: number };
type Point = { date: string; score: number };

export function assessedSkillCount(skills: readonly Measured[]) {
  return skills.filter((skill) => skill.assessments > 0).length;
}

export function skillCoverage(domains: readonly { skills: readonly Measured[] }[]) {
  return { assessedDomains: domains.filter(({ skills }) => assessedSkillCount(skills) > 0).length, totalDomains: domains.length };
}

export function assessmentTrend(points: readonly Point[]): Point[] {
  if (points.length < 2) return [];
  return [...points].sort((a, b) => a.date.localeCompare(b.date)).slice(-12)
    .map(({ date, score }) => ({ date, score }));
}
