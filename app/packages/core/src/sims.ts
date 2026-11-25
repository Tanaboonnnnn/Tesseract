/**
 * Simulation engines for lesson `sim` blocks (SPEC §4.16). Pure and deterministic (seeded where random), so the
 * app can run them in the browser from the AI's inputs and the results are always correct. Each returns frames:
 * the full state at every step, for the step player ("current state").
 */
import { compile, derivative } from "./expr.ts";

/* ---------------------------------- k-means ---------------------------------- */

export interface KMeansInput {
  points: [number, number][];
  k: number;
  /** Initial centroids; default: the first k points (deterministic, easy to follow by hand). */
  init?: [number, number][];
  maxIter?: number;
}
export interface KMeansFrame {
  iter: number;
  phase: "init" | "assign" | "update";
  centroids: [number, number][];
  /** Cluster index per point (-1 before the first assignment). */
  labels: number[];
  sse: number | null;
  note: string;
}

const d2 = (a: [number, number], b: [number, number]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

export function kmeans({ points, k, init, maxIter = 20 }: KMeansInput): KMeansFrame[] {
  if (k < 1 || k > points.length) throw new Error(`k must be between 1 and ${points.length}`);
  let centroids = (init ?? points.slice(0, k)).map((c) => [c[0], c[1]] as [number, number]);
  let labels = points.map(() => -1);
  const frames: KMeansFrame[] = [{ iter: 0, phase: "init", centroids, labels, sse: null, note: `Start with ${k} centroid(s)` }];
  for (let iter = 1; iter <= maxIter; iter++) {
    const next = points.map((p) => {
      let best = 0;
      for (let j = 1; j < k; j++) if (d2(p, centroids[j]!) < d2(p, centroids[best]!)) best = j;
      return best;
    });
    const changed = next.some((l, i) => l !== labels[i]);
    labels = next;
    const sse = points.reduce((s, p, i) => s + d2(p, centroids[labels[i]!]!), 0);
    frames.push({ iter, phase: "assign", centroids, labels, sse, note: changed ? "Assign every point to its nearest centroid" : "No point changed cluster: converged" });
    if (!changed) break;
    centroids = centroids.map((c, j) => {
      const mine = points.filter((_, i) => labels[i] === j);
      return mine.length ? [mine.reduce((s, p) => s + p[0], 0) / mine.length, mine.reduce((s, p) => s + p[1], 0) / mine.length] : c;
    });
    const sse2 = points.reduce((s, p, i) => s + d2(p, centroids[labels[i]!]!), 0);
    frames.push({ iter, phase: "update", centroids, labels, sse: sse2, note: "Move each centroid to the mean of its points" });
  }
  return frames;
}

/* ------------------------------- CPU scheduling ------------------------------- */

export type SchedAlgo = "fcfs" | "sjf" | "srtf" | "rr" | "priority" | "priority-preemptive";
export interface Proc {
  id: string;
  arrival: number;
  burst: number;
  /** Lower number = higher priority. */
  priority?: number;
}
export interface SchedInput {
  processes: Proc[];
  algorithm: SchedAlgo;
  quantum?: number;
}
export interface SchedFrame {
  time: number;
  running: string | null;
  ready: string[];
  done: string[];
  remaining: Record<string, number>;
  note: string;
}
export interface SchedResult {
  gantt: { id: string; start: number; end: number }[];
  frames: SchedFrame[];
  stats: { id: string; completion: number; turnaround: number; waiting: number; response: number }[];
  avg: { turnaround: number; waiting: number; response: number };
}

export function schedule({ processes, algorithm, quantum = 2 }: SchedInput): SchedResult {
  if (!processes.length) throw new Error("no processes");
  for (const p of processes) {
    if (!Number.isInteger(p.arrival) || !Number.isInteger(p.burst) || p.arrival < 0 || p.burst < 1) throw new Error(`process ${p.id}: arrival and burst must be whole numbers (burst ≥ 1)`);
  }
  const total = processes.reduce((s, p) => s + p.burst, 0) + Math.max(...processes.map((p) => p.arrival));
  if (total > 2000) throw new Error("simulation too long (keep arrival + bursts under 2000 time units)");
  if (algorithm === "rr" && (!Number.isInteger(quantum) || quantum < 1)) throw new Error("quantum must be a whole number ≥ 1");

  const order = [...processes].sort((a, b) => a.arrival - b.arrival || processes.indexOf(a) - processes.indexOf(b));
  const rem: Record<string, number> = Object.fromEntries(processes.map((p) => [p.id, p.burst]));
  const firstRun: Record<string, number> = {};
  const completion: Record<string, number> = {};
  const gantt: SchedResult["gantt"] = [];
  const frames: SchedFrame[] = [];
  const ready: string[] = [];
  const done: string[] = [];
  let arrivedIdx = 0;
  let time = 0;
  let running: string | null = null;
  let sliceLeft = 0;
  const byId = Object.fromEntries(processes.map((p) => [p.id, p]));
  const admit = () => {
    while (arrivedIdx < order.length && order[arrivedIdx]!.arrival <= time) ready.push(order[arrivedIdx++]!.id);
  };
  const preemptive = algorithm === "srtf" || algorithm === "priority-preemptive";
  const pick = (): string | null => {
    if (!ready.length) return null;
    let i = 0;
    if (algorithm === "sjf") i = ready.reduce((bi, id, j) => (byId[id]!.burst < byId[ready[bi]!]!.burst ? j : bi), 0);
    if (algorithm === "srtf") i = ready.reduce((bi, id, j) => (rem[id]! < rem[ready[bi]!]! ? j : bi), 0);
    if (algorithm === "priority" || algorithm === "priority-preemptive") i = ready.reduce((bi, id, j) => ((byId[id]!.priority ?? 0) < (byId[ready[bi]!]!.priority ?? 0) ? j : bi), 0);
    return ready.splice(i, 1)[0]!;
  };
  const better = (a: string, b: string) =>
    algorithm === "srtf" ? rem[a]! < rem[b]! : (byId[a]!.priority ?? 0) < (byId[b]!.priority ?? 0);

  admit();
  while (done.length < processes.length) {
    let note = "";
    if (running && preemptive && ready.some((id) => better(id, running!))) {
      ready.push(running);
      note = `${running} is preempted`;
      running = null;
    }
    if (!running) {
      running = pick();
      sliceLeft = quantum;
      if (running) {
        firstRun[running] ??= time;
        note = note ? `${note}; ${running} starts` : `${running} starts`;
      }
    }
    frames.push({ time, running, ready: [...ready], done: [...done], remaining: { ...rem }, note: note || (running ? `${running} keeps running` : "CPU idle") });
    const id = running ?? "idle";
    const last = gantt[gantt.length - 1];
    if (last && last.id === id && last.end === time) last.end = time + 1;
    else gantt.push({ id, start: time, end: time + 1 });
    time++;
    if (running) {
      rem[running]!--;
      sliceLeft--;
    }
    admit(); // arrivals at `time` join the queue before a preempted RR process goes to the back
    if (running && rem[running] === 0) {
      completion[running] = time;
      done.push(running);
      running = null;
    } else if (running && algorithm === "rr" && sliceLeft === 0) {
      ready.push(running);
      running = null;
    }
  }
  frames.push({ time, running: null, ready: [], done: [...done], remaining: { ...rem }, note: "All processes finished" });
  const stats = processes.map((p) => {
    const turnaround = completion[p.id]! - p.arrival;
    return { id: p.id, completion: completion[p.id]!, turnaround, waiting: turnaround - p.burst, response: firstRun[p.id]! - p.arrival };
  });
  const mean = (k: "turnaround" | "waiting" | "response") => stats.reduce((s, x) => s + x[k], 0) / stats.length;
  return { gantt, frames, stats, avg: { turnaround: mean("turnaround"), waiting: mean("waiting"), response: mean("response") } };
}

/* ------------------------------- gradient descent ------------------------------- */

export interface GradientInput {
  /** f(x) in the safe expression language, e.g. "(x-3)^2 + 1". */
  f: string;
  x0: number;
  lr: number;
  steps?: number;
}
export interface GradientFrame {
  i: number;
  x: number;
  fx: number;
  grad: number;
}

export function gradientDescent({ f, x0, lr, steps = 20 }: GradientInput): { frames: GradientFrame[]; diverged: boolean } {
  const fn = compile(f, ["x"]);
  const F = (x: number) => fn({ x });
  const frames: GradientFrame[] = [];
  let x = x0;
  let diverged = false;
  for (let i = 0; i <= Math.min(steps, 500); i++) {
    const g = derivative(F, x);
    frames.push({ i, x, fx: F(x), grad: g });
    if (!Number.isFinite(x) || Math.abs(x) > 1e6 || !Number.isFinite(F(x))) {
      diverged = true;
      break;
    }
    x = x - lr * g;
  }
  return { frames, diverged };
}

/* --------------------------------- grid worlds --------------------------------- */

export interface GridWorld {
  rows: number;
  cols: number;
  walls?: [number, number][];
  /** Terminal cells and their reward. */
  terminals: { cell: [number, number]; reward: number }[];
  /** Reward for every non-terminal move (often a small negative). */
  stepReward?: number;
  gamma: number;
  /** Chance an action slips sideways (0 = deterministic). */
  noise?: number;
  start?: [number, number];
}
export const ACTIONS = ["up", "right", "down", "left"] as const;
export type Action = (typeof ACTIONS)[number];
const MOVE: Record<Action, [number, number]> = { up: [-1, 0], right: [0, 1], down: [1, 0], left: [0, -1] };

function gridHelpers(g: GridWorld) {
  if (g.rows < 1 || g.cols < 1 || g.rows * g.cols > 144) throw new Error("grid must be between 1 and 144 cells");
  const key = (r: number, c: number) => `${r},${c}`;
  const walls = new Set((g.walls ?? []).map(([r, c]) => key(r, c)));
  const terminal = new Map(g.terminals.map((t) => [key(t.cell[0], t.cell[1]), t.reward]));
  const step = (r: number, c: number, a: Action): [number, number] => {
    const nr = r + MOVE[a][0];
    const nc = c + MOVE[a][1];
    return nr < 0 || nc < 0 || nr >= g.rows || nc >= g.cols || walls.has(key(nr, nc)) ? [r, c] : [nr, nc];
  };
  const sideways = (a: Action): Action[] => (a === "up" || a === "down" ? ["left", "right"] : ["up", "down"]);
  const outcomes = (r: number, c: number, a: Action): { p: number; to: [number, number] }[] => {
    const n = g.noise ?? 0;
    return [{ p: 1 - n, to: step(r, c, a) }, ...sideways(a).map((s) => ({ p: n / 2, to: step(r, c, s) }))].filter((o) => o.p > 0);
  };
  const reward = (to: [number, number]) => terminal.get(key(to[0], to[1])) ?? g.stepReward ?? 0;
  return { key, walls, terminal, step, outcomes, reward };
}

export interface ValueFrame {
  sweep: number;
  V: number[][];
  policy: (Action | null)[][];
  delta: number;
}

/** Bellman optimality sweeps: V(s) = max_a Σ p(s'|s,a)·[r + γ·V(s')]. Terminal cells keep V = 0 (reward on entry). */
export function valueIteration(g: GridWorld, maxSweeps = 50, theta = 1e-4): ValueFrame[] {
  const h = gridHelpers(g);
  let V = Array.from({ length: g.rows }, () => Array(g.cols).fill(0) as number[]);
  const frames: ValueFrame[] = [];
  const policyOf = (Vs: number[][]) =>
    Vs.map((row, r) =>
      row.map((_, c) => {
        if (h.walls.has(h.key(r, c)) || h.terminal.has(h.key(r, c))) return null;
        let best: Action = "up";
        let bestQ = -Infinity;
        for (const a of ACTIONS) {
          const q = h.outcomes(r, c, a).reduce((s, o) => s + o.p * (h.reward(o.to) + g.gamma * Vs[o.to[0]]![o.to[1]]!), 0);
          if (q > bestQ + 1e-12) [best, bestQ] = [a, q];
        }
        return best;
      }),
    );
  frames.push({ sweep: 0, V, policy: policyOf(V), delta: Infinity });
  for (let sweep = 1; sweep <= maxSweeps; sweep++) {
    let delta = 0;
    const next = V.map((row, r) =>
      row.map((v, c) => {
        if (h.walls.has(h.key(r, c)) || h.terminal.has(h.key(r, c))) return 0;
        const best = Math.max(...ACTIONS.map((a) => h.outcomes(r, c, a).reduce((s, o) => s + o.p * (h.reward(o.to) + g.gamma * V[o.to[0]]![o.to[1]]!), 0)));
        delta = Math.max(delta, Math.abs(best - v));
        return best;
      }),
    );
    V = next;
    frames.push({ sweep, V, policy: policyOf(V), delta });
    if (delta < theta) break;
  }
  return frames;
}

export interface QLearnInput extends GridWorld {
  alpha: number;
  epsilon: number;
  episodes: number;
  seed?: number;
  maxSteps?: number;
}
export interface QFrame {
  episode: number;
  Q: number[][][];
  policy: (Action | null)[][];
  return: number;
  steps: number;
}

/** Seeded PRNG (mulberry32) so a run is repeatable. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function qLearning(input: QLearnInput): QFrame[] {
  const g = input;
  const h = gridHelpers(g);
  if (input.episodes < 1 || input.episodes > 2000) throw new Error("episodes must be between 1 and 2000");
  const rand = rng(input.seed ?? 42);
  const Q = Array.from({ length: g.rows }, () => Array.from({ length: g.cols }, () => [0, 0, 0, 0]));
  const start = g.start ?? [g.rows - 1, 0];
  const frames: QFrame[] = [];
  const every = Math.max(1, Math.ceil(input.episodes / 100)); // keep at most ~100 snapshots
  const greedy = (r: number, c: number) => Q[r]![c]!.reduce((bi, q, i, arr) => (q > arr[bi]! ? i : bi), 0);
  const snapshot = (): QFrame["Q"] => Q.map((row) => row.map((q) => [...q]));
  const policy = () =>
    Q.map((row, r) => row.map((q, c) => (h.walls.has(h.key(r, c)) || h.terminal.has(h.key(r, c)) || q.every((v) => v === 0) ? null : ACTIONS[greedy(r, c)]!)));
  for (let ep = 1; ep <= input.episodes; ep++) {
    let [r, c] = start;
    let ret = 0;
    let steps = 0;
    while (!h.terminal.has(h.key(r, c)) && steps < (input.maxSteps ?? 200)) {
      const ai = rand() < input.epsilon ? Math.floor(rand() * 4) : greedy(r, c);
      const outs = h.outcomes(r, c, ACTIONS[ai]!);
      let pick = rand();
      const to = (outs.find((o) => (pick -= o.p) < 0) ?? outs[0]!).to;
      const rew = h.reward(to);
      const target = h.terminal.has(h.key(to[0], to[1])) ? rew : rew + g.gamma * Math.max(...Q[to[0]]![to[1]]!);
      Q[r]![c]![ai] = Q[r]![c]![ai]! + input.alpha * (target - Q[r]![c]![ai]!);
      ret += rew;
      [r, c] = to;
      steps++;
    }
    if (ep % every === 0 || ep === 1 || ep === input.episodes) frames.push({ episode: ep, Q: snapshot(), policy: policy(), return: ret, steps });
  }
  return frames;
}
