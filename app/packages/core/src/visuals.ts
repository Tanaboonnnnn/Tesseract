/**
 * Learning visuals (SPEC §4.16): study pictures stored as data, drawn by the app.
 * AI sends a small, validated description (states, bars, points, cells, tree nodes) instead of HTML:
 * ~10–20× fewer tokens, no code to run, one consistent look. Every element has an id so steps can point at it.
 */
import { z } from "zod";
import { checkExpr } from "./expr.ts";
import { SceneSchema } from "./scene.ts";
import { Id, IsoDate } from "./schemas.ts";

export const VISUAL_TYPES = ["state", "gantt", "chart", "grid", "tree", "plot", "lesson", "html", "scene"] as const;
export type VisualType = (typeof VISUAL_TYPES)[number];

const Label = z.string().trim().min(1).max(80);
const Short = z.string().max(40);
const Title80 = z.string().max(80);

/* ---------- per-type data ---------- */

export const StateDataSchema = z.object({
  states: z
    .array(
      z.object({
        id: Id,
        label: Label,
        /** Moore output, shown inside the state. */
        output: Short.optional(),
        initial: z.boolean().optional(),
        accept: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(30),
  /** Mealy output goes in the label, e.g. "1/0". Self-loops allowed. */
  transitions: z.array(z.object({ id: Id, from: Id, to: Id, label: Short.default("") })).max(80).default([]),
});

export const GanttDataSchema = z.object({
  unit: z.string().max(10).default(""),
  lanes: z.array(z.object({ id: Id, label: Label })).max(20).default([]),
  bars: z.array(z.object({ id: Id, lane: Id, start: z.number(), end: z.number(), label: Short.optional() })).max(200).default([]),
  /** Digital waveforms: value changes over time, e.g. [[0, 0], [2, 1]]. */
  signals: z
    .array(z.object({ id: Id, label: Label, changes: z.array(z.tuple([z.number(), z.union([z.literal(0), z.literal(1)])])).min(1).max(200) }))
    .max(10)
    .default([]),
  markers: z.array(z.object({ id: Id, at: z.number(), label: Short })).max(20).default([]),
});

export const ChartDataSchema = z.object({
  kind: z.enum(["line", "bar", "scatter"]),
  x: z.object({ label: Short.default("") }).default({ label: "" }),
  y: z.object({ label: Short.default("") }).default({ label: "" }),
  series: z
    .array(z.object({ id: Id, label: Label, points: z.array(z.tuple([z.number(), z.number()])).min(1) }))
    .min(1)
    .max(8),
  annotations: z.array(z.object({ id: Id, x: z.number(), y: z.number().optional(), label: Short })).max(20).default([]),
});

const Cell = z.union([z.string().max(60), z.number()]);
export const GridDataSchema = z.object({
  columns: z.array(Short).min(1).max(16),
  rows: z.array(z.object({ label: Short.optional(), cells: z.array(Cell) })).min(1).max(32),
  /** Highlighted areas, e.g. K-map loops: cells as [row, col], 0-based. */
  groups: z
    .array(z.object({ id: Id, cells: z.array(z.tuple([z.number().int().min(0), z.number().int().min(0)])).min(1), label: Short.optional() }))
    .max(16)
    .default([]),
});

export interface TreeNode {
  id: string;
  label: string;
  note?: string;
  /** Attack trees: how the children combine. */
  gate?: "and" | "or";
  children?: TreeNode[];
}
const TreeNodeSchema: z.ZodType<TreeNode> = z.lazy(() =>
  z.object({
    id: Id,
    label: Label,
    note: z.string().max(200).optional(),
    gate: z.enum(["and", "or"]).optional(),
    children: z.array(TreeNodeSchema).max(12).optional(),
  }),
);
export const TreeDataSchema = z.object({
  orientation: z.enum(["down", "right"]).default("down"),
  root: TreeNodeSchema,
});

/* ---------- plot (matplotlib / Desmos-style graphs) ---------- */

const Num = z.number().finite();
const Pt = z.tuple([Num, Num]);
const Expr = z.string().min(1).max(500);
const Range = z.tuple([Num, Num]);
const traceBase = { id: Id, label: Title80.optional(), color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional() };

export const PlotTraceSchema = z.discriminatedUnion("kind", [
  z.object({ ...traceBase, kind: z.literal("function"), expr: Expr, domain: Range.optional(), dash: z.boolean().optional() }),
  z.object({ ...traceBase, kind: z.literal("parametric"), x: Expr, y: Expr, t: Range }),
  z.object({ ...traceBase, kind: z.literal("scatter"), points: z.array(Pt).min(1).max(2000), groups: z.array(z.number().int().min(0).max(7)).optional(), labels: z.array(Short).optional(), size: z.number().min(1).max(12).optional() }),
  z.object({ ...traceBase, kind: z.literal("line"), points: z.array(Pt).min(2).max(2000), dash: z.boolean().optional() }),
  z.object({ ...traceBase, kind: z.literal("step"), points: z.array(Pt).min(2).max(2000) }),
  z.object({ ...traceBase, kind: z.literal("bar"), x: z.array(z.union([Num, Short])).min(1).max(100), y: z.array(Num).min(1).max(100) }),
  z.object({ ...traceBase, kind: z.literal("histogram"), values: z.array(Num).min(1).max(5000), bins: z.number().int().min(1).max(100).optional() }),
  z.object({ ...traceBase, kind: z.literal("area"), expr: Expr, expr2: Expr.optional(), domain: Range.optional() }),
  z.object({ ...traceBase, kind: z.literal("errorbar"), points: z.array(z.tuple([Num, Num, Num])).min(1).max(500) }),
  z.object({ ...traceBase, kind: z.literal("vline"), at: Num }),
  z.object({ ...traceBase, kind: z.literal("hline"), at: Num }),
  z.object({ ...traceBase, kind: z.literal("region"), axis: z.enum(["x", "y"]), from: Num, to: Num }),
  z.object({ ...traceBase, kind: z.literal("arrow"), from: Pt, to: Pt }),
  z.object({ ...traceBase, kind: z.literal("text"), at: Pt, text: z.string().min(1).max(80) }),
  z.object({ ...traceBase, kind: z.literal("heatmap"), expr: Expr.optional(), z: z.array(z.array(Num)).optional(), x: Range, y: Range, contours: z.number().int().min(0).max(20).optional(), resolution: z.number().int().min(10).max(120).optional() }),
]);
export type PlotTrace = z.output<typeof PlotTraceSchema>;

const Axis = z.object({ label: Title80.default(""), min: Num.optional(), max: Num.optional(), log: z.boolean().optional() });
export const PlotDataSchema = z.object({
  title: Title80.optional(),
  x: Axis.default({ label: "" }),
  y: Axis.default({ label: "" }),
  equal: z.boolean().optional(),
  /** Desmos-style sliders; expressions may use these names. */
  params: z.array(z.object({ name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,11}$/), label: Short.optional(), min: Num, max: Num, step: Num.positive().optional(), value: Num })).max(6).default([]),
  traces: z.array(PlotTraceSchema).min(1).max(30),
});
export type PlotData = z.output<typeof PlotDataSchema>;

/** Checks every expression of a plot against its variables; reports through `issue`. */
function checkPlot(p: PlotData, issue: (m: string) => void, where = "") {
  const params = p.params.map((x) => x.name);
  for (const x of p.params) if (!(x.min < x.max) || x.value < x.min || x.value > x.max) issue(`${where}slider "${x.name}": need min < max and min ≤ value ≤ max`);
  const ex = (src: string | undefined, vars: string[], what: string) => {
    if (!src) return;
    const e = checkExpr(src, [...vars, ...params]);
    if (e) issue(`${where}${what}: ${e}`);
  };
  const ids = new Set<string>();
  for (const t of p.traces) {
    if (ids.has(t.id)) issue(`${where}duplicate trace id "${t.id}"`);
    ids.add(t.id);
    if (t.kind === "function") ex(t.expr, ["x"], `trace "${t.id}"`);
    if (t.kind === "area") (ex(t.expr, ["x"], `trace "${t.id}"`), ex(t.expr2, ["x"], `trace "${t.id}" expr2`));
    if (t.kind === "parametric") (ex(t.x, ["t"], `trace "${t.id}" x`), ex(t.y, ["t"], `trace "${t.id}" y`));
    if (t.kind === "heatmap") {
      if (!t.expr && !t.z) issue(`${where}heatmap "${t.id}" needs expr (of x, y) or z (a grid)`);
      ex(t.expr, ["x", "y"], `heatmap "${t.id}"`);
    }
    if (t.kind === "bar" && t.x.length !== t.y.length) issue(`${where}bar "${t.id}": x and y need the same length`);
    if (t.kind === "scatter" && t.groups && t.groups.length !== t.points.length) issue(`${where}scatter "${t.id}": one group per point`);
  }
  return ids;
}

/* ---------- simulations (inputs; the engines live in sims.ts) ---------- */

const GridCell = z.tuple([z.number().int().min(0), z.number().int().min(0)]);
const GridWorldSchema = {
  rows: z.number().int().min(1).max(12),
  cols: z.number().int().min(1).max(12),
  walls: z.array(GridCell).max(60).optional(),
  terminals: z.array(z.object({ cell: GridCell, reward: Num })).min(1).max(10),
  stepReward: Num.optional(),
  gamma: z.number().min(0).max(1),
  noise: z.number().min(0).max(1).optional(),
  start: GridCell.optional(),
};
export const SimSchema = z.discriminatedUnion("sim", [
  z.object({ sim: z.literal("kmeans"), input: z.object({ points: z.array(Pt).min(1).max(500), k: z.number().int().min(1).max(8), init: z.array(Pt).optional(), maxIter: z.number().int().min(1).max(50).optional() }) }),
  z.object({
    sim: z.literal("scheduling"),
    input: z.object({
      processes: z.array(z.object({ id: Short, arrival: z.number().int().min(0), burst: z.number().int().min(1), priority: z.number().int().optional() })).min(1).max(12),
      algorithm: z.enum(["fcfs", "sjf", "srtf", "rr", "priority", "priority-preemptive"]),
      quantum: z.number().int().min(1).max(20).optional(),
    }),
  }),
  z.object({ sim: z.literal("gradient"), input: z.object({ f: Expr, x0: Num, lr: z.number().positive().max(10), steps: z.number().int().min(1).max(200).optional() }) }),
  z.object({ sim: z.literal("value-iteration"), input: z.object(GridWorldSchema) }),
  z.object({
    sim: z.literal("q-learning"),
    input: z.object({ ...GridWorldSchema, alpha: z.number().min(0).max(1), epsilon: z.number().min(0).max(1), episodes: z.number().int().min(1).max(2000), seed: z.number().int().optional(), maxSteps: z.number().int().min(1).max(1000).optional() }),
  }),
]);

/* ---------- lesson: a page of blocks ---------- */

const Tex = z.string().min(1).max(2000);
export const LessonBlockSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), md: z.string().min(1).max(6000) }),
  z.object({
    kind: z.literal("formula"),
    /** LaTeX. Mark explained parts with \term{id}{...}. */
    tex: Tex,
    terms: z.array(z.object({ id: Id, label: Short, note: z.string().max(300).optional() })).max(12).default([]),
    where: z.array(z.object({ sym: z.string().min(1).max(60), meaning: z.string().min(1).max(200) })).max(12).default([]),
  }),
  z.object({
    kind: z.literal("trace"),
    title: Title80.optional(),
    vars: z.array(z.object({ name: z.string().min(1).max(20), label: Short.optional() })).min(1).max(12),
    steps: z
      .array(z.object({ text: z.string().min(1).max(400), tex: Tex.optional(), state: z.record(z.string(), z.union([Num, z.string().max(80)])), highlight: z.array(z.string()).max(12).default([]) }))
      .min(1)
      .max(60),
  }),
  z.strictObject({
    kind: z.literal("motion"),
    mode: z.enum(["flow", "reveal", "compare"]),
    title: Title80.optional(),
    items: z.array(z.strictObject({ id: Id, label: Label, detail: z.string().trim().min(1).max(180).optional() })).min(2).max(8),
    steps: z.array(z.strictObject({ focus: Id, text: z.string().trim().min(1).max(300) })).min(2).max(12),
  }),
  z.object({ kind: z.literal("plot"), ...PlotDataSchema.shape }),
  z.object({ kind: z.literal("sim"), title: Title80.optional(), sim: z.enum(["kmeans", "scheduling", "gradient", "value-iteration", "q-learning"]), input: z.record(z.string(), z.unknown()) }),
  z.object({ kind: z.literal("visual"), ref: Id }),
  z.object({ kind: z.literal("check"), q: z.string().min(1).max(500), a: z.string().min(1).max(2000) }),
  z.object({ kind: z.literal("html"), html: z.string().min(1).max(400_000), height: z.number().int().min(120).max(1600).optional() }),
]);
export type LessonBlock = z.output<typeof LessonBlockSchema>;
export const LessonDataSchema = z.object({ blocks: z.array(LessonBlockSchema).min(1).max(40) });
export const HtmlDataSchema = z.object({ html: z.string().min(1).max(400_000), height: z.number().int().min(120).max(1600).optional() });

