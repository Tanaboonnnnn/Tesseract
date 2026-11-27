import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BrainError, VISUAL_EXAMPLES } from "../src/index.ts";
import { makeStore } from "./helpers.ts";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof BrainError ? e.code : "OTHER";
  }
  return "NONE";
};

describe("delete project", () => {
  it("removes the folder and links to it in one undoable change", () => {
    const store = makeStore();
    store.setProjectMap("weather-app", { lanes: ["core"], nodes: [{ id: "engine", label: "Engine", lane: "core", tasks: ["t-002"] }] });
    store.addEvent({ title: "Work on lab", date: "2026-11-24", links: ["projects/weather-app"] });

    const impact = store.deleteImpact("projects", "weather-app");
    expect(impact).toMatchObject({ ref: "projects/weather-app", counts: { map: 1 }, quizzes: [] });
    expect(impact.counts.tasks).toBeGreaterThan(0);
    expect(impact.unlinked).toHaveLength(2);
    expect(impact.unlinked).toContain("notes/why-typescript-monorepo");
    expect(impact.unlinked.some((u) => u.startsWith("schedule/"))).toBe(true);
    expect(existsSync(join(store.dataDir, "projects/weather-app"))).toBe(true); // preview writes nothing

    store.deleteEntity("projects", "weather-app");
    expect(code(() => store.getProject("weather-app"))).toBe("NOT_FOUND");
    expect(existsSync(join(store.dataDir, "projects/weather-app"))).toBe(false);
    expect(store.getNote("why-typescript-monorepo").links).toEqual([]);
    expect(store.listEvents().flatMap((e) => e.links)).not.toContain("projects/weather-app");
    expect(store.validateAll()).toEqual([]);

    store.undo(store.listActivity()[0]!.id);
    expect(store.getProject("weather-app").tasks.length).toBe(impact.counts.tasks);
    expect(store.getProjectMap("weather-app")?.nodes).toHaveLength(1);
    expect(store.getNote("why-typescript-monorepo").links).toEqual(["projects/weather-app"]);
  });

  it("fails cleanly for an unknown id", () => {
    expect(code(() => makeStore().deleteEntity("projects", "nope"))).toBe("NOT_FOUND");
  });
});

describe("delete learning", () => {
  it("removes topics and visuals, open quizzes on it; keeps finished quizzes and assessments", () => {
    const store = makeStore();
    store.saveVisual("kubernetes", VISUAL_EXAMPLES.tree.example);
    const done = store.createQuiz({
      title: "Pods",
      difficulty: "easy",
      skills: { "kubernetes-ops": 1 },
      topic_refs: ["learning/kubernetes#pods"],
      questions: [{ q: "A pod is…", choices: ["a", "b"], answer: 0 }],
    });
    store.submitQuiz(done.id, [0]);
    const assessments = store.listAssessments().length;

    const impact = store.deleteImpact("learning", "kubernetes");
    expect(impact.counts).toEqual({ topics: 4, visuals: 1 });
    expect(impact.quizzes).toEqual(["2026-11-23-kubernetes-deployments"]); // the open one only

    store.deleteEntity("learning", "kubernetes");
    expect(store.listLearning().map((l) => l.id)).not.toContain("kubernetes");
    expect(store.listQuizzes().map((q) => q.id)).toEqual([done.id]);
    expect(store.listAssessments().length).toBe(assessments);
    expect(store.validateAll()).toEqual([]);

    store.undo(store.listActivity()[0]!.id);
    expect(store.listVisuals("kubernetes")).toHaveLength(1);
    expect(store.listQuizzes({ status: "open" }).map((q) => q.id)).toEqual(["2026-11-23-kubernetes-deployments"]);
  });
});

describe("delete standalone quizzes and notes", () => {
  it("deletes and restores an open quiz without creating an assessment", () => {
    const store = makeStore();
    const id = "2026-11-23-kubernetes-deployments";
    const quiz = store.getQuiz(id);
    store.deleteQuiz(id);
    expect(code(() => store.getQuiz(id))).toBe("NOT_FOUND");
    expect(code(() => store.getAssessment(id))).toBe("NOT_FOUND");
    expect(store.listActivity()[0]).toMatchObject({ action: "delete", entity: "quizzes/" + id });
    store.undo(store.listActivity()[0]!.id);
    expect(store.getQuiz(id)).toEqual(quiz);
  });

  it("preserves completed quiz evidence and skill levels after deletion", () => {
    const store = makeStore();
    const quiz = store.createQuiz({
      title: "Practice",
      difficulty: "easy",
      skills: { "kubernetes-ops": 1 },
      questions: [{ q: "Pick A", choices: ["A", "B"], answer: 0 }],
    });
    const { assessment } = store.submitQuiz(quiz.id, [0]);
    const profile = store.getSkillProfile();
    store.deleteQuiz(quiz.id);
    expect(code(() => store.getQuiz(quiz.id))).toBe("NOT_FOUND");
    expect(store.getAssessment(assessment.id)).toEqual(assessment);
    expect(store.getSkillProfile()).toEqual(profile);
    store.undo(store.listActivity()[0]!.id);
    expect(store.getQuiz(quiz.id).status).toBe("done");
  });

  it("deletes a note and unlinks structured references in one undoable change", () => {
    const store = makeStore();
    const id = "why-typescript-monorepo";
    const note = store.getNote(id);
    const ref = "notes/" + id;
    const related = store.createNote({ id: "related", title: "Related", type: "note", links: [ref], body: "See the original." });
    const event = store.addEvent({ title: "Review note", date: "2026-11-24", links: [ref] });
    store.deleteNote(id);
    expect(code(() => store.getNote(id))).toBe("NOT_FOUND");
    expect(store.getNote(related.id)).toMatchObject({ body: related.body, links: [] });
    expect(store.listEvents().find((e) => e.id === event.id)?.links).toEqual([]);
    expect(store.validateAll()).toEqual([]);
    expect(store.listActivity()[0]).toMatchObject({ action: "delete", entity: ref });
    store.undo(store.listActivity()[0]!.id);
    expect(store.getNote(id)).toEqual(note);
    expect(store.getNote(related.id)).toEqual(related);
    expect(store.listEvents().find((e) => e.id === event.id)).toEqual(event);
  });
});
