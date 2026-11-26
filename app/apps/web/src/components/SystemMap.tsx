/**
 * Project system map (SPEC §4.14): parts in lanes (columns), connections, honest status, "you are here".
 * Hand-written SVG — no diagram library. AI clients draw it via MCP; here you look, click and move the focus.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crosshair, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, type ProjectMapView, type Task } from "../lib/api.ts";
import { cn, label } from "../lib/format.ts";
import { Button, Card, Chip, ErrorNote, ProgressBar, SectionTitle, type Tone } from "./ui.tsx";

/** Project part statuses, plus "review" for learning topics that need review (amber). */
export type Status = ProjectMapView["nodes"][number]["effective_status"] | "review" | "info";
type StatusText = Partial<Record<Status, string>>;

/** What the diagram draws: a project map, or a learning item shown as a map (LearningMap.tsx). */
export interface DiagramMap {
  lanes: string[];
  focus: string | null;
  /** sub: optional second line instead of the status name (Guide page). */
  nodes: { id: string; label: string; lane: string; effective_status: Status; progress: number | null; sub?: string }[];
  edges: { from: string; to: string; label: string }[];
}

export const STATUS: Record<Status, { text: string; tone: Tone; color: string; dot: string }> = {
  planned: { text: "Planned", tone: "neutral", color: "#94a3b8", dot: "bg-slate-400" },
  building: { text: "Building", tone: "blue", color: "#38bdf8", dot: "bg-sky-500" },
  done: { text: "Done", tone: "green", color: "#34d399", dot: "bg-emerald-500" },
  blocked: { text: "Blocked", tone: "red", color: "#fb7185", dot: "bg-rose-500" },
  review: { text: "Review", tone: "amber", color: "#fbbf24", dot: "bg-amber-400" },
  info: { text: "", tone: "blue", color: "#818cf8", dot: "bg-indigo-400" },
};

const PROJECT_STATUSES: Status[] = ["planned", "building", "done", "blocked"];

/** Status legend + the Motion toggle, shared by project and learning maps. */
export function MapLegend({ statuses, text = {}, motion, setMotion }: { statuses: Status[]; text?: StatusText; motion: boolean; setMotion: (on: boolean) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {statuses.map((s) => (
        <span key={s} className="inline-flex items-center gap-1 text-[11px] text-slate-500">
          <span className={cn("size-2 rounded-full", STATUS[s].dot)} />
          {text[s] ?? STATUS[s].text}
        </span>
      ))}
      <button
        onClick={() => setMotion(!motion)}
        aria-pressed={motion}
        title="Animate the map (saved on this device)"
        className="ml-2 rounded px-1.5 py-0.5 text-[11px] text-slate-500 ring-1 ring-[var(--line)] hover:text-accent-600 aria-pressed:text-accent-600 dark:aria-pressed:text-sky-300"
      >
        Motion {motion ? "on" : "off"}
      </button>
    </div>
  );
}

const W = 180; // node width
const H = 56; // node height
const GX = 64; // gap between columns
const GY = 28; // gap between nodes in a column
const PAD = 20;
const HEAD = 22; // column title row
const TAG = 16; // room above a node for the "you are here" tag

