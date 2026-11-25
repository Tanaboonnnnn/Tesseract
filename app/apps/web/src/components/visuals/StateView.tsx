/** State machine: states in columns by distance from the initial state, curved transitions, self-loops. */
import type { Visual } from "../../lib/api.ts";
import { Fit } from "../SystemMap.tsx";
import { ACCENT, type Fx, halo, trunc } from "./shared.ts";

type V = Extract<Visual, { type: "state" }>;
type P = { x: number; y: number };

const R = 28;
const COL = 170;
const ROW = 120;
const PAD = 40;
const TOP = 60; // room for self-loops

export function StateView({ v, fx, step }: { v: V; fx: Fx; step: number }) {
  const { states, transitions } = v.data;

  // Level = BFS distance from the initial state (or the first state). Unreached states go last.
  const start = states.find((s) => s.initial) ?? states[0]!;
  const level = new Map<string, number>([[start.id, 0]]);
  const queue = [start.id];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const t of transitions) {
      if (t.from === cur && !level.has(t.to)) {
        level.set(t.to, level.get(cur)! + 1);
        queue.push(t.to);
      }
    }
  }
  let last = Math.max(...level.values());
  for (const s of states) if (!level.has(s.id)) level.set(s.id, ++last);
  const cols = new Map<number, string[]>();
  for (const s of states) cols.set(level.get(s.id)!, [...(cols.get(level.get(s.id)!) ?? []), s.id]);
  const tallest = Math.max(...[...cols.values()].map((c) => c.length));
  const pos = new Map<string, P>();
  for (const [lv, ids] of cols) {
    const offset = ((tallest - ids.length) * ROW) / 2;
    ids.forEach((id, i) => pos.set(id, { x: PAD + R + 30 + lv * COL, y: TOP + R + offset + i * ROW }));
  }
  const width = PAD * 2 + R * 2 + 30 + (cols.size - 1) * COL + 20;
  const height = TOP + tallest * ROW - (ROW - R * 2) + PAD;

  const has = (a: string, b: string) => transitions.some((t) => t.from === a && t.to === b);

  return (
    <Fit width={width} height={height}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={v.title} className="absolute inset-0">
        {transitions.map((t) => {
          const a = pos.get(t.from)!;
          const b = pos.get(t.to)!;
          const color = fx.lit(t.id) ? ACCENT : "#94a3b8";
          if (t.from === t.to) {
            const d = `M ${a.x - 12} ${a.y - R + 3} C ${a.x - 34} ${a.y - R - 44}, ${a.x + 34} ${a.y - R - 44}, ${a.x + 12} ${a.y - R + 3}`;
            return (
              <g key={t.id} className={fx.cls(t.id)}>
                <path d={d} fill="none" stroke={color} strokeWidth={1.8} />
                {fx.lit(t.id) && <FlowDot key={step} path={d} />}
                <Arrow at={{ x: a.x + 12, y: a.y - R + 3 }} from={{ x: a.x + 30, y: a.y - R - 30 }} color={color} />
                <text x={a.x} y={a.y - R - 38} textAnchor="middle" className="fill-slate-600 text-[12px] font-semibold dark:fill-slate-300" {...halo}>
                  {t.label}
                </text>
              </g>
            );
          }
          // Bend: both directions exist → curve apart; long jumps or same column → bend around other states.
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const n = { x: -dy / len, y: dx / len };
          const sameCol = Math.abs(dx) < 1;
          const bend = has(t.to, t.from) ? 34 : sameCol || Math.abs(dx) > COL * 1.5 ? 46 : 0;
          const c = { x: (a.x + b.x) / 2 + n.x * bend * 2, y: (a.y + b.y) / 2 + n.y * bend * 2 };
          const toward = (p: P, q: P, r: number) => {
            const l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
            return { x: p.x + ((q.x - p.x) / l) * r, y: p.y + ((q.y - p.y) / l) * r };
          };
          const p0 = toward(a, c, R);
          const p2 = toward(b, c, R + 1);
          const mid = { x: 0.25 * p0.x + 0.5 * c.x + 0.25 * p2.x, y: 0.25 * p0.y + 0.5 * c.y + 0.25 * p2.y };
          const d = `M ${p0.x} ${p0.y} Q ${c.x} ${c.y} ${p2.x} ${p2.y}`;
          return (
            <g key={t.id} className={fx.cls(t.id)}>
              <path d={d} fill="none" stroke={color} strokeWidth={1.8} />
              {fx.lit(t.id) && <FlowDot key={step} path={d} />}
              <Arrow at={p2} from={c} color={color} />
              {t.label && (
                <text x={mid.x} y={mid.y - 6} textAnchor="middle" className="fill-slate-600 text-[12px] font-semibold dark:fill-slate-300" {...halo}>
                  {t.label}
                </text>
              )}
            </g>
          );
        })}

        {states.map((s) => {
          const p = pos.get(s.id)!;
          const lit = fx.lit(s.id);
          const color = lit ? ACCENT : s.accept ? "#34d399" : "#64748b";
          return (
            <g key={s.id} className={fx.cls(s.id)}>
              <title>{s.label}</title>
              {s.initial && (
                <g>
                  <line x1={p.x - R - 34} y1={p.y} x2={p.x - R - 4} y2={p.y} stroke="#94a3b8" strokeWidth={1.8} />
                  <Arrow at={{ x: p.x - R - 1, y: p.y }} from={{ x: p.x - R - 30, y: p.y }} color="#94a3b8" />
                </g>
              )}
              <circle cx={p.x} cy={p.y} r={R} stroke={color} strokeWidth={lit ? 2.6 : 1.8} className="fill-[var(--panel-solid)]" />
              {s.accept && <circle cx={p.x} cy={p.y} r={R - 5} fill="none" stroke={color} strokeWidth={1.2} />}
              <text x={p.x} y={s.output !== undefined ? p.y - 2 : p.y + 4} textAnchor="middle" className="fill-slate-800 font-display text-[12px] font-bold dark:fill-slate-100">
                {trunc(s.label, 8)}
              </text>
              {s.output !== undefined && (
                <text x={p.x} y={p.y + 13} textAnchor="middle" className="fill-slate-500 text-[11px]">
                  /{s.output}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </Fit>
  );
}

function FlowDot({ path }: { path: string }) {
  return <circle aria-hidden="true" className="vis-flow-dot" r={4} fill={ACCENT} style={{ offsetPath: `path("${path}")` }} />;
}

export function Arrow({ at, from, color }: { at: P; from: P; color: string }) {
  const a = Math.atan2(at.y - from.y, at.x - from.x);
  const s = 8;
  const pts = [
    [at.x, at.y],
    [at.x - s * Math.cos(a - 0.4), at.y - s * Math.sin(a - 0.4)],
    [at.x - s * Math.cos(a + 0.4), at.y - s * Math.sin(a + 0.4)],
  ];
  return <polygon points={pts.map((p) => p.join(",")).join(" ")} fill={color} />;
}