/* ---------- visual ---------- */

const MAX_TREE_NODES = 80;
const MAX_TREE_DEPTH = 7;
const MAX_POINTS = 500;

const common = {
  id: Id,
  title: z.string().trim().min(1).max(100),
  /** Topic id in the same learning item (optional). */
  topic: Id.nullable().default(null),
  steps: z
    .array(z.object({ text: z.string().max(300), highlight: z.array(z.string()).max(50).default([]) }))
    .max(40)
    .default([]),
  /** highlight: everything visible, step elements lit. build: elements appear when first highlighted. */
  step_mode: z.enum(["highlight", "build"]).default("highlight"),
  author: z.string().default(""),
  created: IsoDate,
  updated: IsoDate,
};

export const VisualSchema = z
  .discriminatedUnion("type", [
    z.object({ ...common, type: z.literal("state"), data: StateDataSchema }),
    z.object({ ...common, type: z.literal("gantt"), data: GanttDataSchema }),
    z.object({ ...common, type: z.literal("chart"), data: ChartDataSchema }),
    z.object({ ...common, type: z.literal("grid"), data: GridDataSchema }),
    z.object({ ...common, type: z.literal("tree"), data: TreeDataSchema }),
    z.object({ ...common, type: z.literal("plot"), data: PlotDataSchema }),
    z.object({ ...common, type: z.literal("lesson"), data: LessonDataSchema }),
    z.object({ ...common, type: z.literal("html"), data: HtmlDataSchema }),
    z.object({ ...common, type: z.literal("scene"), data: SceneSchema }),
  ])
  .superRefine((v, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    const ids = new Set<string>();
    const add = (id: string) => {
      if (ids.has(id)) issue(`duplicate element id "${id}"`);
      ids.add(id);
    };

    if (v.type === "state") {
      v.data.states.forEach((s) => add(s.id));
      const states = new Set(v.data.states.map((s) => s.id));
      for (const t of v.data.transitions) {
        add(t.id);
        for (const end of [t.from, t.to]) if (!states.has(end)) issue(`transition "${t.id}": unknown state "${end}"`);
      }
      if (v.data.states.filter((s) => s.initial).length > 1) issue("only one state can be initial");
    } else if (v.type === "gantt") {
      const d = v.data;
      if (!d.lanes.length && !d.signals.length) issue("gantt needs lanes (with bars) or signals");
      d.lanes.forEach((l) => add(l.id));
      const lanes = new Set(d.lanes.map((l) => l.id));
      for (const b of d.bars) {
        add(b.id);
        if (!lanes.has(b.lane)) issue(`bar "${b.id}": unknown lane "${b.lane}"`);
        if (!(b.end > b.start)) issue(`bar "${b.id}": end must be after start`);
      }
      d.signals.forEach((s) => add(s.id));
      d.markers.forEach((m) => add(m.id));
    } else if (v.type === "chart") {
      v.data.series.forEach((s) => add(s.id));
      v.data.annotations.forEach((a) => add(a.id));
      const points = v.data.series.reduce((n, s) => n + s.points.length, 0);
      if (points > MAX_POINTS) issue(`too many points (${points} > ${MAX_POINTS})`);
    } else if (v.type === "grid") {
      const { columns, rows, groups } = v.data;
      rows.forEach((r, i) => {
        if (r.cells.length !== columns.length) issue(`row ${i}: ${r.cells.length} cells, expected ${columns.length} (one per column)`);
        r.cells.forEach((_, j) => ids.add(`r${i}c${j}`));
      });
      for (const g of groups) {
        add(g.id);
        for (const [r, c] of g.cells) {
          if (r >= rows.length || c >= columns.length) issue(`group "${g.id}": cell [${r}, ${c}] is outside the grid`);
        }
      }
    } else if (v.type === "plot") {
      for (const id of checkPlot(v.data, issue)) ids.add(id);
    } else if (v.type === "lesson") {
      if (v.steps.length) issue("a lesson has no top-level steps: put steps inside trace blocks");
      v.data.blocks.forEach((b, i) => {
        const at = `block ${i + 1} (${b.kind}): `;
        if (b.kind === "plot") checkPlot(b, issue, at);
        if (b.kind === "formula") {
          const used = [...b.tex.matchAll(/\\term\{([^}]*)\}/g)].map((m) => m[1]!);
          for (const u of used) if (!b.terms.some((t) => t.id === u)) issue(`${at}\\term{${u}} has no entry in terms`);
          for (const t of b.terms) if (!used.includes(t.id)) issue(`${at}term "${t.id}" is not marked in tex with \\term{${t.id}}{...}`);
          if (/\\(href|url|html(Id|Class|Style|Data)|includegraphics)\b/.test(b.tex)) issue(`${at}links, images and raw HTML commands are not allowed in formulas`);
        }
        if (b.kind === "trace") {
          const names = new Set(b.vars.map((x) => x.name));
          b.steps.forEach((s, j) => {
            for (const k of [...Object.keys(s.state), ...s.highlight]) if (!names.has(k)) issue(`${at}step ${j + 1}: unknown variable "${k}" (declare it in vars)`);
          });
        }
        if (b.kind === "motion") {
          const itemIds = new Set<string>();
          for (const item of b.items) {
            if (itemIds.has(item.id)) issue(`${at}duplicate motion item "${item.id}"`);
            itemIds.add(item.id);
          }
          b.steps.forEach((step, j) => {
            if (!itemIds.has(step.focus)) issue(`${at}step ${j + 1}: unknown motion item "${step.focus}"`);
            if (j > 0 && b.steps[j - 1]?.focus === step.focus) issue(`${at}step ${j + 1}: choose a different focus or merge this explanation into the previous step`);
          });
        }
        if (b.kind === "sim") {
          const r = SimSchema.safeParse({ sim: b.sim, input: b.input });
          if (!r.success) issue(`${at}${r.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")}`);
          else if (b.sim === "gradient") {
            const e = checkExpr((b.input as { f: string }).f, ["x"]);
            if (e) issue(`${at}f: ${e}`);
          }
        }
      });
    } else if (v.type === "scene") {
      if (v.steps.length) issue("A scene defines its own beats");
    } else if (v.type === "html") {
      if (v.steps.length) issue("an html visual has no steps");
    } else {
      let count = 0;
      const walk = (n: TreeNode, depth: number) => {
        count++;
        add(n.id);
        if (depth > MAX_TREE_DEPTH) issue(`tree deeper than ${MAX_TREE_DEPTH} levels at "${n.id}"`);
        for (const c of n.children ?? []) walk(c, depth + 1);
      };
      walk(v.data.root, 1);
      if (count > MAX_TREE_NODES) issue(`too many tree nodes (${count} > ${MAX_TREE_NODES})`);
    }

    v.steps.forEach((s, i) => {
      for (const id of s.highlight) if (!ids.has(id)) issue(`step ${i + 1}: unknown element id "${id}"`);
    });
  });

