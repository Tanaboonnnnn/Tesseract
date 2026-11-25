/** Tree: tidy layout (leaves in order, parents centered over their children), top-down or left-to-right. */
import type { TreeNode } from "@brain/core";
import type { Visual } from "../../lib/api.ts";
import { Fit } from "../SystemMap.tsx";
import { ACCENT, type Fx, PALETTE, trunc } from "./shared.ts";

type V = Extract<Visual, { type: "tree" }>;

const W = 150;
const H = 44;
const PAD = 20;

export function TreeView({ v, fx }: { v: V; fx: Fx }) {
  const down = v.data.orientation === "down";
  // breadth = slot across, depth = level. Down: slots are columns. Right: slots are rows.
  const SLOT = down ? W + 18 : H + 16;
  const LEVEL = down ? H + 46 : W + 56;
  const pos = new Map<string, { slot: number; depth: number }>();
  let leaf = 0;
  const place = (n: TreeNode, depth: number): number => {
    const kids = n.children ?? [];
    const slot = kids.length ? (() => {
      const s = kids.map((k) => place(k, depth + 1));
      return (s[0]! + s[s.length - 1]!) / 2;
    })() : leaf++;
    pos.set(n.id, { slot, depth });
    return slot;
  };
  place(v.data.root, 0);
  const all: { n: TreeNode; parent: TreeNode | null; branch: number }[] = [];
  const walk = (n: TreeNode, parent: TreeNode | null, branch: number) => {
    all.push({ n, parent, branch });
    (n.children ?? []).forEach((c, i) => walk(c, n, parent ? branch : i));
  };
  walk(v.data.root, null, 0);
  const maxDepth = Math.max(...[...pos.values()].map((p) => p.depth));
  const xy = (id: string) => {
    const p = pos.get(id)!;
    return down ? { x: PAD + p.slot * SLOT, y: PAD + p.depth * LEVEL } : { x: PAD + p.depth * LEVEL, y: PAD + p.slot * SLOT };
  };
  const width = down ? PAD * 2 + (leaf - 1) * SLOT + W : PAD * 2 + maxDepth * LEVEL + W;
  const height = down ? PAD * 2 + maxDepth * LEVEL + H : PAD * 2 + (leaf - 1) * SLOT + H;

  return (
    <Fit width={width} height={height}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={v.title} className="absolute inset-0">
        {all.map(({ n, parent, branch }) => {
          if (!parent) return null;
          const a = xy(parent.id);
          const b = xy(n.id);
          const [x1, y1, x2, y2] = down ? [a.x + W / 2, a.y + H, b.x + W / 2, b.y] : [a.x + W, a.y + H / 2, b.x, b.y + H / 2];
          const d = down
            ? `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`
            : `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
          return <path key={`e-${n.id}`} d={d} fill="none" stroke={PALETTE[branch % PALETTE.length]} strokeOpacity={0.55} strokeWidth={1.6} className={fx.cls(n.id)} />;
        })}

        {all.map(({ n, parent, branch }) => {
          const p = xy(n.id);
          const lit = fx.lit(n.id);
          const color = lit ? ACCENT : parent ? PALETTE[branch % PALETTE.length]! : "#94a3b8";
          return (
            <g key={n.id} transform={`translate(${p.x},${p.y})`} className={fx.cls(n.id)}>
              <title>{n.note ? `${n.label}: ${n.note}` : n.label}</title>
              <rect width={W} height={H} rx={8} stroke={color} strokeWidth={lit ? 2.2 : 1.2} strokeOpacity={lit ? 1 : 0.7} className="fill-[var(--panel-solid)]" />
              <rect x={10} y={0} width={28} height={2} rx={1} fill={color} />
              <text x={10} y={n.note ? 19 : 27} className="fill-slate-800 text-[11.5px] font-semibold dark:fill-slate-100">
                {trunc(n.label, 22)}
              </text>
              {n.note && (
                <text x={10} y={34} className="fill-slate-500 text-[10px]">
                  {trunc(n.note, 26)}
                </text>
              )}
              {n.gate && (
                <g transform={down ? `translate(${W / 2 - 16},${H + 6})` : `translate(${W + 6},${H / 2 - 8})`}>
                  <rect width={32} height={16} rx={8} fill={n.gate === "and" ? "#fbbf24" : "#a78bfa"} fillOpacity={0.2} stroke={n.gate === "and" ? "#fbbf24" : "#a78bfa"} />
                  <text x={16} y={11.5} textAnchor="middle" className="fill-slate-700 text-[9px] font-bold tracking-wider dark:fill-slate-200">
                    {n.gate.toUpperCase()}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </Fit>
  );
}
