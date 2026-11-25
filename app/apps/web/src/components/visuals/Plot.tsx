/**
 * Plot engine (SPEC §4.16): matplotlib / Desmos-style graphs from data, drawn as SVG (heatmaps via a canvas image).
 * Functions come from the safe expression parser in core; sliders (params) re-evaluate them live.
 * Hover shows exact values; legend items toggle traces; steps highlight traces like other visuals.
 */
import { compile, type Compiled } from "@tesseract/core/pure";
import { useMemo, useRef, useState } from "react";
import type { PlotData, PlotTrace } from "../../lib/api.ts";
import { cn } from "../../lib/format.ts";
import { type Fx, fmtNum, halo, niceTicks, PALETTE } from "./shared.ts";

const W = 640;
const H = 360;
const M = { l: 58, r: 18, t: 18, b: 44 };
const PW = W - M.l - M.r;
const PH = H - M.t - M.b;
const N = 320;

type Env = Record<string, number>;
const safe = (f: Compiled | null, env: Env) => {
  if (!f) return NaN;
  const v = f(env);
  return Number.isFinite(v) ? v : NaN;
};
const compileOr = (src: string | undefined, vars: string[]): Compiled | null => {
  if (!src) return null;
  try {
    return compile(src, vars);
  } catch {
    return null;
  }
};

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  return sorted[lo]! + (sorted[Math.min(lo + 1, sorted.length - 1)]! - sorted[lo]!) * (i - lo);
}

function histogram(values: number[], bins?: number) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const n = bins ?? Math.max(1, Math.ceil(Math.log2(values.length) + 1)); // Sturges
  const w = (hi - lo || 1) / n;
  const counts = Array(n).fill(0) as number[];
  for (const v of values) counts[Math.min(n - 1, Math.floor((v - lo) / w))]!++;
  return counts.map((c, i) => ({ x0: lo + i * w, x1: lo + (i + 1) * w, c }));
}

/** dark → accent → light ramp for heatmaps */
function ramp(t: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0, [13, 8, 135]],
    [0.35, [126, 3, 168]],
    [0.6, [204, 71, 120]],
    [0.8, [248, 149, 64]],
    [1, [240, 249, 33]],
  ];
  const k = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) {
    const [b, cb] = stops[i]!;
    const [a, ca] = stops[i - 1]!;
    if (k <= b) {
      const u = (k - a) / (b - a);
      return [0, 1, 2].map((j) => Math.round(ca[j]! + (cb[j]! - ca[j]!) * u)) as [number, number, number];
    }
  }
  return stops[stops.length - 1]![1];
}

