import { describe, expect, it } from "vitest";
import { BrainError, type ProjectMapInput } from "../src/index.ts";
import { makeStore } from "./helpers.ts";

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof BrainError ? `${e.code}: ${e.message.replace(/\s+/g, " ")}` : "OTHER";
  }
  return "NONE";
};

// Sample tasks: t-001 done, t-002 doing, t-003 todo, t-004 review
const MAP: ProjectMapInput = {
  lanes: ["input", "core", "output"],
  focus: "agent-core",
  nodes: [
    { id: "repo", label: "Repository", lane: "input", tasks: ["t-001"] },
    { id: "agent-core", label: "Agent core", lane: "core", tasks: ["t-002"] },
    { id: "rules", label: "Detection rules", lane: "core", tasks: ["t-003"] },
    { id: "log-tests", label: "Real log tests", lane: "output", tasks: ["t-004"], note: "Use Windows event logs" },
    { id: "report", label: "Incident report", lane: "output" },
  ],
  edges: [
    { from: "repo", to: "agent-core" },
    { from: "agent-core", to: "rules", label: "events" },
    { from: "rules", to: "log-tests" },
  ],
};

describe("system map", () => {
  it("draws a map and derives honest status from linked tasks", () => {
    const store = makeStore({ agent: "codex" });
    expect(store.getProjectMap("weather-app")).toBeNull();
    const m = store.setProjectMap("weather-app", MAP);
    expect(m.nodes.map((n) => [n.id, n.effective_status, n.progress])).toEqual([
      ["repo", "done", 100],
      ["agent-core", "building", 0],
      ["rules", "planned", 0],
      ["log-tests", "building", 0],
      ["report", "planned", null],
    ]);
    expect(m.summary).toEqual({ parts: 5, done: 1, building: 2, blocked: 0, focus: { id: "agent-core", label: "Agent core" } });
    expect(store.listActivity()[0]).toMatchObject({ agent: "codex", entity: "projects/weather-app", summary: "draw map of weather-app (5 parts)" });
    expect(store.validateAll()).toEqual([]);
  });

  it("follows task changes without touching the map", () => {
    const store = makeStore();
    store.setProjectMap("weather-app", MAP);
    store.updateTask("weather-app", "t-002", { status: "done" });
    expect(store.getProjectMap("weather-app")!.nodes[1]!.effective_status).toBe("done");
  });

  it("refuses to mark a part done while its tasks are open", () => {
    const store = makeStore();
    store.setProjectMap("weather-app", MAP);
    expect(codeOf(() => store.updateMapNode("weather-app", "rules", { status: "done" }))).toMatch(/^RULE: .*t-003/);
    // a part without tasks can be set by hand; blocked is kept
    expect(store.updateMapNode("weather-app", "report", { status: "done" }).nodes[4]!.effective_status).toBe("done");
    expect(store.updateMapNode("weather-app", "rules", { status: "blocked" }).nodes[2]!.effective_status).toBe("blocked");
  });

  it("does not show done if a task is reopened later", () => {
    const store = makeStore();
    store.setProjectMap("weather-app", { ...MAP, nodes: MAP.nodes!.map((n) => (n.id === "repo" ? { ...n, status: "done" as const } : n)) });
    store.updateTask("weather-app", "t-001", { status: "doing" });
    expect(store.getProjectMap("weather-app")!.nodes[0]!.effective_status).toBe("building");
  });

  it("adds and updates parts, moves the focus, and undoes", () => {
    const store = makeStore();
    store.setProjectMap("weather-app", MAP);
    const added = store.updateMapNode("weather-app", "dashboard", { label: "Dashboard", lane: "output" });
    expect(added.nodes.at(-1)).toMatchObject({ id: "dashboard", effective_status: "planned" });
    expect(store.setMapFocus("weather-app", "rules").summary.focus).toEqual({ id: "rules", label: "Detection rules" });
    expect(store.setMapFocus("weather-app", null).summary.focus).toBeNull();
    store.undo(store.listActivity()[0]!.id);
    expect(store.getProjectMap("weather-app")!.focus).toBe("rules");
    // no-op writes are skipped
    const before = store.listActivity().length;
    store.updateMapNode("weather-app", "dashboard", { label: "Dashboard" });
    expect(store.listActivity()).toHaveLength(before);
  });

  it("rejects broken maps without writing", () => {
    const store = makeStore();
    const bad = (patch: Partial<ProjectMapInput>) => codeOf(() => store.setProjectMap("weather-app", { ...MAP, ...patch }));
    expect(bad({ focus: "nope" })).toMatch(/^VALIDATION: .*focus "nope"/);
    expect(bad({ edges: [{ from: "repo", to: "ghost" }] })).toMatch(/unknown node "ghost"/);
    expect(bad({ edges: [{ from: "repo", to: "repo" }] })).toMatch(/points to itself/);
    expect(bad({ nodes: [{ id: "x", label: "X", lane: "elsewhere" }], edges: [], focus: null })).toMatch(/lane "elsewhere"/);
    expect(bad({ nodes: [{ id: "x", label: "X", lane: "core", tasks: ["t-999"] }], edges: [], focus: null })).toMatch(/unknown task/);
    expect(codeOf(() => store.updateMapNode("weather-app", "x", { label: "X" }))).toMatch(/^NOT_FOUND: .*no map yet/);
    store.setProjectMap("weather-app", MAP);
    expect(codeOf(() => store.updateMapNode("weather-app", "new-part", { label: "New" }))).toMatch(/^VALIDATION/); // lane required
    expect(store.listActivity()).toHaveLength(1);
  });
});
