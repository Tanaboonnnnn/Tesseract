/**
 * Lesson `sim` blocks: the app runs the real algorithm (engines in @tesseract/core/pure) from the AI's inputs and
 * shows every step's state. Inputs can be changed live (K, algorithm, quantum, learning rate…).
 * Nothing runs at rest: autoplay is a timer that stops at the end or when the page is hidden.
 */
import { type Action, gradientDescent, kmeans, qLearning, type SchedAlgo, schedule, valueIteration } from "@tesseract/core/pure";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { PlotData } from "../../lib/api.ts";
import { cn } from "../../lib/format.ts";
import { Plot } from "./Plot.tsx";
import { fmtNum, PALETTE } from "./shared.ts";

/* ---------- shared step bar ---------- */

function useSteps(count: number, resetKey: unknown) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    setI(0);
    setPlaying(false);
  }, [resetKey]);
  useEffect(() => {
    if (!playing) return;
    if (i >= count - 1) return setPlaying(false);
    const t = setTimeout(() => (document.hidden ? setPlaying(false) : setI((v) => v + 1)), 750);
    return () => clearTimeout(t);
  }, [playing, i, count]);
  return { i: Math.min(i, Math.max(0, count - 1)), setI, playing, setPlaying };
}

function StepBar({ s, count, label }: { s: ReturnType<typeof useSteps>; count: number; label: ReactNode }) {
  const btn = "grid size-8 place-items-center rounded-lg ring-1 ring-[var(--line)] hover:text-accent-600 disabled:opacity-35 dark:hover:text-sky-300";
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button className={btn} aria-label="Previous step" disabled={s.i === 0} onClick={() => s.setI(s.i - 1)}>
        <ChevronLeft size={16} />
      </button>
      <button className={btn} aria-label={s.playing ? "Pause" : "Play"} onClick={() => (s.i >= count - 1 ? (s.setI(0), s.setPlaying(true)) : s.setPlaying(!s.playing))}>
        {s.playing ? <Pause size={15} /> : s.i >= count - 1 ? <RotateCcw size={15} /> : <Play size={15} />}
      </button>
      <button className={btn} aria-label="Next step" disabled={s.i >= count - 1} onClick={() => s.setI(s.i + 1)}>
        <ChevronRight size={16} />
      </button>
      <input type="range" min={0} max={Math.max(0, count - 1)} value={s.i} onChange={(e) => s.setI(Number(e.target.value))} className="w-32 accent-sky-500" aria-label="Step" />
      <span className="text-xs text-slate-500 tabular-nums">
        {s.i + 1}/{count}
      </span>
      <span className="min-w-0 flex-1 text-sm">{label}</span>
    </div>
  );
}

const Control = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="flex items-center gap-2 text-xs text-slate-500">
    {label}
    {children}
  </label>
);
const select = "rounded-md bg-[var(--panel-solid)] px-2 py-1 text-sm text-inherit ring-1 ring-[var(--line)]";

const State = ({ items }: { items: [string, ReactNode][] }) => (
  <div className="flex flex-wrap gap-2">
    {items.map(([k, v]) => (
      <span key={k} className="rounded-md bg-[var(--lane)] px-2 py-1 text-xs ring-1 ring-[var(--line)]">
        <span className="text-slate-500">{k}</span> <span className="font-semibold tabular-nums">{v}</span>
      </span>
    ))}
  </div>
);

/* ---------- k-means ---------- */

