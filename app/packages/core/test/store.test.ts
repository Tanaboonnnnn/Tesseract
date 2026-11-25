import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BrainError, resolveDataDir, Store } from "../src/index.ts";
import { makeStore, NOW, tempDataDir } from "./helpers.ts";

/** Assert a BrainError with the given code. */
function expectError(fn: () => unknown, code: BrainError["code"], message?: RegExp) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(BrainError);
    expect((e as BrainError).code).toBe(code);
    if (message) expect((e as Error).message).toMatch(message);
    return;
  }
  throw new Error(`expected BrainError ${code}`);
}

describe("sample data", () => {
  // read-only: uses the real data folder
  const store = new Store({ agent: "test", now: NOW, dataDir: resolveDataDir() });

  it("is fully valid", () => {
    expect(store.validateAll()).toEqual([]);
  });

  it("loads every entity type", () => {
    expect(store.listGoals().map((g) => g.id)).toEqual(["full-stack-developer"]);
    expect(store.listProjects().map((p) => [p.id, p.progress])).toEqual([["weather-app", 25]]);
    expect(store.listLearning().map((l) => l.id)).toEqual(["kubernetes", "operating-systems"]);
    expect(store.listAssessments()).toHaveLength(1);
    expect(store.listNotes()).toHaveLength(1);
    expect(store.getTaxonomy()).toHaveLength(9);
  });

  it("computes goal progress from linked projects and learning", () => {
    // weather-app 25% + kubernetes 25% (1/4 understood)
    expect(store.getGoal("full-stack-developer").progress).toBe(25);
  });

  it("builds the review queue", () => {
    const queue = store.getReviewQueue();
    expect(queue.map((q) => `${q.learning_id}#${q.topic.id}`)).toEqual(["kubernetes#deployments"]);
    expect(queue[0]!.topic.review.reasons).toEqual(["stale", "weak"]);
    expect(queue[0]!.topic.effective_status).toBe("needs-review");
  });

  it("computes skill levels from assessments", () => {
    // 82 × medium 0.7 = 57.4, assessed 3 days ago
    const k8s = store.getSkill("kubernetes-ops");
    expect(k8s).toMatchObject({ computed: 57, level: 57, assessments: 1, domain: "cloud-devops" });
    expect(store.getSkill("python").level).toBe(0);
  });
});

describe("store construction", () => {
  it("requires an agent name", () => {
    expectError(() => new Store({ agent: " ", dataDir: tempDataDir() }), "VALIDATION");
  });
});

describe("projects & tasks", () => {
  it("adds a task with the next id and logs the agent", () => {
    const store = makeStore({ agent: "claude-code" });
    const task = store.addTask("weather-app", { title: "Write docs", priority: "low", phase: "build" });
    expect(task).toMatchObject({ id: "t-005", status: "todo", done_at: null });
    expect(store.getProject("weather-app").tasks).toHaveLength(5);
    const [entry] = store.listActivity();
    expect(entry).toMatchObject({ agent: "claude-code", action: "create", summary: "add task t-005: Write docs" });
  });

  it("sets done_at when a task is done and clears it when reopened", () => {
    const store = makeStore();
    expect(store.updateTask("weather-app", "t-002", { status: "done" }).done_at).toBe("2026-11-23");
    expect(store.getProject("weather-app").progress).toBe(50);
    expect(store.updateTask("weather-app", "t-002", { status: "doing" }).done_at).toBeNull();
  });

  it("rejects invalid input without writing anything", () => {
    const store = makeStore();
    expectError(() => store.addTask("weather-app", { title: "x", priority: "asap" as never }), "VALIDATION");
    expectError(() => store.addTask("weather-app", { title: "x", phase: "deploy" }), "VALIDATION", /phases are/);
    expect(store.listActivity()).toEqual([]);
  });

  it("creates a project with defaults and initial tasks", () => {
    const store = makeStore();
    const p = store.createProject({ id: "exam-notes", title: "Exam notes", tasks: [{ title: "A" }, { title: "B", status: "done" }] });
    expect(p).toMatchObject({ template: "general", phase: "ideation", progress: 50, created: "2026-11-23" });
    expect(p.tasks.map((t) => t.id)).toEqual(["t-001", "t-002"]);
    expectError(() => store.createProject({ id: "exam-notes", title: "Again" }), "CONFLICT");
  });

  it("rejects unknown goals and bad ids", () => {
    const store = makeStore();
    expectError(() => store.createProject({ id: "x", title: "X", goal: "nope" }), "VALIDATION", /Unknown goal/);
    expectError(() => store.createProject({ id: "Bad Id", title: "X" }), "VALIDATION");
    expectError(() => store.getProject("../goals"), "VALIDATION");
    expectError(() => store.getProject("missing"), "NOT_FOUND");
  });

  it("updates a project and keeps the body", () => {
    const store = makeStore();
    const p = store.updateProject("weather-app", { phase: "test", progress_override: 70 });
    expect(p).toMatchObject({ phase: "test", progress: 70, body: "A small weather dashboard: forecast API, charts, phone layout." });
    expectError(() => store.updateProject("weather-app", { phases: ["a", "b"] }), "VALIDATION");
  });

  it("deletes a task", () => {
    const store = makeStore();
    store.deleteTask("weather-app", "t-001");
    expect(store.getProject("weather-app").tasks.map((t) => t.id)).toEqual(["t-002", "t-003", "t-004"]);
    expectError(() => store.deleteTask("weather-app", "t-001"), "NOT_FOUND");
  });
});

