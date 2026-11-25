/** Grid: truth tables, K-maps (groups drawn as loops), comparison tables. Cell ids are r<row>c<col>. */
import type { Visual } from "../../lib/api.ts";
import { Fit } from "../SystemMap.tsx";
import { ACCENT, type Fx, PALETTE, halo, trunc } from "./shared.ts";

type V = Extract<Visual, { type: "grid" }>;

const CH = 34;
const PAD = 12;
const LABEL_ROOM = 36; // right side: group labels sit just outside their loop

const textW = (s: string) => s.length * 7 + 20;

export function GridView({ v, fx }: { v: V; fx: Fx }) {
  const { columns, rows, groups } = v.data;
  const hasRowLabels = rows.some((r) => r.label);
  const rowHead = hasRowLabels ? Math.min(140, Math.max(48, ...rows.map((r) => textW(r.label ?? "")))) : 0;
  const colW = columns.map((c, j) => Math.min(160, Math.max(48, textW(c), ...rows.map((r) => textW(String(r.cells[j] ?? ""))))));
  const colX = colW.map((_, j) => PAD + rowHead + colW.slice(0, j).reduce((a, b) => a + b, 0));
  const width = PAD * 2 + rowHead + colW.reduce((a, b) => a + b, 0) + (groups.some((g) => g.label) ? LABEL_ROOM : 0);
  const height = PAD * 2 + CH * (rows.length + 1);
  const cellRect = (r: number, c: number) => ({ x: colX[c]!, y: PAD + CH * (r + 1), w: colW[c]!, h: CH });

  return (
    <Fit width={width} height={height}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={v.title} className="absolute inset-0">
        {columns.map((c, j) => (
          <text key={`h${j}`} x={colX[j]! + colW[j]! / 2} y={PAD + CH / 2 + 4} textAnchor="middle" className="fill-slate-500 font-display text-[11px] font-semibold tracking-wider uppercase">
            {trunc(c, 20)}
          </text>
        ))}
        {rows.map((row, i) => (
          <g key={`r${i}`}>
            {row.label && (
              <text x={PAD + rowHead - 10} y={PAD + CH * (i + 1) + CH / 2 + 4} textAnchor="end" className="fill-slate-500 font-display text-[11px] font-semibold tracking-wider uppercase">
                {trunc(row.label, 18)}
              </text>
            )}
            {row.cells.map((cell, j) => {
              const id = `r${i}c${j}`;
              const r = cellRect(i, j);
              const lit = fx.lit(id);
              const isOne = cell === 1 || cell === "1";
              return (
                <g key={id} className={fx.cls(id)}>
                  <rect x={r.x + 1} y={r.y + 1} width={r.w - 2} height={r.h - 2} rx={4} stroke={lit ? ACCENT : "#94a3b8"} strokeOpacity={lit ? 1 : 0.25} strokeWidth={lit ? 2 : 1} className="fill-[var(--panel-solid)]" />
                  <text
                    x={r.x + r.w / 2}
                    y={r.y + r.h / 2 + 4}
                    textAnchor="middle"
                    className={isOne ? "fill-sky-600 text-[13px] font-bold dark:fill-sky-300" : "fill-slate-700 text-[12px] dark:fill-slate-200"}
                  >
                    {trunc(String(cell), 22)}
                  </text>
                </g>
              );
            })}
          </g>
        ))}

        {/* groups: one loop around a solid rectangle, or one loop per cell when it wraps (K-map edges) */}
        {groups.map((g, k) => {
          const color = fx.lit(g.id) ? ACCENT : PALETTE[(k + 1) % PALETTE.length]!;
          const rs = g.cells.map(([r]) => r);
          const cs = g.cells.map(([, c]) => c);
          const [r0, r1, c0, c1] = [Math.min(...rs), Math.max(...rs), Math.min(...cs), Math.max(...cs)];
          const solid = (r1 - r0 + 1) * (c1 - c0 + 1) === new Set(g.cells.map(([r, c]) => `${r},${c}`)).size;
          const inset = 3 + k * 3;
          const boxes = solid
            ? [{ ...cellRect(r0, c0), w: colX[c1]! + colW[c1]! - colX[c0]!, h: CH * (r1 - r0 + 1) }]
            : g.cells.map(([r, c]) => cellRect(r, c));
          return (
            <g key={g.id} className={fx.cls(g.id)}>
              {boxes.map((b, i) => (
                <rect key={i} x={b.x + inset} y={b.y + inset} width={b.w - inset * 2} height={b.h - inset * 2} rx={12} fill={color} fillOpacity={0.08} stroke={color} strokeWidth={2} />
              ))}
              {g.label && (
                <text x={boxes[0]!.x + boxes[0]!.w - inset + 4} y={boxes[0]!.y + inset + 10} className="text-[10.5px] font-bold" fill={color} {...halo}>
                  {g.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </Fit>
  );
}