export function SystemMap({ project, tasks }: { project: string; tasks: Task[] }) {
  const qc = useQueryClient();
  const { data: map, error } = useQuery({ queryKey: ["project-map", project], queryFn: () => api.projectMap(project) });
  const [selected, setSelected] = useState<string | null>(null);
  const motionState = useMotion();
  const focus = useMutation({
    mutationFn: (node: string | null) => api.setMapFocus(project, node),
    onSuccess: (m) => qc.setQueryData(["project-map", project], m),
  });

  if (error) return <ErrorNote error={error} />;
  if (map === undefined) return null;
  if (map === null) {
    return (
      <Card className="mb-6">
        <SectionTitle>System map</SectionTitle>
        <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Sparkles size={15} className="text-accent-600 dark:text-sky-300" />
          No map yet. Ask your AI: “Draw the system map for this project and link the parts to tasks.”
        </p>
      </Card>
    );
  }

  const { summary } = map;
  const node = map.nodes.find((n) => n.id === selected) ?? null;
  const [motion, setMotion] = motionState;

  return (
    <Card className="mb-6">
      <SectionTitle action={<MapLegend statuses={PROJECT_STATUSES} motion={motion} setMotion={setMotion} />}>
        System map
      </SectionTitle>

      {/* Where am I? */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="flex items-center gap-1.5 text-sm">
          <Crosshair size={15} className="text-accent-600 dark:text-sky-300" />
          <span className="text-slate-500">Now:</span>
          <span className="font-semibold">{summary.focus?.label ?? "—"}</span>
        </p>
        <div className="flex min-w-48 flex-1 items-center gap-2">
          <ProgressBar value={summary.parts ? (summary.done / summary.parts) * 100 : 0} color="green" />
          <span className="shrink-0 text-xs text-slate-500 tabular-nums">
            {summary.done}/{summary.parts} parts done
          </span>
        </div>
        {summary.blocked > 0 && <Chip tone="red">{summary.blocked} blocked</Chip>}
      </div>

      <div className="map-stage overflow-x-auto rounded-lg">
        <Diagram map={map} motion={motion} selected={selected} onSelect={(id) => setSelected(id === selected ? null : id)} />
      </div>

      {node && (
        <div className="mt-4 rounded-lg border border-[var(--line)] p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{node.label}</h3>
            <Chip tone={STATUS[node.effective_status].tone}>{STATUS[node.effective_status].text}</Chip>
            <span className="text-xs text-slate-400">{label(node.lane)}</span>
            {map.focus !== node.id && (
              <Button variant="ghost" className="ml-auto py-1 text-xs" onClick={() => focus.mutate(node.id)}>
                <Crosshair size={13} /> Set as now
              </Button>
            )}
          </div>
          {node.note && <p className="mb-2 text-sm whitespace-pre-line text-slate-500 dark:text-slate-400">{node.note}</p>}
          {node.tasks.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {node.tasks.map((tid) => {
                const t = tasks.find((x) => x.id === tid);
                return (
                  <li key={tid} className="flex items-center gap-2">
                    <span className={cn("size-1.5 rounded-full", t?.status === "done" ? "bg-emerald-500" : t?.status === "todo" ? "bg-slate-400" : "bg-sky-500")} />
                    <span className={cn("flex-1", t?.status === "done" && "text-slate-400 line-through")}>{t?.title ?? tid}</span>
                    <span className="text-xs text-slate-400">{t ? label(t.status) : "missing"}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-slate-400">No linked tasks — status is set by hand.</p>
          )}
          <ErrorNote error={focus.error} />
        </div>
      )}
    </Card>
  );
}

/**
 * Flow diagram: columns = lanes, each column centered vertically, glowing cards, dotted links.
 * Light particles travel along links whose source part is active (building/done): SVG animateMotion,
 * no JS per frame. Paused while scrolled out of view or when the window is hidden; "Motion off" removes it.
 */
export function Diagram({
  map,
  motion,
  selected,
  onSelect,
  text = {},
}: {
  map: DiagramMap;
  motion: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
  text?: StatusText;
}) {
  const fxRef = useRef<HTMLDivElement>(null);

  /*
   * Any running animation makes the browser draw ~60 frames/s (measured: ~40% of a core, mostly the GPU process).
   * So the effects play in bursts: 8 s when the map scrolls into view, and while the pointer is over it.
   * The rest of the time they are paused (frozen in place): 0 frames, 0 cost.
   */
  useEffect(() => {
    const fx = fxRef.current;
    const stage = fx?.parentElement;
    if (!fx || !stage || !motion) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let visible = false;
    const play = (ms: number | null) => {
      clearTimeout(timer);
      fx.classList.remove("map-fx-paused");
      if (ms !== null) timer = setTimeout(() => fx.classList.add("map-fx-paused"), ms);
    };
    const stop = () => {
      clearTimeout(timer);
      fx.classList.add("map-fx-paused");
    };
    const io = new IntersectionObserver(([e]) => {
      const now = !!e?.isIntersecting;
      if (now && !visible) play(8_000);
      if (!now) stop();
      visible = now;
    });
    const enter = () => play(null);
    const leave = () => (visible ? play(2_000) : stop());
    io.observe(fx);
    stage.addEventListener("pointerenter", enter);
    stage.addEventListener("pointerleave", leave);
    return () => {
      clearTimeout(timer);
      io.disconnect();
      stage.removeEventListener("pointerenter", enter);
      stage.removeEventListener("pointerleave", leave);
    };
  }, [motion]);

  const columns = map.lanes.map((lane) => map.nodes.filter((n) => n.lane === lane));
  const colHeight = (k: number) => k * (H + TAG) + Math.max(0, k - 1) * GY;
  const tallest = Math.max(1, ...columns.map((c) => c.length));
  const pos = new Map<string, { x: number; y: number }>();
  columns.forEach((col, li) => {
    const offset = (colHeight(tallest) - colHeight(col.length)) / 2; // center each column
    col.forEach((n, ri) => pos.set(n.id, { x: PAD + li * (W + GX), y: PAD + HEAD + TAG + offset + ri * (H + TAG + GY) }));
  });
  // +44 on the right: links inside the last column curve out to the right.
  const width = PAD * 2 + map.lanes.length * W + (map.lanes.length - 1) * GX + 44;
  const height = PAD * 2 + HEAD + colHeight(tallest);
  const status = new Map(map.nodes.map((n) => [n.id, n.effective_status]));
  const edges = map.edges.map((e, i) => {
    const geo = edgePath(pos.get(e.from)!, pos.get(e.to)!);
    const from = status.get(e.from)!;
    const active = from === "building" || from === "done" || from === "info";
    const blocked = status.get(e.to) === "blocked";
    const tone: Status = blocked ? "blocked" : active ? from : "planned";
    return { ...e, ...geo, i, active, flowing: active && !blocked, tone };
  });
  const box = { width, height, viewBox: `0 0 ${width} ${height}` };

  return (
    <Fit width={width} height={height}>
      {/* Base layer: static, painted once. No filters (they are costly to repaint). */}
      <svg {...box} role="img" aria-label="System map" className="absolute inset-0">
        {map.lanes.map((lane, i) => (
          <text key={lane} x={PAD + i * (W + GX) + W / 2} y={PAD + 10} textAnchor="middle" className="fill-slate-500 font-display text-[10px] font-semibold tracking-[0.2em] uppercase opacity-70">
            {label(lane)}
          </text>
        ))}

        {edges.map((e) => {
          const color = STATUS[e.tone].color;
          return (
            <g key={e.i}>
              <path d={e.d} fill="none" stroke={color} strokeOpacity={e.active ? 0.8 : 0.4} strokeWidth={2.2} strokeDasharray="0.1 7" strokeLinecap="round" />
              <circle cx={e.ex} cy={e.ey} r={2.4} fill={color} opacity={0.75} />
              {e.label && (
                <text x={e.mx} y={e.my - 7} textAnchor="middle" className="fill-slate-500 text-[9.5px]">
                  {e.label}
                </text>
              )}
            </g>
          );
        })}

        {map.nodes.map((n) => {
          const p = pos.get(n.id)!;
          const isFocus = map.focus === n.id;
          const s = { ...STATUS[n.effective_status], text: text[n.effective_status] ?? STATUS[n.effective_status].text };
          const isSel = selected === n.id;
          return (
            <g key={n.id} transform={`translate(${p.x},${p.y})`} onClick={() => onSelect(n.id)} className="group cursor-pointer">
              <title>{`${n.label} · ${n.sub ?? s.text}${n.progress !== null ? ` · ${n.progress}%` : ""}`}</title>
              {isFocus && (
                <text x={2} y={-10} fill={s.color} className="font-display text-[9px] font-bold tracking-[0.2em] uppercase">
                  ◉ You are here
                </text>
              )}
              {/* soft halo: two wide, faint strokes instead of a blur filter */}
              <rect x={-3} y={-3} width={W + 6} height={H + 6} rx={11} fill="none" stroke={s.color} strokeOpacity={isFocus ? 0.18 : 0.08} strokeWidth={6} />
              <rect
                width={W}
                height={H}
                rx={8}
                stroke={s.color}
                strokeOpacity={isSel ? 1 : 0.55}
                strokeWidth={isSel ? 2 : 1.2}
                className="fill-[var(--panel-solid)] group-hover:[stroke-opacity:1]"
              />
              <rect x={10} y={0} width={32} height={2} rx={1} fill={s.color} opacity={0.9} />
              <circle cx={18} cy={22} r={7} fill={s.color} opacity={0.2} />
              <circle cx={18} cy={22} r={3.5} fill={s.color} />
              <text x={32} y={26} className="fill-slate-800 font-display text-[11.5px] font-bold tracking-[0.05em] uppercase dark:fill-slate-100">
                {n.label.length > 22 ? `${n.label.slice(0, 21)}…` : n.label}
              </text>
              <text x={32} y={41} className="fill-slate-500 text-[10px]">
                {n.sub ?? s.text}
                {n.progress !== null ? ` · ${n.progress}%` : ""}
              </text>
              <rect x={10} y={H - 7} width={W - 20} height={2} rx={1} className="fill-slate-400/20" />
              {n.progress !== null && n.progress > 0 && <rect x={10} y={H - 7} width={((W - 20) * n.progress) / 100} height={2} rx={1} fill={s.color} />}
            </g>
          );
        })}
      </svg>

      {/*
        FX layer: plain divs animated with transform/opacity only. Browsers run these on the GPU compositor
        (no main-thread work, no repaint), so a map full of particles costs almost nothing.
        Each particle follows its link through precomputed keyframes along the curve.
      */}
      {motion && (
        <div ref={fxRef} aria-hidden className="map-fx pointer-events-none absolute inset-0">
          <style>{edges.filter((e) => e.flowing).map((e) => sparkKeyframes(`sbf-${e.i}`, e.c)).join("\n")}</style>
          {edges
            .filter((e) => e.flowing)
            .map((e) =>
              [0, 1].map((k) => (
                <span
                  key={`${e.i}-${k}`}
                  className="map-spark"
                  style={{
                    background: `radial-gradient(circle, #fff 0, ${STATUS[e.tone].color} 35%, transparent 70%)`,
                    animation: `sbf-${e.i} 2.8s linear ${-(k * 1.4 + e.i * 0.37)}s infinite`,
                  }}
                />
              )),
            )}
          {map.nodes.map((n) => {
            const p = pos.get(n.id)!;
            const color = STATUS[n.effective_status].color;
            return (
              <div key={n.id}>
                {map.focus === n.id && (
                  <span className="map-focus-ring" style={{ left: p.x - 5, top: p.y - 5, width: W + 10, height: H + 10, borderColor: color }} />
                )}
                {n.effective_status === "building" && (
                  <span className="map-ping" style={{ left: p.x + 18 - 11, top: p.y + 22 - 11, borderColor: color }} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </Fit>
  );
}

/**
 * Shrinks the diagram to the card width (down to 60%; narrower screens scroll instead).
 * A CSS transform scale: the browser resizes the finished picture, nothing is laid out again.
 */
export function Fit({ width, height, children }: { width: number; height: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.max(0.6, Math.min(1, el.clientWidth / width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={ref} style={{ width: width * scale, height: height * scale }}>
      <div className="relative origin-top-left" style={{ width, height, transform: scale < 1 ? `scale(${scale})` : undefined }}>
        {children}
      </div>
    </div>
  );
}

/**
 * Map animation on/off, saved per device. Default on: the animation is the point of the map and it is cheap
 * (a few SVG particles, paused when unseen). Windows "Animation effects: off" would otherwise hide it everywhere.
 */
export function useMotion(): [boolean, (on: boolean) => void] {
  const KEY = "sb-map-motion";
  const [on, setOn] = useState(() => localStorage.getItem(KEY) !== "off");
  return [
    on,
    (next) => {
      localStorage.setItem(KEY, next ? "on" : "off");
      window.dispatchEvent(new Event("tesseract-motion"));
      setOn(next);
    },
  ];
}

type Pt = [number, number];

/** Curved connector: forward (left → right), backward, or within one column (bulges right). */
function edgePath(a: { x: number; y: number }, b: { x: number; y: number }) {
  const ay = a.y + H / 2;
  const by = b.y + H / 2;
  let c: [Pt, Pt, Pt, Pt];
  if (b.x > a.x) {
    const sx = a.x + W, ex = b.x - 4, dx = (ex - sx) / 2;
    c = [[sx, ay], [sx + dx, ay], [ex - dx, by], [ex, by]];
  } else if (b.x < a.x) {
    const sx = a.x, ex = b.x + W + 4, dx = (sx - ex) / 2;
    c = [[sx, ay], [sx - dx, ay], [ex + dx, by], [ex, by]];
  } else {
    const sx = a.x + W, ex = b.x + W + 4, bulge = sx + 38;
    c = [[sx, ay], [bulge, ay], [bulge, by], [ex, by]];
  }
  const [p0, p1, p2, p3] = c;
  const mid = bezier(c, 0.5);
  return { d: `M${p0} C${p1} ${p2} ${p3}`, c, mx: mid[0], my: mid[1], ex: p3[0], ey: p3[1] };
}

function bezier([p0, p1, p2, p3]: [Pt, Pt, Pt, Pt], t: number): Pt {
  const u = 1 - t;
  const f = (i: 0 | 1) => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i];
  return [f(0), f(1)];
}

/** Keyframes that move a particle along the curve with transform only (compositor-friendly). */
function sparkKeyframes(name: string, c: [Pt, Pt, Pt, Pt], steps = 20): string {
  const frames = Array.from({ length: steps + 1 }, (_, k) => {
    const t = k / steps;
    const [x, y] = bezier(c, t);
    const opacity = t < 0.1 ? t / 0.1 : t > 0.85 ? (1 - t) / 0.15 : 1; // fade in and out
    return `${(t * 100).toFixed(1)}%{transform:translate(${x.toFixed(1)}px,${y.toFixed(1)}px);opacity:${opacity.toFixed(2)}}`;
  });
  return `@keyframes ${name}{${frames.join("")}}`;
}
