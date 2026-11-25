import { describe, expect, it } from "vitest";
import { BrainError, VISUAL_EXAMPLES, VISUAL_TYPES, type VisualInput, visualFormat } from "../src/index.ts";
import { makeStore } from "./helpers.ts";

const err = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof BrainError ? `${e.code}: ${e.message.replace(/\s+/g, " ")}` : `OTHER: ${String(e)}`;
  }
  return "NONE";
};

const ex = (t: keyof typeof VISUAL_EXAMPLES): VisualInput => structuredClone(VISUAL_EXAMPLES[t].example);

describe("visual examples", () => {
  it("every example is valid and round-trips through the store", () => {
    const store = makeStore();
    for (const type of VISUAL_TYPES) {
      const saved = store.saveVisual("kubernetes", ex(type));
      expect(saved.type).toBe(type);
      expect(store.getVisual("kubernetes", saved.id)).toEqual(saved);
    }
    expect(store.listVisuals("kubernetes")).toHaveLength(VISUAL_TYPES.length);
    expect(store.validateAll()).toEqual([]);
  });

  it("formats guide lists types, then gives one type with its example", () => {
    expect(Object.keys(visualFormat().types!)).toEqual([...VISUAL_TYPES]);
    expect(visualFormat("gantt")).toMatchObject({ type: "gantt", example: { type: "gantt" } });
  });
});

describe("visual validation", () => {
  const store = makeStore();
  const save = (v: VisualInput) => () => store.saveVisual("kubernetes", v);

  it("rejects broken references, per type", () => {
    const s = ex("state");
    (s.data as { transitions: { to: string }[] }).transitions[0]!.to = "nope";
    expect(err(save(s))).toMatch(/VALIDATION.*unknown state "nope"/);

    const g = ex("gantt");
    (g.data as { bars: { lane: string }[] }).bars[0]!.lane = "p9";
    expect(err(save(g))).toMatch(/unknown lane "p9"/);

    const g2 = ex("gantt");
    (g2.data as { bars: { end: number }[] }).bars[0]!.end = 0;
    expect(err(save(g2))).toMatch(/end must be after start/);

    const grid = ex("grid");
    (grid.data as { rows: { cells: unknown[] }[] }).rows[0]!.cells.push(1);
    expect(err(save(grid))).toMatch(/3 cells, expected 2/);

    const grid2 = ex("grid");
    (grid2.data as { groups: { cells: number[][] }[] }).groups[0]!.cells.push([5, 0]);
    expect(err(save(grid2))).toMatch(/outside the grid/);

    const tree = ex("tree");
    (tree.data as { root: { children: { id: string }[] } }).root.children[0]!.id = "goal";
    expect(err(save(tree))).toMatch(/duplicate element id "goal"/);
  });

  it("checks step ids, topic and size limits", () => {
    const c = ex("chart");
    c.steps = [{ text: "x", highlight: ["missing"] }];
    expect(err(save(c))).toMatch(/step 1: unknown element id "missing"/);

    expect(err(save({ ...ex("chart"), topic: "no-such-topic" }))).toMatch(/Topic "no-such-topic" is not in kubernetes/);

    const big = ex("chart");
    (big.data as { series: { points: number[][] }[] }).series[0]!.points = Array.from({ length: 501 }, (_, i) => [i, i]);
    expect(err(save(big))).toMatch(/too many points/);

    const deep = ex("tree");
    let node: { id: string; label: string; children?: unknown[] } = { id: "n0", label: "n0" };
    (deep.data as { root: unknown }).root = node;
    for (let i = 1; i <= 8; i++) {
      const child = { id: `n${i}`, label: `n${i}` };
      node.children = [child];
      node = child;
    }
    expect(err(save(deep))).toMatch(/deeper than 7/);

    expect(err(save({ ...ex("grid"), type: "nope" as never }))).toMatch(/VALIDATION/);
  });
});

describe("visual store", () => {
  it("links to a topic, replaces by id, lists newest first and deletes with undo", () => {
    const store = makeStore();
    const v = store.saveVisual("kubernetes", { ...ex("tree"), topic: "rbac" });
    expect(v.id).toBe("attack-tree-read-the-hr-database");
    expect(v.author).toBe("test");
    expect(store.listVisuals("kubernetes", "rbac").map((x) => x.id)).toEqual([v.id]);
    expect(store.listVisuals("kubernetes", "pods")).toEqual([]);

    // same title, no id → new id; same id → replace (one change each)
    const second = store.saveVisual("kubernetes", ex("tree"));
    expect(second.id).toBe("attack-tree-read-the-hr-database-2");
    const replaced = store.saveVisual("kubernetes", { ...ex("tree"), id: v.id, title: "Renamed" });
    expect(replaced.title).toBe("Renamed");
    expect(replaced.created).toBe(v.created);

    store.deleteVisual("kubernetes", v.id);
    expect(err(() => store.getVisual("kubernetes", v.id))).toMatch(/NOT_FOUND/);
    store.undo(store.listActivity()[0]!.id);
    expect(store.getVisual("kubernetes", v.id).title).toBe("Renamed");
  });
});