describe("learning & topics", () => {
  it("creates a roadmap with topics in one change", () => {
    const store = makeStore();
    const l = store.createLearning({
      id: "linux",
      title: "Linux",
      type: "roadmap",
      goal: "full-stack-developer",
      phases: ["basics", "admin"],
      topics: [
        { id: "shell", title: "Shell", skills: ["bash-scripting"] },
        { id: "users", title: "Users", phase: "admin", depends_on: ["shell"], skills: ["linux-administration"] },
      ],
    });
    expect(l.topics.map((t) => [t.id, t.phase])).toEqual([
      ["shell", "basics"],
      ["users", "admin"],
    ]);
    expect(store.listActivity()).toHaveLength(1);
  });

  it("rejects unknown skills, phases and dependencies", () => {
    const store = makeStore();
    const base = { id: "x", title: "X", type: "roadmap" as const, phases: ["p1"] };
    expectError(() => store.createLearning({ ...base, topics: [{ id: "a", title: "A", skills: ["nope"] }] }), "VALIDATION", /unknown skill/);
    expectError(() => store.createLearning({ ...base, topics: [{ id: "a", title: "A", phase: "p9" }] }), "VALIDATION");
    expectError(() => store.createLearning({ ...base, topics: [{ id: "a", title: "A", depends_on: ["b"] }] }), "VALIDATION");
  });

  it("marks a topic reviewed today when studied", () => {
    const store = makeStore();
    const t = store.updateTopic("kubernetes", "deployments", { status: "understood" });
    expect(t).toMatchObject({ last_reviewed: "2026-11-23", status: "understood" });
    // still weak (last score 55) → still needs review
    expect(t.review.reasons).toEqual(["weak"]);
  });

  it("adds a topic", () => {
    const store = makeStore();
    const t = store.addTopic("kubernetes", { id: "secrets", title: "Secrets", phase: "security" });
    expect(t.status).toBe("not-started");
    expectError(() => store.addTopic("kubernetes", { id: "secrets", title: "Again" }), "VALIDATION", /unique/);
  });

  it("stores course fields only for courses", () => {
    const store = makeStore();
    const os = store.getLearning("operating-systems");
    expect(os.exams?.[0]).toMatchObject({ id: "midterm", weight: 30 });
    expect(store.getLearning("kubernetes").exams).toBeUndefined();
  });
});

describe("assessments", () => {
  it("records an assessment and updates linked topics", () => {
    const store = makeStore();
    const a = store.recordAssessment({
      title: "Lab: Network Policies",
      source: "lab",
      skills: { "kubernetes-ops": 0.6, "network-security": 0.4 },
      score: 90,
      difficulty: "hard",
      topic_refs: ["learning/kubernetes#network-policies"],
    });
    expect(a.id).toBe("2026-11-23-lab-network-policies");
    const topic = store.getLearning("kubernetes").topics.find((t) => t.id === "network-policies")!;
    expect(topic).toMatchObject({ status: "learning", last_score: 90, last_reviewed: "2026-11-23" });
    expect(store.getSkill("network-security").level).toBe(90);
    expect(store.listActivity()[0]!.files).toHaveLength(2);
  });

  it("rejects unknown skills, bad weights and unknown topics", () => {
    const store = makeStore();
    const base = { title: "Q", source: "ai-quiz" as const, score: 50, difficulty: "easy" as const };
    expectError(() => store.recordAssessment({ ...base, skills: { nope: 1 } }), "VALIDATION");
    expectError(() => store.recordAssessment({ ...base, skills: { python: 0.5 } }), "VALIDATION", /sum to 1/);
    expectError(
      () => store.recordAssessment({ ...base, skills: { python: 1 }, topic_refs: ["learning/kubernetes#nope"] }),
      "VALIDATION",
    );
    expect(store.listActivity()).toEqual([]);
  });
});

