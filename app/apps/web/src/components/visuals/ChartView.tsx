/** Chart: line, bar (grouped; negatives below zero, e.g. cash flow) or scatter, with annotations. */
import type { Visual } from "../../lib/api.ts";
import { Fit } from "../SystemMap.tsx";
import { ACCENT, type Fx, PALETTE, fmtNum, halo, niceTicks, trunc } from "./shared.ts";

type V = Extract<Visual, { type: "chart" }>;

const W = 620;
const H = 320;
const L = 60;
const R = 20;
const T = 24;
const B = 44;

export function ChartView({ v, fx }: { v: V; fx: Fx }) {
  const { kind, series, annotations } = v.data;
  const pts = series.flatMap((s) => s.points);
  const xs = [...pts.map((p) => p[0]), ...annotations.map((a) => a.x)];
  const ys = [...pts.map((p) => p[1]), ...annotations.flatMap((a) => (a.y === undefined ? [] : [a.y]))];
  if (kind === "bar") ys.push(0);
  const xUnique = [...new Set(pts.map((p) => p[0]))].sort((a, b) => a - b);
  let [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  if (kind === "bar") {
    const gap = xUnique.length > 1 ? Math.min(...xUnique.slice(1).map((x, i) => x - xUnique[i]!)) : 1;
    x0 -= gap / 2;
    x1 += gap / 2;
  }
  if (x0 === x1) [x0, x1] = [x0 - 1, x1 + 1];
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  if (y0 === y1) [y0, y1] = [y0 - 1, y1 + 1];
  const yt = niceTicks(y0, y1);
  // close the axis on round numbers: one more tick below/above when the data goes past the last one
  const ystep = yt.length > 1 ? yt[1]! - yt[0]! : 1;
  if (yt[0]! > y0) yt.unshift(Number((yt[0]! - ystep).toFixed(10)));
  if (yt[yt.length - 1]! < y1) yt.push(Number((yt[yt.length - 1]! + ystep).toFixed(10)));
  y0 = Math.min(y0, yt[0]!);
  y1 = Math.max(y1, yt[yt.length - 1]!);
  const pw = W - L - R;
  const ph = H - T - B;
  const sx = (x: number) => L + ((x - x0) / (x1 - x0)) * pw;
  const sy = (y: number) => T + ph - ((y - y0) / (y1 - y0)) * ph;
  const xt = kind === "bar" && xUnique.length <= 16 ? xUnique : niceTicks(x0, x1, 6);
  const barSlot = kind === "bar" ? (pw / Math.max(1, xUnique.length)) * 0.7 : 0;
  const barW = barSlot / series.length;
  const color = (i: number, id: string) => (fx.lit(id) ? ACCENT : PALETTE[i % PALETTE.length]!);

  return (
    <Fit width={W} height={H + (series.length > 1 ? 20 : 0)}>
      <svg width={W} height={H + (series.length > 1 ? 20 : 0)} viewBox={`0 0 ${W} ${H + (series.length > 1 ? 20 : 0)}`} role="img" aria-label={v.title} className="absolute inset-0">
        {yt.map((y) => (
          <g key={`y${y}`}>
            <line x1={L} y1={sy(y)} x2={W - R} y2={sy(y)} stroke="#94a3b8" strokeOpacity={y === 0 ? 0.5 : 0.15} />
            <text x={L - 8} y={sy(y) + 4} textAnchor="end" className="fill-slate-500 text-[10.5px] tabular-nums">
              {fmtNum(y)}
            </text>
          </g>
        ))}
        {xt.map((x) => (
          <text key={`x${x}`} x={sx(x)} y={T + ph + 16} textAnchor="middle" className="fill-slate-500 text-[10.5px] tabular-nums">
            {fmtNum(x)}
          </text>
        ))}
        <text x={L + pw / 2} y={H - 6} textAnchor="middle" className="fill-slate-500 text-[11px] font-semibold">
          {v.data.x.label}
        </text>
        <text x={14} y={T + ph / 2} textAnchor="middle" transform={`rotate(-90 14 ${T + ph / 2})`} className="fill-slate-500 text-[11px] font-semibold">
          {v.data.y.label}
        </text>

        {series.map((s, i) => {
          const c = color(i, s.id);
          const sorted = [...s.points].sort((a, b) => a[0] - b[0]);
          return (
            <g key={s.id} className={fx.cls(s.id)}>
              <title>{s.label}</title>
              {kind === "line" && <polyline points={sorted.map(([x, y]) => `${sx(x)},${sy(y)}`).join(" ")} fill="none" stroke={c} strokeWidth={2.2} strokeLinejoin="round" />}
              {kind !== "bar" &&
                s.points.map(([x, y], j) => <circle key={j} cx={sx(x)} cy={sy(y)} r={kind === "scatter" ? 4 : 3.2} fill={c} fillOpacity={kind === "scatter" ? 0.75 : 1} />)}
              {kind === "bar" &&
                s.points.map(([x, y], j) => {
                  const top = sy(Math.max(0, y));
                  const h = Math.max(1, Math.abs(sy(y) - sy(0)));
                  return <rect key={j} x={sx(x) - barSlot / 2 + i * barW} y={top} width={Math.max(2, barW - 2)} height={h} rx={2} fill={y < 0 ? "#fb7185" : c} fillOpacity={0.85} />;
                })}
            </g>
          );
        })}

        {annotations.map((a) => (
          <g key={a.id} className={fx.cls(a.id)}>
            {a.y === undefined ? (
              <line x1={sx(a.x)} y1={T} x2={sx(a.x)} y2={T + ph} stroke={fx.lit(a.id) ? ACCENT : "#fbbf24"} strokeWidth={1.5} strokeDasharray="4 4" />
            ) : (
              <circle cx={sx(a.x)} cy={sy(a.y)} r={8} fill="none" stroke={fx.lit(a.id) ? ACCENT : "#fbbf24"} strokeWidth={2} />
            )}
            <text x={sx(a.x) + 10} y={(a.y === undefined ? T + 12 : sy(a.y)) - 10} className="fill-amber-500 text-[11px] font-semibold" {...halo}>
              {a.label}
            </text>
          </g>
        ))}

        {series.length > 1 &&
          series.map((s, i) => (
            <g key={`lg-${s.id}`} transform={`translate(${L + i * 110},${H + 6})`} className={fx.cls(s.id)}>
              <rect width={10} height={10} rx={2} fill={color(i, s.id)} />
              <text x={14} y={9} className="fill-slate-600 text-[10.5px] dark:fill-slate-300">
                {trunc(s.label, 14)}
              </text>
            </g>
          ))}
      </svg>
    </Fit>
  );
}