export type Visual = z.output<typeof VisualSchema>;
export type VisualSummary = Pick<Visual, "id" | "title" | "type" | "topic" | "updated"> & { steps: number };
/** What an AI (or a test) sends. `data` is validated per type by core. */
export interface VisualInput {
  id?: string;
  title: string;
  type: VisualType;
  topic?: string | null;
  data: unknown;
  steps?: { text: string; highlight?: string[] }[];
  step_mode?: "highlight" | "build";
}

/* ---------- examples: served to AI by visual_formats, and used as test fixtures ---------- */

export const VISUAL_EXAMPLES: Record<VisualType, { use_for: string; ids: string; example: VisualInput }> = {
  scene: {
    use_for: "One timed, interactive scene composed of typed visual panels",
    ids: "Entity IDs link beats, tracks, controls and inspect terms",
    example: {id:"motion-example",title:"Move a point",type:"scene",data:{
      schema_version:1,style:"minimal-technical",duration_ms:3000,
      panels:[{id:"model",kind:"diagram",label:"Model"},{id:"terms",kind:"inspect",label:"x = position"}],
      entities:[{id:"dot",panel:"model",kind:"point",x:10,y:50,label:"Point",tone:"primary"}],
      beats:[{id:"start",at_ms:0,label:"Start",text:"The point starts at the left."},{id:"end",at_ms:2300,label:"Stop",text:"The point has reached its destination."}],
      tracks:[{entity:"dot",property:"x",frames:[{at_ms:0,value:10},{at_ms:2300,value:85}]}],
      bindings:[{id:"position",panel:"terms",term:"x",target_ids:["dot"],explanation:"Horizontal position of the point."}]
    }},
  },
  state: {
    use_for: "State machines: Moore/Mealy FSM, OS process states, TCP states, protocol phases.",
    ids: "state ids and transition ids",
    example: {
      title: "Moore detector for 11",
      type: "state",
      data: {
        states: [
          { id: "s0", label: "S0", output: "0", initial: true },
          { id: "s1", label: "S1", output: "0" },
          { id: "s2", label: "S2", output: "1", accept: true },
        ],
        transitions: [
          { id: "a", from: "s0", to: "s1", label: "1" },
          { id: "b", from: "s0", to: "s0", label: "0" },
          { id: "c", from: "s1", to: "s2", label: "1" },
          { id: "d", from: "s1", to: "s0", label: "0" },
          { id: "e", from: "s2", to: "s2", label: "1" },
          { id: "f", from: "s2", to: "s0", label: "0" },
        ],
      },
      steps: [
        { text: "Start in S0 (output 0).", highlight: ["s0"] },
        { text: "Input 1 → S1: one 1 seen.", highlight: ["a", "s1"] },
        { text: "Input 1 again → S2: output becomes 1.", highlight: ["c", "s2"] },
      ],
    },
  },
  gantt: {
    use_for: "Timelines: CPU scheduling (FCFS, RR, SJF), incident timelines, project phases; digital timing diagrams via signals.",
    ids: "lane, bar, signal and marker ids",
    example: {
      title: "Round Robin, quantum 2",
      type: "gantt",
      data: {
        unit: "ms",
        lanes: [
          { id: "p1", label: "P1" },
          { id: "p2", label: "P2" },
        ],
        bars: [
          { id: "b1", lane: "p1", start: 0, end: 2 },
          { id: "b2", lane: "p2", start: 2, end: 4 },
          { id: "b3", lane: "p1", start: 4, end: 5 },
        ],
        signals: [{ id: "clk", label: "CLK", changes: [[0, 0], [1, 1], [2, 0], [3, 1], [4, 0], [5, 1]] }],
        markers: [{ id: "m1", at: 5, label: "all done" }],
      },
      steps: [
        { text: "P1 runs for one quantum (2 ms).", highlight: ["b1"] },
        { text: "Quantum over → P2 gets the CPU.", highlight: ["b2"] },
        { text: "P1 finishes its last 1 ms.", highlight: ["b3", "m1"] },
      ],
    },
  },
  chart: {
    use_for: "Charts: elbow/SSE curves, silhouette, k-means scatter (one series per cluster), cash flow (bar, negatives = out).",
    ids: "series ids and annotation ids",
    example: {
      title: "Elbow method",
      type: "chart",
      data: {
        kind: "line",
        x: { label: "k" },
        y: { label: "SSE" },
        series: [{ id: "sse", label: "SSE", points: [[1, 980], [2, 520], [3, 260], [4, 220], [5, 200]] }],
        annotations: [{ id: "elbow", x: 3, y: 260, label: "elbow: k = 3" }],
      },
      steps: [
        { text: "SSE drops fast while k is small.", highlight: ["sse"] },
        { text: "After k = 3 it flattens: that bend is the elbow.", highlight: ["elbow"] },
      ],
    },
  },
  grid: {
    use_for: "Tables: truth tables, K-maps (groups = loops), comparisons (Moore vs Mealy, TCP vs UDP), Q-tables.",
    ids: "cells are r<row>c<col> (0-based) and group ids",
    example: {
      title: "K-map: F = B",
      type: "grid",
      data: {
        columns: ["B=0", "B=1"],
        rows: [
          { label: "A=0", cells: [0, 1] },
          { label: "A=1", cells: [0, 1] },
        ],
        groups: [{ id: "g1", cells: [[0, 1], [1, 1]], label: "B" }],
      },
      steps: [
        { text: "Find the 1s.", highlight: ["r0c1", "r1c1"] },
        { text: "Loop them: A changes, B stays 1 → F = B.", highlight: ["g1"] },
      ],
    },
  },
  tree: {
    use_for: "Trees: mind maps (orientation right), attack trees (gate and/or), decision trees, AD/file/process hierarchies.",
    ids: "node ids",
    example: {
      title: "Attack tree: read the HR database",
      type: "tree",
      data: {
        orientation: "down",
        root: {
          id: "goal",
          label: "Read HR database",
          gate: "or",
          children: [
            { id: "sqli", label: "SQL injection", note: "unpatched search form" },
            {
              id: "creds",
              label: "Use stolen creds",
              gate: "and",
              children: [
                { id: "phish", label: "Phish an admin" },
                { id: "mfa", label: "Bypass MFA" },
              ],
            },
          ],
        },
      },
      steps: [
        { text: "Goal at the top.", highlight: ["goal"] },
        { text: "OR: either path works.", highlight: ["sqli", "creds"] },
        { text: "AND: both are needed for the creds path.", highlight: ["phish", "mfa"] },
      ],
    },
  },
  plot: {
    use_for:
      "Real graphs (matplotlib/Desmos): functions of x with sliders, scatter (groups), line, step, bar, histogram, area/fill-between, error bars, vline/hline, shaded region, arrows, text, heatmap/contour of z=f(x,y). Expressions: + - * / ^, sin cos tan exp ln log sqrt abs min max sigmoid relu normpdf(x,mu,s), pi, e.",
    ids: "trace ids",
    example: {
      title: "Normal distribution: μ and σ",
      type: "plot",
      data: {
        x: { label: "x", min: -6, max: 6 },
        y: { label: "density", min: 0, max: 0.9 },
        params: [
          { name: "mu", label: "μ", min: -3, max: 3, step: 0.1, value: 0 },
          { name: "s", label: "σ", min: 0.5, max: 3, step: 0.1, value: 1 },
        ],
        traces: [
          { id: "pdf", kind: "function", expr: "normpdf(x, mu, s)", label: "N(μ, σ²)" },
          { id: "sd1", kind: "area", expr: "normpdf(x, mu, s)", domain: [-1, 1], label: "≈ 68% (μ ± σ, at μ=0, σ=1)" },
          { id: "mean", kind: "vline", at: 0, label: "μ" },
        ],
      },
      steps: [
        { text: "The bell curve: drag μ to move it, σ to widen it.", highlight: ["pdf"] },
        { text: "About 68% of the area lies within one σ of the mean.", highlight: ["sd1", "mean"] },
      ],
    },
  },
  lesson: {
    use_for:
      "BEST for teaching a topic: a page of blocks — text (Markdown), formula (LaTeX with \\term{id}{...} parts explained), trace (step-by-step with the current value of every variable), motion (guided flow, reveal or compare), plot (as the plot type), sim (the app runs the real algorithm: kmeans, scheduling, gradient, value-iteration, q-learning), visual (embed another visual by id), check (self-test question with hidden answer), html (sandboxed, last resort). Prefer formula/trace/sim over diagrams for maths and algorithms.",
    ids: "lessons have no top-level steps; trace and motion blocks carry their own steps",
    example: {
      title: "K-means clustering",
      type: "lesson",
      data: {
        blocks: [
          { kind: "text", md: "**K-means** splits points into *K* groups. It repeats two moves until nothing changes: **assign** each point to the nearest centroid, then **update** each centroid to the mean of its points." },
          {
            kind: "formula",
            tex: "\\term{sse}{SSE} = \\sum_{k=1}^{K} \\sum_{x \\in \\term{ck}{C_k}} \\lVert x - \\term{mu}{\\mu_k} \\rVert^2",
            terms: [
              { id: "sse", label: "Sum of squared errors", note: "What k-means makes smaller every round" },
              { id: "ck", label: "Cluster k", note: "The points currently assigned to centroid k" },
              { id: "mu", label: "Centroid k", note: "The mean of the points in cluster k" },
            ],
          },
          {
            kind: "trace",
            title: "By hand: X = (1, 3, 9, 11), K = 2, start at 1 and 3",
            vars: [{ name: "c1" }, { name: "c2" }, { name: "C1" }, { name: "C2" }, { name: "SSE" }],
            steps: [
              { text: "Start: centroids are the first two points.", state: { c1: 1, c2: 3, C1: "–", C2: "–", SSE: "–" }, highlight: ["c1", "c2"] },
              { text: "Assign: 1 is nearest c1; 3, 9, 11 are nearest c2.", state: { c1: 1, c2: 3, C1: "{1}", C2: "{3, 9, 11}", SSE: 100 }, highlight: ["C1", "C2", "SSE"] },
              { text: "Update: c2 moves to the mean (3+9+11)/3.", tex: "c_2 = \\tfrac{3+9+11}{3} \\approx 7.67", state: { c1: 1, c2: 7.67, C1: "{1}", C2: "{3, 9, 11}", SSE: 34.67 }, highlight: ["c2"] },
              { text: "Assign again: 3 is now nearer c1.", state: { c1: 1, c2: 7.67, C1: "{1, 3}", C2: "{9, 11}", SSE: 16.89 }, highlight: ["C1", "C2"] },
              { text: "Update: c1 = 2, c2 = 10. Nothing changes after this: converged.", state: { c1: 2, c2: 10, C1: "{1, 3}", C2: "{9, 11}", SSE: 4 }, highlight: ["c1", "c2", "SSE"] },
            ],
          },
          {
            kind: "motion",
            mode: "flow",
            title: "One clustering iteration",
            items: [
              { id: "assign", label: "Assign", detail: "Choose the nearest centroid for each point." },
              { id: "update", label: "Update", detail: "Recompute the mean of each cluster." },
              { id: "check", label: "Check", detail: "Repeat if assignments still change." },
            ],
            steps: [
              { focus: "assign", text: "Hold the centroids fixed while you assign points." },
              { focus: "update", text: "Hold assignments fixed while you update the centroids." },
              { focus: "check", text: "Stop when assignments are stable." },
            ],
          },
          { kind: "sim", title: "Try it: change K and step through", sim: "kmeans", input: { points: [[1, 2], [1.5, 1.8], [5, 8], [8, 8], [1, 0.6], [9, 11], [8, 2], [10, 2], [9, 3]], k: 3 } },
          {
            kind: "plot",
            title: "Elbow: SSE vs K",
            x: { label: "K" },
            y: { label: "SSE" },
            traces: [
              { id: "sse", kind: "line", points: [[1, 68], [2, 4], [3, 2], [4, 0]], label: "SSE" },
              { id: "elbow", kind: "text", at: [2, 10], text: "elbow at K = 2" },
            ],
          },
          { kind: "check", q: "Why is the lowest SSE not the best K?", a: "SSE keeps falling as K grows (K = number of points gives SSE 0). Pick the elbow, where adding a cluster stops helping much." },
        ],
      },
    },
  },
  html: {
    use_for:
      "Last resort for something the native types can't show. Self-contained HTML/CSS/JS shown in a sandbox with NO network: inline everything. Optional local libraries: <script src=\"/vendor/chart.umd.js\">, /vendor/d3.min.js, /vendor/plotly-basic.min.js. Costs many more tokens than a lesson.",
    ids: "no steps",
    example: {
      title: "Sine wave animation",
      type: "html",
      data: {
        height: 240,
        html: "<canvas id=c width=600 height=200></canvas><script>const c=document.getElementById('c').getContext('2d');let t=0;(function f(){c.clearRect(0,0,600,200);c.beginPath();for(let x=0;x<600;x++)c.lineTo(x,100+60*Math.sin(x/40+t));c.strokeStyle='#38bdf8';c.stroke();t+=0.05;requestAnimationFrame(f)})()</script>",
      },
    },
  },
};