describe("AI skill adjustments — no flattering", () => {
  const evidence = ["assessments/2026-11-20-ai-quiz-pods"];

  it("allows a decrease without evidence", () => {
    const store = makeStore({ agent: "claude" });
    const s = store.adjustSkill({ skill: "kubernetes-ops", delta: -10, reason: "Confused Pods with Deployments" });
    expect(s).toMatchObject({ computed: 57, adjustment: -10, level: 47 });
    expect(s.adjustments[0]).toMatchObject({ agent: "claude", delta: -10 });
  });

  it("requires existing evidence to increase", () => {
    const store = makeStore();
    const reason = "Explained the pod lifecycle in depth";
    expectError(() => store.adjustSkill({ skill: "kubernetes-ops", delta: 5, reason }), "RULE", /evidence/);
    expectError(
      () => store.adjustSkill({ skill: "kubernetes-ops", delta: 5, reason, evidence: ["notes/nope"] }),
      "RULE",
      /does not exist/,
    );
    expect(store.adjustSkill({ skill: "kubernetes-ops", delta: 5, reason, evidence }).level).toBe(62);
  });

  it("keeps the total within ±15", () => {
    const store = makeStore();
    const reason = "Strong answers across several sessions";
    store.adjustSkill({ skill: "kubernetes-ops", delta: 10, reason, evidence });
    expectError(() => store.adjustSkill({ skill: "kubernetes-ops", delta: 6, reason, evidence }), "RULE", /±15/);
    expectError(() => store.adjustSkill({ skill: "kubernetes-ops", delta: 20, reason, evidence }), "VALIDATION");
  });

  it("requires a real reason", () => {
    const store = makeStore();
    expectError(() => store.adjustSkill({ skill: "kubernetes-ops", delta: -5, reason: "meh" }), "VALIDATION");
  });
});

describe("notes", () => {
  it("creates and updates a note", () => {
    const store = makeStore();
    store.createNote({ id: "tcp-handshake", title: "TCP handshake", body: "SYN, SYN-ACK, ACK", links: ["skills/network-protocols"] });
    const n = store.updateNote("tcp-handshake", { type: "log" });
    expect(n).toMatchObject({ type: "log", body: "SYN, SYN-ACK, ACK" });
    expect(store.listNotes({ type: "log" })).toHaveLength(1);
  });
});

describe("inbox", () => {
  it("lists and reads raw files, refusing path tricks", () => {
    const store = makeStore();
    writeFileSync(join(store.dataDir, "inbox", "ctf-01.txt"), "flag{...}");
    expect(store.listInbox().map((f) => f.name)).toEqual(["ctf-01.txt"]);
    expect(store.readInbox("ctf-01.txt")).toBe("flag{...}");
    expectError(() => store.readInbox("../SPEC.md"), "VALIDATION");
    expectError(() => store.readInbox(".gitkeep"), "VALIDATION");
  });
});

describe("activity log & undo", () => {
  it("undoes a change", () => {
    const store = makeStore();
    const file = join(store.dataDir, "projects/weather-app/tasks.yaml");
    const before = readFileSync(file, "utf8");
    store.addTask("weather-app", { title: "Temp" });
    const [entry] = store.listActivity();
    store.undo(entry!.id);
    expect(readFileSync(file, "utf8")).toBe(before);
    expect(store.listActivity()[0]).toMatchObject({ action: "undo" });
  });

  it("undoing a create removes the files", () => {
    const store = makeStore();
    store.createNote({ id: "temp", title: "Temp" });
    store.undo(store.listActivity()[0]!.id);
    expectError(() => store.getNote("temp"), "NOT_FOUND");
  });

  it("refuses to undo when the file changed since", () => {
    const store = makeStore();
    store.addTask("weather-app", { title: "One" });
    const first = store.listActivity()[0]!.id;
    store.addTask("weather-app", { title: "Two" });
    expectError(() => store.undo(first), "CONFLICT", /undo the newer change first/);
  });

  it("keeps only the last N changes", () => {
    const store = makeStore({ activityLimit: 20 });
    for (let i = 0; i < 25; i++) store.addTask("weather-app", { title: `T${i}` });
    const log = store.listActivity(100);
    expect(log).toHaveLength(20);
    expect(log[0]!.summary).toMatch(/T24$/);
  });

  it("skips no-op writes", () => {
    const store = makeStore();
    store.updateProject("weather-app", {});
    store.updateProject("weather-app", { phase: "build" }); // already build
    store.updateTask("weather-app", "t-002", { status: "doing" }); // already doing
    store.updateTopic("kubernetes", "pods", { title: "Pods" });
    store.updateNote("why-typescript-monorepo", {});
    store.upsertGoal({ id: "full-stack-developer", title: "Full-Stack Developer" });
    expect(store.listActivity()).toEqual([]);
  });
});

describe("git history (optional)", () => {
  it("commits each change with the agent name", () => {
    const dir = tempDataDir();
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
    git("init", "-q");
    git("config", "core.autocrlf", "false");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    git("add", "-A");
    git("commit", "-q", "-m", "init");
    const store = new Store({ dataDir: dir, agent: "codex", now: NOW, gitCommit: true });
    store.addTask("weather-app", { title: "Via git" });
    expect(git("log", "-1", "--format=%s").trim()).toBe("[codex] add task t-005: Via git");
  });
});
