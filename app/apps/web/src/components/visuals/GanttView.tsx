/** Gantt / timeline: bars on lanes over time, digital signals as square waves, markers as dashed lines. */
import type { Visual } from "../../lib/api.ts";
import { Fit } from "../SystemMap.tsx";
import { ACCENT, type Fx, PALETTE, fmtNum, halo, niceTicks, trunc } from "./shared.ts";

type V = Extract<Visual, { type: "gantt" }>;

const LEFT = 90;
const RIGHT = 24;
const TOP = 34;
const LANE = 34;
const SIGNAL = 40;
const AXIS = 30;

export function GanttView({ v, fx }: { v: V; fx: Fx }) {
  const { lanes, bars, signals, markers, unit } = v.data;
  const times = [...bars.flatMap((b) => [b.start, b.end]), ...signals.flatMap((s) => s.changes.map((c) => c[0])), ...markers.map((m) => m.at)];
  const t0 = Math.min(...times);
  const t1 = Math.max(...times, t0 + 1);
  const plot = Math.max(480, Math.min(900, (t1 - t0) * 40));
  const width = LEFT + plot + RIGHT;
  const x = (t: number) => LEFT + ((t - t0) / (t1 - t0)) * plot;
  const rowsH = lanes.length * LANE + signals.length * SIGNAL;
  const height = TOP + rowsH + AXIS;
  const laneIdx = new Map(lanes.map((l, i) => [l.id, i]));
  const ticks = niceTicks(t0, t1, Math.min(10, Math.round(plot / 70)));

  return (
    <Fit width={width} height={height}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={v.title} className="absolute inset-0">
        {/* grid */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} y1={TOP - 6} x2={x(t)} y2={TOP + rowsH} stroke="#94a3b8" strokeOpacity={0.15} />
            <text x={x(t)} y={TOP + rowsH + 16} textAnchor="middle" className="fill-slate-500 text-[10.5px] tabular-nums">
              {fmtNum(t)}
            </text>
          </g>
        ))}
        {unit && (
          <text x={LEFT + plot} y={TOP + rowsH + 28} textAnchor="end" className="fill-slate-400 text-[10px]">
            {unit}
          </text>
        )}

        {/* lanes */}
        {lanes.map((l, i) => (
          <g key={l.id} className={fx.cls(l.id)}>
            <rect x={LEFT} y={TOP + i * LANE + 3} width={plot} height={LANE - 6} rx={4} fill="#94a3b8" fillOpacity={0.06} />
            <text x={LEFT - 10} y={TOP + i * LANE + LANE / 2 + 4} textAnchor="end" className="fill-slate-700 text-[11.5px] font-semibold dark:fill-slate-200">
              {trunc(l.label, 12)}
            </text>
          </g>
        ))}
        {bars.map((b) => {
          const i = laneIdx.get(b.lane)!;
          const color = fx.lit(b.id) ? ACCENT : PALETTE[i % PALETTE.length]!;
          const bx = x(b.start);
          const bw = Math.max(2, x(b.end) - bx);
          return (
            <g key={b.id} className={fx.cls(b.id)}>
              <title>{`${b.label ?? lanes[i]!.label}: ${fmtNum(b.start)}–${fmtNum(b.end)}${unit ? ` ${unit}` : ""}`}</title>
              <rect x={bx} y={TOP + i * LANE + 6} width={bw} height={LANE - 12} rx={4} fill={color} fillOpacity={0.85} />
              {b.label && bw > b.label.length * 6 + 8 && (
                <text x={bx + bw / 2} y={TOP + i * LANE + LANE / 2 + 4} textAnchor="middle" className="fill-slate-900 text-[10.5px] font-semibold">
                  {b.label}
                </text>
              )}
            </g>
          );
        })}

        {/* signals: square waves */}
        {signals.map((s, k) => {
          const top = TOP + lanes.length * LANE + k * SIGNAL;
          const hi = top + 8;
          const lo = top + SIGNAL - 8;
          const pts: string[] = [];
          s.changes.forEach(([t, val], j) => {
            const y = val ? hi : lo;
            if (j > 0) pts.push(`${x(t)},${s.changes[j - 1]![1] ? hi : lo}`);
            pts.push(`${x(t)},${y}`);
          });
          const lastVal = s.changes[s.changes.length - 1]![1];
          pts.push(`${x(t1)},${lastVal ? hi : lo}`);
          return (
            <g key={s.id} className={fx.cls(s.id)}>
              <text x={LEFT - 10} y={top + SIGNAL / 2 + 4} textAnchor="end" className="fill-slate-700 font-mono text-[11px] font-semibold dark:fill-slate-200">
                {trunc(s.label, 12)}
              </text>
              <polyline points={pts.join(" ")} fill="none" stroke={fx.lit(s.id) ? ACCENT : "#34d399"} strokeWidth={2} strokeLinejoin="round" />
            </g>
          );
        })}

        {markers.map((m) => (
          <g key={m.id} className={fx.cls(m.id)}>
            <line x1={x(m.at)} y1={TOP - 10} x2={x(m.at)} y2={TOP + rowsH} stroke={fx.lit(m.id) ? ACCENT : "#fb7185"} strokeWidth={1.5} strokeDasharray="4 4" />
            <text x={x(m.at)} y={TOP - 14} textAnchor="middle" className="fill-rose-500 text-[10.5px] font-semibold" {...halo}>
              {m.label}
            </text>
          </g>
        ))}
      </svg>
    </Fit>
  );
}