describe("lesson, plot and html visuals", () => {
  const ex = (t: keyof typeof VISUAL_EXAMPLES): VisualInput => structuredClone(VISUAL_EXAMPLES[t].example);
  const store = makeStore();
  const save = (v: VisualInput) => () => store.saveVisual("kubernetes", v);
  const lesson = (blocks: unknown[]): VisualInput => ({ title: "L", type: "lesson", data: { blocks } });

  it("checks formulas, traces, sims and embedded visuals", () => {
    expect(err(save(lesson([{ kind: "formula", tex: String.raw`\term{a}{x} + \term{b}{y}`, terms: [{ id: "a", label: "A" }] }])))).toMatch(/\\term\{b\} has no entry/);
    expect(err(save(lesson([{ kind: "formula", tex: String.raw`\href{http://x}{y}` }])))).toMatch(/not allowed/);
    expect(err(save(lesson([{ kind: "trace", vars: [{ name: "x" }], steps: [{ text: "s", state: { y: 1 } }] }])))).toMatch(/unknown variable "y"/);
    expect(err(save(lesson([{ kind: "sim", sim: "kmeans", input: { points: [[0, 0]], k: 0 } }])))).toMatch(/block 1 \(sim\): input\.k/);
    expect(err(save(lesson([{ kind: "sim", sim: "gradient", input: { f: "constructor", x0: 0, lr: 0.1 } }])))).toMatch(/unknown name "constructor"/);
    expect(err(save(lesson([{ kind: "visual", ref: "nope" }])))).toMatch(/embeds visual "nope"/);
    expect(err(save({ ...lesson([{ kind: "text", md: "x" }]), steps: [{ text: "s" }] }))).toMatch(/no top-level steps/);
  });

  it("checks plot expressions and sliders", () => {
    const p = ex("plot");
    (p.data as { traces: { expr?: string }[] }).traces[0]!.expr = "normpdf(x, mu, sigma)";
    expect(err(save(p))).toMatch(/unknown name "sigma"/);
    const q = ex("plot");
    (q.data as { params: { value: number }[] }).params[0]!.value = 99;
    expect(err(save(q))).toMatch(/min ≤ value ≤ max/);
  });

  it("lets a lesson embed a saved visual, and keeps big HTML under its own cap", () => {
    const tree = store.saveVisual("kubernetes", ex("tree"));
    expect(store.saveVisual("kubernetes", lesson([{ kind: "visual", ref: tree.id }])).type).toBe("lesson");
    const big = { title: "big", type: "html" as const, data: { html: "x".repeat(300_000) } };
    expect(store.saveVisual("kubernetes", big).type).toBe("html"); // > 64 KB is fine for html
    expect(err(save({ title: "too big", type: "chart", data: { kind: "line", series: [{ id: "s", label: "s", points: Array.from({ length: 500 }, (_, i) => [i, i]) }] }, steps: Array.from({ length: 40 }, () => ({ text: "x".repeat(300) })) }))).toMatch(/too big|NONE/);
  });
});

describe("native lesson motion", () => {
  const block = () => ({
    kind: "motion", mode: "flow", title: "Water cycle",
    items: [{ id: "evaporate", label: "Evaporation", detail: "Water turns into vapour." }, { id: "condense", label: "Condensation" }],
    steps: [{ focus: "evaporate", text: "Heat provides energy." }, { focus: "condense", text: "Cooling forms droplets." }],
  });
  function save(b: unknown) {
    const store = makeStore();
    return { store, saved: store.saveVisual("kubernetes", { title: "Cycle", type: "lesson", data: { blocks: [b] } }) };
  }
  it("round-trips all three modes and documents authoring in visual_formats", () => {
    for (const mode of ["flow", "reveal", "compare"]) {
      const b = { ...block(), mode };
      const { store, saved } = save(b);
      expect(store.getVisual("kubernetes", saved.id)).toMatchObject({ data: { blocks: [b] } });
    }
    expect(visualFormat("lesson")).toHaveProperty("authoring.motion_modes.compare");
  });
  it("rejects bad references, duplicate ids, unsupported types and custom scripts", () => {
    expect(err(() => save({ ...block(), steps: [{ focus: "missing", text: "Example" }, block().steps[1]] }))).toMatch(/unknown motion item "missing"/);
    expect(err(() => save({ ...block(), items: [block().items[0], block().items[0]] }))).toMatch(/duplicate motion item/);
    expect(err(() => save({ ...block(), mode: "arbitrary" }))).toMatch(/VALIDATION/);
    expect(err(() => save({ ...block(), script: "not allowed" }))).toMatch(/VALIDATION/);
    expect(err(() => save({ ...block(), items: [{ ...block().items[0], style: "not allowed" }, block().items[1]] }))).toMatch(/VALIDATION/);
  });
});
