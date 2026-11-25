import { describe, expect, it } from "vitest";
import { BrainError, quizPublic } from "../src/index.ts";
import { makeStore } from "./helpers.ts";

const SAMPLE = "2026-11-23-kubernetes-deployments";

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof BrainError ? e.code : "OTHER";
  }
  return undefined;
}

const quizInput = {
  title: "TCP basics",
  skills: { "networking-fundamentals": 1 },
  difficulty: "easy" as const,
  questions: [
    { q: "How many steps in the TCP handshake?", choices: ["2", "3", "4"], answer: 1, explain: "SYN, SYN-ACK, ACK" },
    { q: "Which flag starts a connection?", choices: ["FIN", "SYN"], answer: 1 },
  ],
};

describe("quizzes", () => {
  it("loads the sample quiz", () => {
    const store = makeStore();
    expect(store.listQuizzes({ status: "open" }).map((q) => q.id)).toEqual([SAMPLE]);
    expect(store.validateAll()).toEqual([]);
  });

  it("hides answers from open quizzes", () => {
    const store = makeStore();
    const pub = quizPublic(store.getQuiz(SAMPLE));
    expect(pub.questions[0]).toEqual({
      type: "single",
      q: "Which object does a Deployment create directly to run your Pods?",
      choices: ["StatefulSet", "ReplicaSet", "DaemonSet", "Job"],
    });
    expect(JSON.stringify(pub)).not.toContain("explain");
  });

  it("creates a quiz authored by the agent", () => {
    const store = makeStore({ agent: "claude-code" });
    const q = store.createQuiz(quizInput);
    expect(q).toMatchObject({ id: "2026-11-23-tcp-basics", status: "open", author: "claude-code", assessment: null });
    expect(store.listActivity()[0]!.summary).toBe("create quiz 2026-11-23-tcp-basics (2 questions)");
  });

  it("rejects bad quizzes", () => {
    const store = makeStore();
    expect(code(() => store.createQuiz({ ...quizInput, skills: { nope: 1 } }))).toBe("VALIDATION");
    expect(code(() => store.createQuiz({ ...quizInput, questions: [{ q: "x", choices: ["a", "b"], answer: 2 }] }))).toBe(
      "VALIDATION",
    );
    expect(code(() => store.createQuiz({ ...quizInput, questions: [{ q: "x", choices: ["only"], answer: 0 }] }))).toBe(
      "VALIDATION",
    );
    expect(code(() => store.createQuiz({ ...quizInput, topic_refs: ["learning/kubernetes#nope"] }))).toBe("VALIDATION");
    expect(store.listActivity()).toEqual([]);
  });

  it("grades a submission and records a web-quiz assessment in one change", () => {
    const store = makeStore();
    const before = store.getSkill("kubernetes-ops").level;
    const r = store.submitQuiz(SAMPLE, [1, 1, 0, 0]); // last one wrong
    expect(r).toMatchObject({ score: 75, correct: 3, total: 4 });
    expect(r.results.map((x) => x.correct)).toEqual([true, true, true, false]);
    expect(r.assessment).toMatchObject({ source: "web-quiz", score: 75, raw: `quizzes/${SAMPLE}.yaml` });
    expect(r.assessment.body).toContain("Correct: securityContext.runAsNonRoot set to true");

    const topic = store.getLearning("kubernetes").topics.find((t) => t.id === "deployments")!;
    expect(topic).toMatchObject({ last_score: 75, last_reviewed: "2026-11-23" });
    expect(topic.review.reasons).toEqual([]); // fresh and ≥ 60 → off the review queue

    expect(store.getQuiz(SAMPLE)).toMatchObject({ status: "done", assessment: SAMPLE });
    expect(store.getSkill("kubernetes-ops").level).not.toBe(before);

    const [entry] = store.listActivity();
    expect(entry!.summary).toBe(`submit quiz ${SAMPLE} (75)`);
    expect(entry!.files.sort()).toEqual([
      `assessments/${SAMPLE}.md`,
      "learning/kubernetes/topics.yaml",
      `quizzes/${SAMPLE}.yaml`,
    ]);
  });

  it("allows one attempt only", () => {
    const store = makeStore();
    store.submitQuiz(SAMPLE, [1, 1, 0, 1]);
    expect(code(() => store.submitQuiz(SAMPLE, [1, 1, 0, 1]))).toBe("CONFLICT");
  });

  it("validates answers", () => {
    const store = makeStore();
    expect(code(() => store.submitQuiz(SAMPLE, [1, 1]))).toBe("VALIDATION");
    expect(code(() => store.submitQuiz(SAMPLE, [1, 1, 0, 9]))).toBe("VALIDATION");
    expect(code(() => store.submitQuiz(SAMPLE, [1, 1, 0, "1"]))).toBe("VALIDATION");
    expect(code(() => store.submitQuiz(SAMPLE, "nope"))).toBe("VALIDATION");
    expect(store.listActivity()).toEqual([]);
  });

  it("undoing a submission reopens the quiz and removes the assessment", () => {
    const store = makeStore();
    store.submitQuiz(SAMPLE, [1, 1, 0, 1]);
    store.undo(store.listActivity()[0]!.id);
    expect(store.getQuiz(SAMPLE).status).toBe("open");
    expect(code(() => store.getAssessment(SAMPLE))).toBe("NOT_FOUND");
  });

  it("grades select-all and typed answers honestly", () => {
    const store = makeStore();
    store.createQuiz({
      ...quizInput,
      id: "mixed",
      questions: [
        { type: "multi", q: "Which are TCP flags?", choices: ["SYN", "ACK", "PING", "FIN"], answers: [0, 1, 3] },
        { type: "multi", q: "Which are UDP features?", choices: ["Connectionless", "Retransmits"], answers: [0] },
        { type: "short", q: "Port of HTTPS?", accept: ["443"] },
        { type: "short", q: "Layer of IP?", accept: ["network layer", "layer 3"] },
        { type: "short", q: "SSE for k=2?", accept: ["34.67"], tolerance: 0.01 },
        { q: "Old style (no type) still works", choices: ["a", "b"], answer: 0 },
      ],
    });
    const pub = quizPublic(store.getQuiz("mixed"));
    expect(pub.questions[2]).toEqual({ type: "short", q: "Port of HTTPS?" }); // accepted answers stay hidden
    expect(JSON.stringify(pub)).not.toMatch(/answers|accept|tolerance/);

    const r = store.submitQuiz("mixed", [[3, 1, 0], [0, 1], " 443 ", "Network  Layer.", "34.666", 0]);
    expect(r.results.map((x) => x.correct)).toEqual([true, false, true, true, true, true]); // partial multi = wrong
    expect(r).toMatchObject({ correct: 5, total: 6, score: 83 });
    expect(r.assessment.body).toContain("Your answer: Connectionless; Retransmits (wrong)");
    expect(r.assessment.body).toContain("Correct: Connectionless");
  });

  it("rejects malformed new-style questions and answers", () => {
    const store = makeStore();
    const bad = (question: object) => code(() => store.createQuiz({ ...quizInput, id: "x", questions: [question] }));
    expect(bad({ type: "multi", q: "x", choices: ["a", "b"], answers: [2] })).toBe("VALIDATION");
    expect(bad({ type: "multi", q: "x", choices: ["a", "b"], answers: [0, 0] })).toBe("VALIDATION");
    expect(bad({ type: "short", q: "x", accept: [] })).toBe("VALIDATION");
    expect(bad({ type: "essay", q: "x" })).toBe("VALIDATION");

    store.createQuiz({ ...quizInput, id: "y", questions: [{ type: "multi", q: "x", choices: ["a", "b"], answers: [0] }, { type: "short", q: "y", accept: ["z"] }] });
    expect(code(() => store.submitQuiz("y", [0, "z"]))).toBe("VALIDATION"); // multi needs a list
    expect(code(() => store.submitQuiz("y", [[0], "  "]))).toBe("VALIDATION"); // empty text
    expect(code(() => store.submitQuiz("y", [[5], "z"]))).toBe("VALIDATION");
  });
});