export function Plot({ data, fx, className }: { data: PlotData; fx?: Fx; className?: string }) {
  const [params, setParams] = useState<Env>(() => Object.fromEntries(data.params.map((p) => [p.name, p.value])));
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const names = data.params.map((p) => p.name);

  const fns = useMemo(
    () =>
      Object.fromEntries(
        data.traces.map((t) => [
          t.id,
          {
            f: compileOr("expr" in t ? t.expr : undefined, t.kind === "heatmap" ? ["x", "y", ...names] : ["x", ...names]),
            g: compileOr(t.kind === "area" ? t.expr2 : undefined, ["x", ...names]),
            px: compileOr(t.kind === "parametric" ? t.x : undefined, ["t", ...names]),
            py: compileOr(t.kind === "parametric" ? t.y : undefined, ["t", ...names]),
          },
        ]),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data],
  );

  const view = useMemo(() => {
    const visible = data.traces.filter((t) => !hidden.has(t.id));
    const xs: number[] = [];
    const ys: number[] = [];
    const robustYs: number[] = [];
    let categories: string[] | null = null;
    for (const t of data.traces) {
      if (t.kind === "scatter" || t.kind === "line" || t.kind === "step") t.points.forEach(([x, y]) => (xs.push(x), ys.push(y)));
      if (t.kind === "errorbar") t.points.forEach(([x, y, e]) => (xs.push(x), ys.push(y - e, y + e)));
      if ((t.kind === "function" || t.kind === "area") && t.domain) xs.push(...t.domain);
      if (t.kind === "heatmap") (xs.push(...t.x), ys.push(...t.y));
      if (t.kind === "arrow") (xs.push(t.from[0], t.to[0]), ys.push(t.from[1], t.to[1]));
      if (t.kind === "bar") {
        if (t.x.some((v) => typeof v === "string")) categories = t.x.map(String);
        else xs.push(...(t.x as number[]));
        ys.push(0, ...t.y);
      }
      if (t.kind === "histogram") {
        const h = histogram(t.values, t.bins);
        xs.push(h[0]!.x0, h[h.length - 1]!.x1);
        ys.push(0, ...h.map((b) => b.c));
      }
      if (t.kind === "vline") xs.push(t.at);
      if (t.kind === "hline") ys.push(t.at);
      if (t.kind === "text") (xs.push(t.at[0]), ys.push(t.at[1]));
    }
    let x0 = data.x.min ?? (categories ? -0.5 : xs.length ? Math.min(...xs) : -5);
    let x1 = data.x.max ?? (categories ? (categories as string[]).length - 0.5 : xs.length ? Math.max(...xs) : 5);
    if (x0 === x1) [x0, x1] = [x0 - 1, x1 + 1];
    if (data.x.min === undefined && data.x.max === undefined && !categories && xs.length) {
      const pad = (x1 - x0) * 0.04;
      [x0, x1] = [x0 - pad, x1 + pad];
    }
    // sample functions/parametrics once for the y-range and the paths
    const samples: Record<string, [number, number][]> = {};
    for (const t of visible) {
      const fn = fns[t.id]!;
      if (t.kind === "function" || t.kind === "area") {
        const [a, b] = t.domain ?? [x0, x1];
        samples[t.id] = Array.from({ length: N + 1 }, (_, i) => {
          const x = a + ((b - a) * i) / N;
          return [x, safe(fn.f, { ...params, x })] as [number, number];
        });
        samples[t.id]!.forEach(([, y]) => Number.isFinite(y) && robustYs.push(y));
        if (fn.g) samples[`${t.id}:2`] = samples[t.id]!.map(([x]) => [x, safe(fn.g, { ...params, x })]);
      }
      if (t.kind === "parametric") {
        samples[t.id] = Array.from({ length: N + 1 }, (_, i) => {
          const tt = t.t[0] + ((t.t[1] - t.t[0]) * i) / N;
          return [safe(fn.px, { ...params, t: tt }), safe(fn.py, { ...params, t: tt })] as [number, number];
        });
        samples[t.id]!.forEach(([x, y]) => Number.isFinite(y) && (robustYs.push(y), xs.push(x)));
      }
    }
    robustYs.sort((a, b) => a - b);
    const fy = robustYs.length ? [quantile(robustYs, 0.02), quantile(robustYs, 0.98)] : [];
    const allY = [...ys, ...fy].filter(Number.isFinite);
    let y0 = data.y.min ?? (allY.length ? Math.min(...allY) : -1);
    let y1 = data.y.max ?? (allY.length ? Math.max(...allY) : 1);
    if (y0 === y1) [y0, y1] = [y0 - 1, y1 + 1];
    if (data.y.min === undefined) y0 -= (y1 - y0) * 0.06;
    if (data.y.max === undefined) y1 += (y1 - y0) * 0.06;
    const logX = !!data.x.log && x0 > 0;
    const logY = !!data.y.log && y0 > 0;
    const tx = (v: number) => (logX ? Math.log10(v) : v);
    const ty = (v: number) => (logY ? Math.log10(v) : v);
    let [X0, X1, Y0, Y1] = [tx(x0), tx(x1), ty(y0), ty(y1)];
    if (data.equal) {
      const sx = PW / (X1 - X0);
      const sy = PH / (Y1 - Y0);
      if (sx > sy) {
        const c = (X0 + X1) / 2;
        const half = PW / sy / 2;
        [X0, X1] = [c - half, c + half];
      } else {
        const c = (Y0 + Y1) / 2;
        const half = PH / sx / 2;
        [Y0, Y1] = [c - half, c + half];
      }
    }
    const sx = (v: number) => M.l + ((tx(v) - X0) / (X1 - X0)) * PW;
    const sy = (v: number) => M.t + PH - ((ty(v) - Y0) / (Y1 - Y0)) * PH;
    const ticks = (lo: number, hi: number, log: boolean) =>
      log ? Array.from({ length: Math.floor(hi) - Math.ceil(lo) + 1 }, (_, i) => 10 ** (Math.ceil(lo) + i)) : niceTicks(lo, hi, 6);
    return { visible, samples, categories: categories as string[] | null, sx, sy, X0, X1, Y0, Y1, xt: categories ? [] : ticks(X0, X1, logX), yt: ticks(Y0, Y1, logY), logX, logY };
  }, [data, fns, params, hidden]);

  const { sx, sy } = view;
  const inPlot = (y: number) => y >= M.t - 40 && y <= M.t + PH + 40;
  const pathOf = (pts: [number, number][]) => {
    let d = "";
    let pen = false;
    let prev: number | null = null;
    for (const [x, y] of pts) {
      const Y = sy(y);
      const jump = prev !== null && Math.abs(Y - prev) > PH * 1.5; // asymptote: lift the pen
      if (!Number.isFinite(Y) || !inPlot(Y) || jump) {
        pen = false;
        prev = Number.isFinite(Y) ? Y : null;
        if (!Number.isFinite(Y) || !inPlot(Y)) continue;
      }
      d += `${pen ? "L" : "M"}${sx(x).toFixed(1)},${Y.toFixed(1)}`;
      pen = true;
      prev = Y;
    }
    return d;
  };
  const colorOf = (t: PlotTrace, i: number) => t.color ?? PALETTE[i % PALETTE.length]!;

  const heatmaps = useMemo(() => {
    const out: Record<string, string> = {};
    for (const t of view.visible) {
      if (t.kind !== "heatmap") continue;
      const res = t.resolution ?? 60;
      const grid: number[][] =
        t.z ??
        Array.from({ length: res }, (_, j) =>
          Array.from({ length: res }, (_, i) => safe(fns[t.id]!.f, { ...params, x: t.x[0] + ((t.x[1] - t.x[0]) * (i + 0.5)) / res, y: t.y[1] - ((t.y[1] - t.y[0]) * (j + 0.5)) / res })),
        );
      const flat = grid.flat().filter(Number.isFinite);
      const lo = Math.min(...flat);
      const hi = Math.max(...flat);
      const canvas = document.createElement("canvas");
      canvas.width = grid[0]?.length ?? 1;
      canvas.height = grid.length;
      const ctx = canvas.getContext("2d")!;
      const img = ctx.createImageData(canvas.width, canvas.height);
      grid.forEach((row, j) =>
        row.forEach((v, i) => {
          let k = (v - lo) / (hi - lo || 1);
          if (t.contours) k = Math.floor(k * t.contours) / t.contours; // banded contours
          const [r, g, b] = ramp(k);
          const o = (j * canvas.width + i) * 4;
          img.data.set([r, g, b, Number.isFinite(v) ? 210 : 0], o);
        }),
      );
      ctx.putImageData(img, 0, 0);
      out[t.id] = canvas.toDataURL();
    }
    return out;
  }, [view.visible, fns, params]);

  // hover readout
  const onMove = (e: React.PointerEvent) => {
    const el = svg.current;
    if (!el) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(el.getScreenCTM()!.inverse());
    if (p.x < M.l || p.x > M.l + PW || p.y < M.t || p.y > M.t + PH) return setHover(null);
    setHover({ x: p.x, y: p.y });
  };
  const readout = useMemo(() => {
    if (!hover || view.categories) return null;
    const X = view.X0 + ((hover.x - M.l) / PW) * (view.X1 - view.X0);
    const x = view.logX ? 10 ** X : X;
    const lines: { color: string; text: string; y?: number }[] = [];
    view.visible.forEach((t, i) => {
      if (t.kind === "function") {
        const y = safe(fns[t.id]!.f, { ...params, x });
        if (Number.isFinite(y)) lines.push({ color: colorOf(t, i), text: `${t.label ?? t.id}: ${fmtNum(y)}`, y });
      }
      if (t.kind === "scatter" || t.kind === "line" || t.kind === "step") {
        let best: [number, number] | null = null;
        let bd = 24;
        for (const pt of t.points) {
          const d = Math.hypot(sx(pt[0]) - hover.x, sy(pt[1]) - hover.y);
          if (d < bd) [bd, best] = [d, pt];
        }
        if (best) lines.push({ color: colorOf(t, i), text: `${t.label ?? t.id}: (${fmtNum(best[0])}, ${fmtNum(best[1])})`, y: best[1] });
      }
    });
    return { x, lines };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover, view, params]);

  const legend = data.traces.filter((t) => t.label && !["text"].includes(t.kind));

  return (
    <div className={cn("space-y-3", className)}>
      {data.title && <p className="text-sm font-semibold">{data.title}</p>}
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        role="img"
        aria-label={data.title ?? "Plot"}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id="plot-area">
            <rect x={M.l} y={M.t} width={PW} height={PH} />
          </clipPath>
        </defs>
        {/* grid + axes */}
        {view.yt.map((v) => (
          <g key={`y${v}`}>
            <line x1={M.l} x2={M.l + PW} y1={sy(v)} y2={sy(v)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={M.l - 8} y={sy(v) + 4} textAnchor="end" className="fill-slate-500 text-[11px] tabular-nums">
              {fmtNum(v)}
            </text>
          </g>
        ))}
        {view.xt.map((v) => (
          <g key={`x${v}`}>
            <line x1={sx(v)} x2={sx(v)} y1={M.t} y2={M.t + PH} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={sx(v)} y={M.t + PH + 16} textAnchor="middle" className="fill-slate-500 text-[11px] tabular-nums">
              {fmtNum(v)}
            </text>
          </g>
        ))}
        {view.categories?.map((c, i) => (
          <text key={c} x={sx(i)} y={M.t + PH + 16} textAnchor="middle" className="fill-slate-500 text-[11px]">
            {c}
          </text>
        ))}
        {0 > view.Y0 && 0 < view.Y1 && !view.logY && <line x1={M.l} x2={M.l + PW} y1={sy(0)} y2={sy(0)} stroke="var(--line-strong)" strokeOpacity={0.6} />}
        {0 > view.X0 && 0 < view.X1 && !view.logX && !view.categories && <line x1={sx(0)} x2={sx(0)} y1={M.t} y2={M.t + PH} stroke="var(--line-strong)" strokeOpacity={0.6} />}
        <rect x={M.l} y={M.t} width={PW} height={PH} fill="none" stroke="var(--line)" />
        <text x={M.l + PW / 2} y={H - 6} textAnchor="middle" className="fill-slate-500 text-[12px] font-semibold">
          {data.x.label}
        </text>
        <text x={14} y={M.t + PH / 2} textAnchor="middle" transform={`rotate(-90 14 ${M.t + PH / 2})`} className="fill-slate-500 text-[12px] font-semibold">
          {data.y.label}
        </text>

        <g clipPath="url(#plot-area)">
          {view.visible.map((t) => {
            const i = data.traces.indexOf(t);
            const c = colorOf(t, i);
            const cls = fx?.cls(t.id) ?? "";
            switch (t.kind) {
              case "heatmap":
                return <image key={t.id} className={cls} href={heatmaps[t.id]} x={sx(t.x[0])} y={sy(t.y[1])} width={sx(t.x[1]) - sx(t.x[0])} height={sy(t.y[0]) - sy(t.y[1])} preserveAspectRatio="none" style={{ imageRendering: t.contours ? "pixelated" : "auto" }} />;
              case "region":
                return t.axis === "x" ? (
                  <rect key={t.id} className={cls} x={Math.min(sx(t.from), sx(t.to))} y={M.t} width={Math.abs(sx(t.to) - sx(t.from))} height={PH} fill={c} opacity={0.14} />
                ) : (
                  <rect key={t.id} className={cls} x={M.l} y={Math.min(sy(t.from), sy(t.to))} width={PW} height={Math.abs(sy(t.to) - sy(t.from))} fill={c} opacity={0.14} />
                );
              case "area": {
                const top = view.samples[t.id] ?? [];
                const bottom = view.samples[`${t.id}:2`] ?? top.map(([x]) => [x, 0] as [number, number]);
                const ok = top.every(([, y]) => Number.isFinite(y)) && bottom.every(([, y]) => Number.isFinite(y));
                if (!ok) return null;
                const d = `M${top.map(([x, y]) => `${sx(x)},${sy(y)}`).join("L")}L${[...bottom].reverse().map(([x, y]) => `${sx(x)},${sy(y)}`).join("L")}Z`;
                return <path key={t.id} className={cls} d={d} fill={c} opacity={0.22} />;
              }
              case "function":
              case "parametric":
                return <path key={t.id} className={cls} d={pathOf(view.samples[t.id] ?? [])} fill="none" stroke={c} strokeWidth={2.4} strokeDasharray={t.kind === "function" && t.dash ? "6 5" : undefined} strokeLinejoin="round" />;
              case "line":
                return <path key={t.id} className={cls} d={pathOf(t.points)} fill="none" stroke={c} strokeWidth={2.2} strokeDasharray={t.dash ? "6 5" : undefined} />;
              case "step": {
                const d = t.points.map(([x, y], j) => (j === 0 ? `M${sx(x)},${sy(y)}` : `H${sx(x)}V${sy(y)}`)).join("");
                return <path key={t.id} className={cls} d={d} fill="none" stroke={c} strokeWidth={2.2} />;
              }
              case "scatter":
                return (
                  <g key={t.id} className={cls}>
                    {t.points.map(([x, y], j) => (
                      <g key={j}>
                        <circle cx={sx(x)} cy={sy(y)} r={t.size ?? 4.5} fill={t.groups ? PALETTE[t.groups[j]! % PALETTE.length] : c} fillOpacity={0.85} stroke="var(--panel-solid)" strokeWidth={1} />
                        {t.labels?.[j] && t.points.length <= 40 && (
                          <text x={sx(x) + 7} y={sy(y) - 6} className="fill-slate-600 text-[10.5px] dark:fill-slate-300" {...halo}>
                            {t.labels[j]}
                          </text>
                        )}
                      </g>
                    ))}
                  </g>
                );
              case "bar": {
                const nSeries = view.visible.filter((v) => v.kind === "bar").length;
                const k = view.visible.filter((v) => v.kind === "bar").indexOf(t);
                const xsBar = t.x.map((v, j) => (typeof v === "string" ? j : v));
                const gap = view.categories ? 1 : xsBar.length > 1 ? Math.min(...xsBar.slice(1).map((v, j) => v - xsBar[j]!)) : 1;
                const bw = ((sx(gap) - sx(0)) * 0.7) / nSeries;
                return (
                  <g key={t.id} className={cls}>
                    {t.y.map((y, j) => (
                      <rect key={j} x={sx(xsBar[j]!) - (bw * nSeries) / 2 + k * bw} y={sy(Math.max(0, y))} width={Math.max(1, bw - 2)} height={Math.abs(sy(y) - sy(0))} rx={2} fill={y < 0 ? "#fb7185" : c} fillOpacity={0.85} />
                    ))}
                  </g>
                );
              }
              case "histogram":
                return (
                  <g key={t.id} className={cls}>
                    {histogram(t.values, t.bins).map((b, j) => (
                      <rect key={j} x={sx(b.x0) + 0.5} y={sy(b.c)} width={Math.max(1, sx(b.x1) - sx(b.x0) - 1)} height={sy(0) - sy(b.c)} fill={c} fillOpacity={0.75}>
                        <title>{`${fmtNum(b.x0)}–${fmtNum(b.x1)}: ${b.c}`}</title>
                      </rect>
                    ))}
                  </g>
                );
              case "errorbar":
                return (
                  <g key={t.id} className={cls} stroke={c} strokeWidth={1.6}>
                    {t.points.map(([x, y, e], j) => (
                      <g key={j}>
                        <line x1={sx(x)} x2={sx(x)} y1={sy(y - e)} y2={sy(y + e)} />
                        <line x1={sx(x) - 5} x2={sx(x) + 5} y1={sy(y - e)} y2={sy(y - e)} />
                        <line x1={sx(x) - 5} x2={sx(x) + 5} y1={sy(y + e)} y2={sy(y + e)} />
                        <circle cx={sx(x)} cy={sy(y)} r={3.5} fill={c} />
                      </g>
                    ))}
                  </g>
                );
              case "vline":
              case "hline": {
                const v = t.kind === "vline";
                return (
                  <g key={t.id} className={cls}>
                    <line x1={v ? sx(t.at) : M.l} x2={v ? sx(t.at) : M.l + PW} y1={v ? M.t : sy(t.at)} y2={v ? M.t + PH : sy(t.at)} stroke={c} strokeWidth={1.6} strokeDasharray="5 5" />
                    {t.label && (
                      <text x={v ? sx(t.at) + 5 : M.l + PW - 6} y={v ? M.t + 14 : sy(t.at) - 6} textAnchor={v ? "start" : "end"} fill={c} className="text-[11px] font-semibold" {...halo}>
                        {t.label}
                      </text>
                    )}
                  </g>
                );
              }
              case "arrow": {
                const [x1, y1, x2, y2] = [sx(t.from[0]), sy(t.from[1]), sx(t.to[0]), sy(t.to[1])];
                const a = Math.atan2(y2 - y1, x2 - x1);
                const head = [
                  [x2, y2],
                  [x2 - 9 * Math.cos(a - 0.4), y2 - 9 * Math.sin(a - 0.4)],
                  [x2 - 9 * Math.cos(a + 0.4), y2 - 9 * Math.sin(a + 0.4)],
                ];
                return (
                  <g key={t.id} className={cls}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth={2} />
                    <polygon points={head.map((p) => p.join(",")).join(" ")} fill={c} />
                  </g>
                );
              }
              case "text":
                return (
                  <text key={t.id} className={cn(cls, "text-[12px] font-semibold")} x={sx(t.at[0])} y={sy(t.at[1])} fill={t.color ?? "currentColor"} {...halo}>
                    {t.text}
                  </text>
                );
            }
          })}
        </g>

        {readout && hover && (
          <g pointerEvents="none">
            <line x1={hover.x} x2={hover.x} y1={M.t} y2={M.t + PH} stroke="var(--line-strong)" strokeDasharray="3 3" />
            {readout.lines.map((l, i) => (l.y !== undefined ? <circle key={i} cx={hover.x} cy={sy(l.y)} r={3.5} fill={l.color} /> : null))}
            <g transform={`translate(${Math.min(hover.x + 10, M.l + PW - 170)},${M.t + 8})`}>
              <rect width={164} height={18 + readout.lines.length * 15} rx={6} className="fill-[var(--panel-solid)]" stroke="var(--line)" />
              <text x={8} y={14} className="fill-slate-500 text-[11px] tabular-nums">
                x = {fmtNum(readout.x)}
              </text>
              {readout.lines.map((l, i) => (
                <text key={i} x={8} y={29 + i * 15} fill={l.color} className="text-[11px] font-semibold tabular-nums">
                  {l.text.length > 26 ? `${l.text.slice(0, 25)}…` : l.text}
                </text>
              ))}
            </g>
          </g>
        )}
      </svg>

      {legend.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {legend.map((t) => (
            <button key={t.id} onClick={() => setHidden((h) => new Set(h.has(t.id) ? [...h].filter((x) => x !== t.id) : [...h, t.id]))} className={cn("inline-flex items-center gap-1.5", hidden.has(t.id) && "opacity-40 line-through")}>
              <span className="size-2.5 rounded-sm" style={{ background: colorOf(t, data.traces.indexOf(t)) }} />
              {t.label}
            </button>
          ))}
        </div>
      )}

      {data.params.length > 0 && (
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {data.params.map((p) => (
            <label key={p.name} className="flex items-center gap-3 text-sm">
              <span className="w-10 shrink-0 font-semibold">{p.label ?? p.name}</span>
              <input
                type="range"
                min={p.min}
                max={p.max}
                step={p.step ?? (p.max - p.min) / 100}
                value={params[p.name]}
                onChange={(e) => setParams((v) => ({ ...v, [p.name]: Number(e.target.value) }))}
                className="min-w-0 flex-1 accent-sky-500"
              />
              <span className="w-12 shrink-0 text-right text-xs tabular-nums">{fmtNum(params[p.name]!)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