function KMeansSim({ input }: { input: { points: [number, number][]; k: number; init?: [number, number][]; maxIter?: number } }) {
  const [k, setK] = useState(input.k);
  const frames = useMemo(() => kmeans({ ...input, k, init: k === input.k ? input.init : undefined }), [input, k]);
  const s = useSteps(frames.length, k);
  const f = frames[s.i]!;
  const xs = input.points.map((p) => p[0]);
  const ys = input.points.map((p) => p[1]);
  const pad = (a: number[]) => {
    const lo = Math.min(...a);
    const hi = Math.max(...a);
    const p = (hi - lo || 1) * 0.12;
    return [lo - p, hi + p];
  };
  const [x0, x1] = pad(xs);
  const [y0, y1] = pad(ys);
  const data: PlotData = {
    x: { label: "x", min: x0!, max: x1! },
    y: { label: "y", min: y0!, max: y1! },
    params: [],
    traces: [
      { id: "points", kind: "scatter", points: input.points, groups: f.labels.map((l) => (l < 0 ? 7 : l)), label: "points" },
      { id: "centroids", kind: "scatter", points: f.centroids, groups: f.centroids.map((_, j) => j), size: 9, labels: f.centroids.map((_, j) => `c${j + 1}`), label: "centroids" },
    ],
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4">
        <Control label="K">
          <select className={select} value={k} onChange={(e) => setK(Number(e.target.value))}>
            {Array.from({ length: Math.min(8, input.points.length) }, (_, i) => i + 1).map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </Control>
      </div>
      <Plot data={data} />
      <State items={[["iteration", f.iter], ["phase", f.phase], ["SSE", f.sse === null ? "–" : fmtNum(Number(f.sse.toFixed(3)))]]} />
      <StepBar s={s} count={frames.length} label={f.note} />
    </div>
  );
}

/* ---------- CPU scheduling ---------- */

const ALGOS: [SchedAlgo, string][] = [
  ["fcfs", "FCFS"],
  ["sjf", "SJF"],
  ["srtf", "SRTF"],
  ["rr", "Round Robin"],
  ["priority", "Priority"],
  ["priority-preemptive", "Priority (preemptive)"],
];

function SchedulingSim({ input }: { input: { processes: { id: string; arrival: number; burst: number; priority?: number }[]; algorithm: SchedAlgo; quantum?: number } }) {
  const [algorithm, setAlgorithm] = useState<SchedAlgo>(input.algorithm);
  const [quantum, setQuantum] = useState(input.quantum ?? 2);
  const r = useMemo(() => schedule({ processes: input.processes, algorithm, quantum }), [input, algorithm, quantum]);
  const s = useSteps(r.frames.length, `${algorithm}-${quantum}`);
  const f = r.frames[s.i]!;
  const end = r.gantt[r.gantt.length - 1]!.end;
  const color = (id: string) => (id === "idle" ? "#94a3b8" : PALETTE[input.processes.findIndex((p) => p.id === id) % PALETTE.length]!);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4">
        <Control label="Algorithm">
          <select className={select} value={algorithm} onChange={(e) => setAlgorithm(e.target.value as SchedAlgo)}>
            {ALGOS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Control>
        {algorithm === "rr" && (
          <Control label={`Quantum ${quantum}`}>
            <input type="range" min={1} max={8} value={quantum} onChange={(e) => setQuantum(Number(e.target.value))} className="w-28 accent-sky-500" />
          </Control>
        )}
      </div>
      {/* Gantt, filled up to the current time */}
      <div>
        <div className="relative flex h-9 overflow-hidden rounded-md ring-1 ring-[var(--line)]">
          {r.gantt.map((g, j) => (
            <div
              key={j}
              className="grid place-items-center border-r border-[var(--panel-solid)] text-xs font-semibold text-slate-900 transition-opacity"
              style={{ width: `${((g.end - g.start) / end) * 100}%`, background: color(g.id), opacity: g.start < f.time ? (g.id === "idle" ? 0.35 : 0.9) : 0.12 }}
              title={`${g.id}: ${g.start}–${g.end}`}
            >
              {g.end - g.start >= end / 30 ? g.id : ""}
            </div>
          ))}
          <div className="absolute inset-y-0 w-0.5 bg-[var(--color-sky-400)]" style={{ left: `${(f.time / end) * 100}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-slate-500 tabular-nums">
          <span>0</span>
          <span>t = {f.time}</span>
          <span>{end}</span>
        </div>
      </div>
      <State
        items={[
          ["running", f.running ?? "–"],
          ["ready queue", f.ready.length ? f.ready.join(" ← ") : "empty"],
          ["done", f.done.length ? f.done.join(", ") : "–"],
          ["remaining", Object.entries(f.remaining).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(" ") || "–"],
        ]}
      />
      <StepBar s={s} count={r.frames.length} label={f.note} />
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead className="text-slate-500">
            <tr>
              {["Process", "Arrival", "Burst", "Completion", "Turnaround", "Waiting", "Response"].map((h) => (
                <th key={h} className="px-2 py-1 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.stats.map((st) => {
              const p = input.processes.find((x) => x.id === st.id)!;
              return (
                <tr key={st.id} className="border-t border-[var(--line)]">
                  <td className="px-2 py-1 font-semibold" style={{ color: color(st.id) }}>
                    {st.id}
                  </td>
                  <td className="px-2 py-1">{p.arrival}</td>
                  <td className="px-2 py-1">{p.burst}</td>
                  <td className="px-2 py-1">{st.completion}</td>
                  <td className="px-2 py-1">{st.turnaround}</td>
                  <td className="px-2 py-1">{st.waiting}</td>
                  <td className="px-2 py-1">{st.response}</td>
                </tr>
              );
            })}
            <tr className="border-t border-[var(--line-strong)] font-semibold">
              <td className="px-2 py-1" colSpan={4}>
                Average
              </td>
              <td className="px-2 py-1">{fmtNum(Number(r.avg.turnaround.toFixed(2)))}</td>
              <td className="px-2 py-1">{fmtNum(Number(r.avg.waiting.toFixed(2)))}</td>
              <td className="px-2 py-1">{fmtNum(Number(r.avg.response.toFixed(2)))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- gradient descent ---------- */

function GradientSim({ input }: { input: { f: string; x0: number; lr: number; steps?: number } }) {
  const [lr, setLr] = useState(input.lr);
  const res = useMemo(() => gradientDescent({ ...input, lr }), [input, lr]);
  const s = useSteps(res.frames.length, lr);
  const f = res.frames[s.i]!;
  const xs = res.frames.slice(0, Math.min(res.frames.length, 60)).map((p) => p.x).filter(Number.isFinite);
  const lo = Math.min(...xs, input.x0);
  const hi = Math.max(...xs, input.x0);
  const span = Math.max(hi - lo, 2);
  const shown = res.frames.slice(0, s.i + 1).filter((p) => Number.isFinite(p.fx) && Math.abs(p.x) < 1e6);
  const data: PlotData = {
    x: { label: "x", min: lo - span * 0.3, max: hi + span * 0.3 },
    y: { label: "f(x)" },
    params: [],
    traces: [
      { id: "f", kind: "function", expr: input.f, label: `f(x) = ${input.f}` },
      ...(shown.length > 1 ? [{ id: "path", kind: "line" as const, points: shown.map((p) => [p.x, p.fx] as [number, number]), label: "steps", dash: true }] : []),
      { id: "now", kind: "scatter" as const, points: [[f.x, f.fx] as [number, number]], size: 7, label: "current x", color: "#fbbf24" },
    ],
  };
  return (
    <div className="space-y-3">
      <Control label={`Learning rate ${fmtNum(lr)}`}>
        <input type="range" min={0.001} max={Math.max(1.5, input.lr * 3)} step={0.001} value={lr} onChange={(e) => setLr(Number(e.target.value))} className="w-48 accent-sky-500" />
      </Control>
      <Plot data={data} />
      <State items={[["step", f.i], ["x", fmtNum(Number(f.x.toPrecision(6)))], ["f(x)", fmtNum(Number(f.fx.toPrecision(6)))], ["f′(x)", fmtNum(Number(f.grad.toPrecision(6)))]]} />
      {res.diverged && <p className="text-sm font-semibold text-rose-500">Diverged: this learning rate overshoots and x blows up.</p>}
      <StepBar s={s} count={res.frames.length} label={<span className="text-xs text-slate-500">x ← x − η · f′(x)</span>} />
    </div>
  );
}

/* ---------- grid worlds (value iteration / Q-learning) ---------- */

const ARROW: Record<Action, string> = { up: "↑", right: "→", down: "↓", left: "←" };

type Grid = { rows: number; cols: number; walls?: [number, number][]; terminals: { cell: [number, number]; reward: number }[]; start?: [number, number] };

function GridView({ g, values, policy }: { g: Grid; values: number[][]; policy: (Action | null)[][] }) {
  const flat = values.flat();
  const hi = Math.max(...flat.map(Math.abs), 1e-9);
  return (
    <div className="inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${g.cols}, minmax(52px, 72px))` }}>
      {Array.from({ length: g.rows }, (_, r) =>
        Array.from({ length: g.cols }, (_, c) => {
          const wall = g.walls?.some(([a, b]) => a === r && b === c);
          const term = g.terminals.find((t) => t.cell[0] === r && t.cell[1] === c);
          const v = values[r]?.[c] ?? 0;
          const bg = wall ? "#1e293b" : term ? (term.reward >= 0 ? "rgb(52 211 153 / 0.35)" : "rgb(251 113 133 / 0.35)") : v >= 0 ? `rgb(56 189 248 / ${0.08 + 0.5 * (v / hi)})` : `rgb(251 113 133 / ${0.08 + 0.5 * (-v / hi)})`;
          const start = g.start && g.start[0] === r && g.start[1] === c;
          return (
            <div key={`${r},${c}`} className="grid aspect-square place-items-center rounded-md text-center ring-1 ring-[var(--line)]" style={{ background: bg }}>
              {wall ? null : term ? (
                <span className="text-sm font-bold">{fmtNum(term.reward)}</span>
              ) : (
                <span className="leading-tight">
                  <span className="block text-lg">{policy[r]?.[c] ? ARROW[policy[r]![c]!] : "·"}</span>
                  <span className="block text-[10px] tabular-nums">{fmtNum(Number(v.toFixed(2)))}</span>
                  {start && <span className="block text-[9px] text-slate-500">start</span>}
                </span>
              )}
            </div>
          );
        }),
      )}
    </div>
  );
}

function ValueIterationSim({ input }: { input: Grid & { gamma: number; noise?: number; stepReward?: number } }) {
  const [gamma, setGamma] = useState(input.gamma);
  const frames = useMemo(() => valueIteration({ ...input, gamma }), [input, gamma]);
  const s = useSteps(frames.length, gamma);
  const f = frames[s.i]!;
  return (
    <div className="space-y-3">
      <Control label={`γ (discount) ${fmtNum(gamma)}`}>
        <input type="range" min={0} max={0.99} step={0.01} value={gamma} onChange={(e) => setGamma(Number(e.target.value))} className="w-40 accent-sky-500" />
      </Control>
      <div className="overflow-x-auto">
        <GridView g={input} values={f.V} policy={f.policy} />
      </div>
      <State items={[["sweep", f.sweep], ["max change Δ", f.delta === Infinity ? "–" : fmtNum(Number(f.delta.toPrecision(3)))]]} />
      <StepBar s={s} count={frames.length} label={<span className="text-xs text-slate-500">V(s) ← maxₐ Σ p(s′|s,a)[r + γV(s′)]</span>} />
    </div>
  );
}

function QLearningSim({ input }: { input: Grid & { gamma: number; alpha: number; epsilon: number; episodes: number; seed?: number; noise?: number; stepReward?: number; maxSteps?: number } }) {
  const [epsilon, setEpsilon] = useState(input.epsilon);
  const frames = useMemo(() => qLearning({ ...input, epsilon }), [input, epsilon]);
  const s = useSteps(frames.length, epsilon);
  const f = frames[s.i]!;
  const values = f.Q.map((row) => row.map((q) => Math.max(...q)));
  const returns: PlotData = {
    x: { label: "episode" },
    y: { label: "return" },
    params: [],
    traces: [{ id: "ret", kind: "line", points: frames.slice(0, s.i + 1).map((fr) => [fr.episode, fr.return] as [number, number]).concat(s.i === 0 ? [[f.episode + 1, f.return]] : []), label: "return per episode" }],
  };
  return (
    <div className="space-y-3">
      <Control label={`ε (explore) ${fmtNum(epsilon)}`}>
        <input type="range" min={0} max={1} step={0.05} value={epsilon} onChange={(e) => setEpsilon(Number(e.target.value))} className="w-40 accent-sky-500" />
      </Control>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto">
          <GridView g={input} values={values} policy={f.policy} />
        </div>
        <Plot data={returns} />
      </div>
      <State items={[["episode", f.episode], ["steps", f.steps], ["return", fmtNum(Number(f.return.toFixed(2)))]]} />
      <StepBar s={s} count={frames.length} label={<span className="text-xs text-slate-500">Q(s,a) ← Q + α[r + γ·maxQ(s′) − Q]</span>} />
    </div>
  );
}

/* ---------- dispatcher ---------- */

export function Sim({ sim, input }: { sim: string; input: Record<string, unknown> }) {
  try {
    switch (sim) {
      case "kmeans":
        return <KMeansSim input={input as never} />;
      case "scheduling":
        return <SchedulingSim input={input as never} />;
      case "gradient":
        return <GradientSim input={input as never} />;
      case "value-iteration":
        return <ValueIterationSim input={input as never} />;
      case "q-learning":
        return <QLearningSim input={input as never} />;
    }
  } catch (e) {
    return <p className={cn("text-sm text-rose-500")}>Simulation error: {(e as Error).message}</p>;
  }
  return <p className="text-sm text-slate-500">Unknown simulation “{sim}”.</p>;
}
