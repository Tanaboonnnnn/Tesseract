/** Shared bits for the visual renderers: palette, step effects, scales. */
import type { Visual } from "../../lib/api.ts";

export const PALETTE = ["#38bdf8", "#34d399", "#fbbf24", "#fb7185", "#a78bfa", "#f472b6", "#2dd4bf", "#94a3b8"];
export const ACCENT = "#38bdf8";

/** Step effect for one element id: lit (in the current step), dim (another step is shown), hidden (build mode, not yet). */
export interface Fx {
  cls: (id: string) => string;
  lit: (id: string) => boolean;
}

export function makeFx(visual: Visual, step: number): Fx {
  const current = step >= 0 ? new Set(visual.steps[step]?.highlight ?? []) : null;
  const hidden = new Set<string>();
  if (visual.step_mode === "build") {
    const seen = new Set(visual.steps.slice(0, Math.max(0, step + 1)).flatMap((s) => s.highlight));
    for (const s of visual.steps) for (const id of s.highlight) if (!seen.has(id)) hidden.add(id);
  }
  const lit = (id: string) => !!current?.has(id);
  return {
    lit,
    cls: (id) => {
      if (hidden.has(id)) return "vis-el vis-hidden";
      if (!current || current.size === 0) return "vis-el";
      return current.has(id) ? "vis-el vis-lit" : "vis-el vis-dim";
    },
  };
}

export const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** ~5 round tick values covering [min, max]. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) return [min];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

export const fmtNum = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString("en-US") : String(Number(n.toFixed(3))));

/** Text that stays readable over lines: an outline in the panel color. */
export const halo = { paintOrder: "stroke" as const, stroke: "var(--panel-solid)", strokeWidth: 3, strokeLinejoin: "round" as const };