/** Compact format guide for AI clients (visual_formats tool). */
export function visualFormat(type?: VisualType) {
  if (!type) {
    return {
      types: Object.fromEntries(VISUAL_TYPES.map((t) => [t, VISUAL_EXAMPLES[t].use_for])),
      next: "Call visual_formats with a type to get its fields and an example.",
    };
  }
  const { use_for, ids, example } = VISUAL_EXAMPLES[type];
  return {
    type,
    use_for,
    steps:
      type === "lesson" || type === "html"
        ? ids
        : `Optional walkthrough: steps: [{text, highlight: [element ids]}]. Element ids here: ${ids}. step_mode "build" reveals elements step by step.`,
    ...(type === "lesson"
      ? {
          authoring: {
            workflow: [
              "Read the learning item and target topic. State one concrete outcome and ground facts in material the learner provided or a named source you can verify.",
              "Use a short idea block, a worked example or one interactive block, then a self-check with the reason. Use precise text so motion is not needed to understand the step.",
              "Prefer native blocks over HTML. Use trace for variable values, plot for real curves, and sim for algorithms the app can run.",
              "Call save_visual with the correct topic only after reviewing facts and references. Read the saved visual back to check the result when appropriate.",
            ],
            motion_shape: '{kind:"motion", mode, title?, items:[{id,label,detail?}], steps:[{focus,text}]}',
            limits: "2–8 unique items; 2–12 steps; focus uses an item id, and neighbouring steps need different focus. Text only: no HTML, CSS, scripts, URLs or custom animation commands.",
            motion_modes: {
              flow: "Show a process in the order of items; move focus through the stages.",
              reveal: "Build the structure in step order; introduce each idea when it first matters.",
              compare: "Show the previous and current items side by side. On each step explain what changed and why.",
            },
          },
          sims: {
            kmeans: "{points: [[x,y],...], k, init?: [[x,y],...], maxIter?}",
            scheduling: "{processes: [{id, arrival, burst, priority?}], algorithm: fcfs|sjf|srtf|rr|priority|priority-preemptive, quantum?}",
            gradient: "{f: expression of x, x0, lr, steps?}",
            "value-iteration": "{rows, cols, walls?: [[r,c]], terminals: [{cell: [r,c], reward}], stepReward?, gamma, noise?}",
            "q-learning": "{...value-iteration fields, start?: [r,c], alpha, epsilon, episodes, seed?}",
          },
        }
      : {}),
    example: { title: example.title, type: example.type, data: example.data, steps: example.steps },
  };
}
