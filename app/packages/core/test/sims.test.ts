import { describe, expect, it } from "vitest";
import { gradientDescent, kmeans, qLearning, schedule, valueIteration } from "../src/sims.ts";

describe("k-means", () => {
  const X: [number, number][] = [[1, 0], [3, 0], [9, 0], [11, 0]];
  it("K=1 puts the centroid at the mean: SSE 68", () => {
    const f = kmeans({ points: X, k: 1 });
    expect(f.at(-1)!.centroids).toEqual([[6, 0]]);
    expect(f.find((x) => x.phase === "assign")!.sse).toBe(168); // before moving: centroid at the first point (1): 0+4+64+100
    expect(f.at(-1)!.sse).toBe(68);
  });
  it("K=2 from the first two points converges to 2 and 10: SSE 4", () => {
    const f = kmeans({ points: X, k: 2 });
    const last = f.at(-1)!;
    expect(last.centroids).toEqual([[2, 0], [10, 0]]);
    expect(last.labels).toEqual([0, 0, 1, 1]);
    expect(last.sse).toBe(4);
    expect(last.note).toMatch(/converged/);
  });
  it("rejects a bad k", () => expect(() => kmeans({ points: X, k: 5 })).toThrow(/between 1 and 4/));
});

describe("CPU scheduling", () => {
  const P = [
    { id: "P1", arrival: 0, burst: 5 },
    { id: "P2", arrival: 1, burst: 3 },
    { id: "P3", arrival: 2, burst: 1 },
  ];
  it("Round Robin q=2 (new arrivals queue before the preempted process)", () => {
    const r = schedule({ processes: P, algorithm: "rr", quantum: 2 });
    expect(r.gantt.map((g) => `${g.id}:${g.start}-${g.end}`)).toEqual(["P1:0-2", "P2:2-4", "P3:4-5", "P1:5-7", "P2:7-8", "P1:8-9"]);
    expect(r.stats.map((s) => s.waiting)).toEqual([4, 4, 2]);
    expect(r.avg.waiting).toBeCloseTo(10 / 3);
    expect(r.frames.find((f) => f.time === 2)!.ready).toEqual(["P3", "P1"]);
  });
  it("FCFS, SJF and SRTF", () => {
    expect(schedule({ processes: P, algorithm: "fcfs" }).stats.map((s) => s.waiting)).toEqual([0, 4, 6]);
    expect(schedule({ processes: P, algorithm: "sjf" }).gantt.map((g) => g.id)).toEqual(["P1", "P3", "P2"]);
    const srtf = schedule({ processes: P, algorithm: "srtf" });
    expect(srtf.gantt.map((g) => `${g.id}:${g.start}-${g.end}`)).toEqual(["P1:0-1", "P2:1-2", "P3:2-3", "P2:3-5", "P1:5-9"]);
  });
  it("shows idle time and validates input", () => {
    const r = schedule({ processes: [{ id: "A", arrival: 2, burst: 1 }], algorithm: "fcfs" });
    expect(r.gantt[0]).toEqual({ id: "idle", start: 0, end: 2 });
    expect(() => schedule({ processes: [{ id: "A", arrival: 0, burst: 1.5 }], algorithm: "fcfs" })).toThrow(/whole numbers/);
  });
});

describe("gradient descent", () => {
  it("converges with a small learning rate and diverges with a large one", () => {
    const ok = gradientDescent({ f: "(x-3)^2", x0: 0, lr: 0.1, steps: 60 });
    expect(ok.frames.at(-1)!.x).toBeCloseTo(3, 3);
    expect(ok.diverged).toBe(false);
    const bad = gradientDescent({ f: "(x-3)^2", x0: 0, lr: 1.1, steps: 400 });
    expect(bad.diverged).toBe(true);
  });
});

describe("grid worlds", () => {
  const g = { rows: 1, cols: 4, terminals: [{ cell: [0, 3] as [number, number], reward: 1 }], gamma: 0.9 };
  it("value iteration converges to γ^distance and points right", () => {
    const f = valueIteration(g);
    const V = f.at(-1)!.V[0]!;
    expect(V[2]).toBeCloseTo(1);
    expect(V[1]).toBeCloseTo(0.9);
    expect(V[0]).toBeCloseTo(0.81);
    expect(f.at(-1)!.policy[0]!.slice(0, 3)).toEqual(["right", "right", "right"]);
  });
  it("Q-learning (seeded) learns to go right and is repeatable", () => {
    const run = () => qLearning({ ...g, start: [0, 0], alpha: 0.5, epsilon: 0.2, episodes: 200, seed: 7 });
    const a = run();
    expect(a.at(-1)!.policy[0]!.slice(0, 3)).toEqual(["right", "right", "right"]);
    expect(JSON.stringify(run())).toBe(JSON.stringify(a));
  });
});
