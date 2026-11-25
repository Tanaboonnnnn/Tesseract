import { describe, expect, it } from "vitest";
import { learningMap } from "../src/index.ts";
import { makeStore } from "./helpers.ts";

describe("learningMap", () => {
  it("turns phases into columns, topics into cards and depends_on into links", () => {
    const store = makeStore();
    const m = learningMap(store.getLearning("kubernetes"));
    // operations phase has no topics → no empty column
    expect(m.lanes).toEqual(["basics", "workloads", "networking", "security"]);
    expect(m.nodes.map((n) => [n.id, n.lane, n.effective_status])).toEqual([
      ["pods", "basics", "done"],
      ["deployments", "workloads", "review"], // "learning", but last reviewed 22 days ago at 55% → honest: needs review
      ["network-policies", "networking", "planned"],
      ["rbac", "security", "planned"],
    ]);
    expect(m.edges).toEqual([
      { from: "pods", to: "deployments", label: "" },
      { from: "pods", to: "network-policies", label: "" },
      { from: "pods", to: "rbac", label: "" },
    ]);
    expect(m.focus).toBe("deployments");
    expect(m.summary).toEqual({ parts: 4, done: 1, building: 0, review: 1, focus: { id: "deployments", label: "Deployments" } });
  });

  it("prefers the topic being learned, then the next ready one", () => {
    const store = makeStore();
    store.updateTopic("kubernetes", "deployments", { status: "understood", last_score: 90, last_reviewed: "2026-11-23" });
    const next = learningMap(store.getLearning("kubernetes"));
    expect(next.summary.done).toBe(2);
    expect(next.focus).toBe("network-policies"); // first not-started topic whose prerequisites are understood

    store.updateTopic("kubernetes", "rbac", { status: "learning", last_reviewed: "2026-11-23" });
    const now = learningMap(store.getLearning("kubernetes"));
    expect(now.nodes.find((n) => n.id === "rbac")!.effective_status).toBe("building");
    expect(now.focus).toBe("rbac");
  });

  it("has no focus when everything is understood", () => {
    const store = makeStore();
    for (const t of ["pods", "deployments", "network-policies", "rbac"]) {
      store.updateTopic("kubernetes", t, { status: "understood", last_score: 95, last_reviewed: "2026-11-23" });
    }
    const m = learningMap(store.getLearning("kubernetes"));
    expect(m.summary.done).toBe(4);
    expect(m.focus).toBeNull();
  });
});

describe("learningMap ordering", () => {
  it("puts prerequisites first inside a column", () => {
    const store = makeStore();
    store.addTopic("kubernetes", { id: "rbac-audit", title: "RBAC audit", phase: "security" });
    store.updateTopic("kubernetes", "rbac", { depends_on: ["pods", "rbac-audit"] });
    const m = learningMap(store.getLearning("kubernetes"));
    expect(m.nodes.filter((n) => n.lane === "security").map((n) => n.id)).toEqual(["rbac-audit", "rbac"]);
  });
});
