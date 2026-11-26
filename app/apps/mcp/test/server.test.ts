import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ClassroomStore, resolveDataDir, Store } from "@tesseract/core";
import { afterEach, describe, expect, it } from "vitest";
import { createServer, REMOTE_TOOLS, type ServerOptions } from "../src/server.ts";

const NOW = () => new Date(2026, 10, 23, 12, 0, 0);

function tempDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "tesseract-mcp-"));
  cpSync(resolveDataDir(), dir, { recursive: true });
  return dir;
}

const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
});

async function connect(agent = "claude-code", options: ServerOptions = {}) {
  const store = new Store({ dataDir: tempDataDir(), agent, now: NOW });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(store, options).connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  clients.push(client);

  /** Call a tool; parse JSON on success, return the error text on failure. */
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    const text = res.content[0]!.text;
    return res.isError ? { error: text } : JSON.parse(text);
  };
  return { client, store, call };
}

describe("tool list", () => {
  it("exposes every SPEC §5 tool with server instructions", async () => {
    const { client } = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "add_task", "add_topic", "adjust_skill_level", "create_course", "create_note", "create_project", "create_quiz", "list_quizzes",
        "create_roadmap", "delete_task", "generate_quiz_context", "get_activity", "get_learning", "get_note",
        "get_overview", "get_project", "get_review_queue", "get_skill_profile", "list_assessments", "list_goals",
        "list_inbox", "list_learning", "list_notes", "list_projects", "read_inbox", "record_assessment", "search",
        "update_learning", "update_note", "update_project", "update_task", "update_topic", "undo_change", "upsert_goal",
        "get_schedule", "add_event", "update_event", "delete_event", "sync_calendar",
        "get_project_map", "set_project_map", "update_map_node", "set_map_focus",
        "visual_formats", "save_visual", "get_visuals", "delete_visual",
        "list_published_courses", "get_published_course", "get_course_lesson", "get_course_visuals", "get_course_revision_anchor", "get_course_activity",
      ].sort(),
    );
    expect(client.getInstructions()).toMatch(/get_overview/);
  });

  it("sends a slim tool list (no per-tool boilerplate)", async () => {
    const { client } = await connect();
    const json = JSON.stringify((await client.listTools()).tools);
    expect(json).not.toContain("$schema");
    expect(json).not.toContain("taskSupport");
    expect(json).not.toContain("kebab-case id");
    expect(client.getInstructions()).toMatch(/kebab-case/);
  });
});

describe("remote profile", () => {
  it("lists only the allow-list: no deletes, undo, skill or inbox tools", async () => {
    const store = new Store({ dataDir: tempDataDir(), agent: "remote-chatgpt", now: NOW });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "1" });
    clients.push(client);
    await createServer(store, { profile: "remote" }).connect(a);
    await client.connect(b);
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual([...REMOTE_TOOLS].sort());
    for (const bad of ["delete_task", "delete_event", "delete_visual", "undo_change", "adjust_skill_level", "record_assessment", "read_inbox", "set_project_map"]) {
      expect(names).not.toContain(bad);
    }
    expect(client.getInstructions()).toMatch(/connected remotely/);
    for (const bad of ["create_course", "publish_course", "restore_course"]) expect(names).not.toContain(bad);
    const payload = (await client.callTool({name:"classroom_format", arguments:{}})).content as {text:string}[];
    const {example} = JSON.parse(payload[0]!.text);
    const receipt = await client.callTool({name:"submit_course_draft", arguments:{request_id:"remote-draft-path",bundle:example}});
    expect(receipt.isError).not.toBe(true);
    expect(JSON.stringify(receipt.content)).toContain("staged");
    const published = await client.callTool({name:"list_published_courses",arguments:{}});
    expect(published.content).toEqual([{type:"text",text:"[]"}]);

    // a blocked tool can't be called either
    const res = await client.callTool({ name: "delete_task", arguments: { project: "weather-app", task: "t-001" } });
    expect(res.isError).toBe(true);
    expect(store.getProject("weather-app").tasks.some((t) => t.id === "t-001")).toBe(true);

    // an allowed write is logged under the remote agent
    await client.callTool({ name: "add_task", arguments: { project: "weather-app", title: "From the phone" } });
    expect(store.listActivity()[0]!.agent).toBe("remote-chatgpt");
  });
});

describe("visuals", () => {
  it("guides the AI to the format, saves, lists and reports precise errors", async () => {
    const { call } = await connect();
    const guide = await call("visual_formats", {});
    expect(Object.keys(guide.types)).toEqual(["state", "gantt", "chart", "grid", "tree", "plot", "lesson", "html", "scene", "iso"]);
    const { example } = await call("visual_formats", { type: "chart" });

    const saved = await call("save_visual", { learning: "kubernetes", topic: "pods", ...example });
    expect(saved).toMatchObject({ saved: "learning/kubernetes/visuals/elbow-method", type: "chart", topic: "pods", steps: 2 });
    expect((await call("get_visuals", { learning: "kubernetes" })).map((v: { id: string }) => v.id)).toEqual(["elbow-method"]);
    expect((await call("get_visuals", { learning: "kubernetes", id: "elbow-method" })).author).toBe("claude-code");

    const bad = await call("save_visual", { learning: "kubernetes", title: "x", type: "chart", data: { kind: "line", series: [] } });
    expect(bad.error).toMatch(/VALIDATION/);

    expect(await call("delete_visual", { learning: "kubernetes", id: "elbow-method" })).toEqual({ deleted: "elbow-method" });

    const lesson = await call("visual_formats", { type: "lesson" });
    expect(lesson.sims).toBeDefined();
    const savedLesson = await call("save_visual", { learning: "kubernetes", topic: "pods", ...lesson.example });
    expect(savedLesson).toMatchObject({ type: "lesson", topic: "pods" });
  });
});

describe("overview", () => {
  it("gives a compact picture of everything", async () => {
    const { call } = await connect();
    const o = await call("get_overview");
    expect(o.today).toBe("2026-11-23");
    expect(o.projects[0]).toMatchObject({ id: "weather-app", progress: 25, tasks: { todo: 1, doing: 1, review: 1, done: 1 } });
    expect(o.review_queue.top[0]).toMatchObject({ ref: "learning/kubernetes#deployments", reasons: ["stale", "weak"] });
    expect(o.skills).toHaveLength(9);
    expect(o.data_problems).toBe(0);
    expect(o.quizzes_open).toEqual([
      { id: "2026-11-23-kubernetes-deployments", title: "Kubernetes Deployments", questions: 4, author: "claude-code" },
    ]);
    // sample tasks are due in early 2026 → all overdue
    expect(o.tasks_due.every((t: { overdue: boolean }) => t.overdue)).toBe(true);
  });

  it("searches across entities", async () => {
    const { call } = await connect();
    const r = await call("search", { query: "dashboard" });
    expect(r.hits.map((h: { ref: string }) => h.ref)).toContain("projects/weather-app");
  });
});

describe("SPEC example: Kubernetes roadmap for Full-Stack Developer", () => {
  it("works end to end", async () => {
    const { call } = await connect("chatgpt");

    // 1. read related context
    expect((await call("list_goals"))[0].id).toBe("full-stack-developer");

    // 2–3. create the plan
    const roadmap = await call("create_roadmap", {
      id: "k8s-security",
      title: "Kubernetes Security",
      goal: "full-stack-developer",
      phases: ["architecture", "workloads", "access-control", "network", "runtime"],
      topics: [
        { id: "control-plane", title: "Control plane", skills: ["kubernetes-ops"] },
        { id: "pod-security", title: "Pod Security Standards", phase: "workloads", depends_on: ["control-plane"], skills: ["kubernetes-ops", "containers"] },
        { id: "rbac", title: "RBAC", phase: "access-control", depends_on: ["control-plane"], skills: ["kubernetes-ops", "identity-access-management"] },
        { id: "netpol", title: "Network Policies", phase: "network", skills: ["kubernetes-ops", "network-security"] },
        { id: "falco", title: "Runtime detection with Falco", phase: "runtime", skills: ["kubernetes-ops", "web-apis"] },
      ],
    });
    expect(roadmap).toMatchObject({ id: "k8s-security", topics: 5, progress: 0 });

    // 5. learn a topic → record evidence → progress + level update
    await call("update_topic", { learning: "k8s-security", topic: "control-plane", status: "understood" });
    const a = await call("record_assessment", {
      title: "Quiz: RBAC",
      source: "ai-quiz",
      skills: { "kubernetes-ops": 0.5, "identity-access-management": 0.5 },
      score: 85,
      difficulty: "medium",
      topic_refs: ["learning/k8s-security#rbac"],
      body: "Q1 ... A1 ... Analysis: solid on Roles vs ClusterRoles.",
    });
    expect(a.id).toBe("2026-11-23-quiz-rbac");

    const l = await call("get_learning", { id: "k8s-security" });
    expect(l.progress).toBe(20);
    expect(l.topics.find((t: { id: string }) => t.id === "rbac")).toMatchObject({ status: "learning", last_score: 85 });

    const domain = await call("get_skill_profile", { domain: "security" });
    expect(domain.skills.find((s: { id: string }) => s.id === "identity-access-management").level).toBe(60); // 85 × 0.7

    // goal progress now includes the new roadmap
    expect((await call("list_goals"))[0].progress).toBeGreaterThan(0);

    // every change is attributed
    const activity = await call("get_activity");
    expect(activity.map((e: { agent: string }) => e.agent)).toEqual(["chatgpt", "chatgpt", "chatgpt"]);
  });
});

describe("projects & tasks", () => {
  it("creates, updates and deletes tasks", async () => {
    const { call } = await connect();
    const p = await call("create_project", { id: "ctf-team", title: "CTF Team", tasks: [{ title: "Register" }] });
    expect(p).toMatchObject({ id: "ctf-team", progress: 0 });
    const t = await call("add_task", { project: "ctf-team", title: "Practice web", priority: "high", due: "2026-11-25" });
    expect(t.id).toBe("t-002");
    expect((await call("update_task", { project: "ctf-team", task: "t-001", status: "done" })).done_at).toBe("2026-11-23");
    expect((await call("get_project", { id: "ctf-team" })).progress).toBe(50);
    await call("delete_task", { project: "ctf-team", task: "t-002" });
    expect((await call("get_project", { id: "ctf-team" })).tasks).toHaveLength(1);
    expect((await call("update_project", { id: "ctf-team", phase: "build" })).phase).toBe("build");
  });

  it("returns readable errors the AI can fix", async () => {
    const { call } = await connect();
    expect(await call("get_project", { id: "nope" })).toEqual({ error: expect.stringMatching(/^\[NOT_FOUND\]/) });
    expect(await call("add_task", { project: "weather-app", title: "x", phase: "deploy" })).toEqual({
      error: expect.stringMatching(/^\[VALIDATION\].*phases are/),
    });
  });
});

describe("courses", () => {
  it("creates a course with exams and shows the next exam", async () => {
    const { call } = await connect();
    await call("create_course", {
      id: "computer-networks",
      title: "Computer Networks",
      phases: ["layers"],
      term: "2/2026",
      exams: [{ id: "final", title: "Final", date: "2027-01-10", weight: 40 }],
      topics: [{ id: "osi", title: "OSI model", skills: ["networking-fundamentals"] }],
    });
    const list = await call("list_learning");
    expect(list.find((l: { id: string }) => l.id === "computer-networks")).toMatchObject({
      type: "course",
      next_exam: { title: "Final", date: "2027-01-10" },
    });
  });
});

describe("honest skill levels", () => {
  it("rejects an increase without evidence, accepts a decrease", async () => {
    const { call } = await connect();
    expect(await call("adjust_skill_level", { skill: "kubernetes-ops", delta: 10, reason: "User seems confident overall" })).toEqual({
      error: expect.stringMatching(/^\[RULE\].*evidence/),
    });
    const s = await call("adjust_skill_level", { skill: "kubernetes-ops", delta: -5, reason: "Mixed up Deployments and ReplicaSets" });
    expect(s).toMatchObject({ level: 52, adjustment: -5 });
  });

  it("builds quiz context with known weaknesses", async () => {
    const { call } = await connect();
    await call("adjust_skill_level", { skill: "kubernetes-ops", delta: -5, reason: "Mixed up Deployments and ReplicaSets" });
    const ctx = await call("generate_quiz_context", { topic_ref: "learning/kubernetes#deployments" });
    expect(ctx.topic).toMatchObject({ id: "deployments", review: ["stale", "weak"] });
    expect(ctx.skills[0].known_weaknesses).toEqual(["Mixed up Deployments and ReplicaSets"]);
    expect(ctx.recent_assessments).toHaveLength(1);
  });
});

describe("web quizzes", () => {
  it("creates a quiz and lists it", async () => {
    const { call } = await connect();
    const q = await call("create_quiz", {
      title: "RBAC basics",
      skills: { "kubernetes-ops": 0.5, "identity-access-management": 0.5 },
      difficulty: "medium",
      topic_refs: ["learning/kubernetes#rbac"],
      questions: [{ q: "Namespace-scoped permission object?", choices: ["Role", "ClusterRole"], answer: 0, explain: "Role is namespaced." }],
    });
    expect(q).toEqual({ id: "2026-11-23-rbac-basics", title: "RBAC basics", questions: 1, status: "open" });
    const list = await call("list_quizzes");
    expect(list.map((x: { id: string }) => x.id)).toContain("2026-11-23-rbac-basics");
  });

  it("accepts select-all and typed questions through the tool schema", async () => {
    const { call } = await connect();
    const q = await call("create_quiz", {
      title: "Mixed",
      skills: { python: 1 },
      difficulty: "easy",
      questions: [
        { type: "multi", q: "Falsy values?", choices: ["0", "[]", "'a'"], answers: [0, 1] },
        { type: "short", q: "len('abc')?", accept: ["3"] },
        { q: "Old style", choices: ["a", "b"], answer: 1 },
      ],
    });
    expect(q).toMatchObject({ title: "Mixed", questions: 3, status: "open" });
  });

  it("rejects an answer index outside the choices", async () => {
    const { call } = await connect();
    const r = await call("create_quiz", {
      title: "Bad",
      skills: { python: 1 },
      difficulty: "easy",
      questions: [{ q: "?", choices: ["a", "b"], answer: 5 }],
    });
    expect(r.error).toMatch(/^\[VALIDATION\][\s\S]*answer/);
  });
});

describe("inbox, notes, review, undo", () => {
  it("reads inbox files", async () => {
    const { call, store } = await connect();
    writeFileSync(join(store.dataDir, "inbox", "lab-01.md"), "# Lab 1\nFind the beacon.");
    expect((await call("list_inbox")).map((f: { name: string }) => f.name)).toEqual(["lab-01.md"]);
    expect((await call("read_inbox", { name: "lab-01.md" })).content).toMatch(/beacon/);
  });

  it("creates notes and lists the review queue", async () => {
    const { call } = await connect();
    await call("create_note", { id: "k8s-decision", title: "Use kind locally", type: "decision", body: "Because [[kubernetes]]" });
    expect((await call("list_notes", { type: "decision" })).map((n: { id: string }) => n.id)).toContain("k8s-decision");
    expect((await call("get_review_queue"))[0]).toMatchObject({ ref: "learning/kubernetes#deployments", days_since_review: 22 });
  });

  it("undoes a change", async () => {
    const { call } = await connect();
    await call("add_task", { project: "weather-app", title: "Oops" });
    const [last] = await call("get_activity", { limit: 1 });
    await call("undo_change", { id: last.id });
    expect((await call("get_project", { id: "weather-app" })).tasks).toHaveLength(4);
  });
});

describe("system map", () => {
  it("lets an AI draw the system, move 'you are here' and stay honest", async () => {
    const { call } = await connect("claude-code");
    expect(await call("get_project_map", { project: "weather-app" })).toMatchObject({ map: null });
    const m = await call("set_project_map", {
      project: "weather-app",
      lanes: ["input", "core"],
      nodes: [
        { id: "collector", label: "Log collector", lane: "input", tasks: ["t-001"] },
        { id: "engine", label: "Detection engine", lane: "core", tasks: ["t-002", "t-003"] },
      ],
      edges: [{ from: "collector", to: "engine", label: "events" }],
      focus: "engine",
    });
    expect(m.summary).toMatchObject({ parts: 2, done: 1, building: 1, focus: { id: "engine", label: "Detection engine" } });
    expect(m.nodes[1]).toMatchObject({ status: "building", progress: 0 });

    expect((await call("update_map_node", { project: "weather-app", node: "engine", status: "done" })).error).toMatch(/RULE.*t-002, t-003/);
    const added = await call("update_map_node", { project: "weather-app", node: "alerts", label: "Alerts", lane: "core" });
    expect(added.nodes.map((n: { id: string }) => n.id)).toEqual(["collector", "engine", "alerts"]);
    expect((await call("set_map_focus", { project: "weather-app", node: "alerts" })).focus).toBe("alerts");
  });
});

describe("schedule", () => {
  it("plans a time block and shows it with classes, dues and Google events", async () => {
    const google = {
      status: () => ({ client: true, connected: true, calendar_id: "c", last_sync: null, last_error: null }),
      sync: async () => ({ calendar_id: "c", pulled: 0, pushed: 1, removed: 0, last_sync: "x" }),
      external: async () => [
        { key: "google:primary/1", kind: "google" as const, title: "Dentist", date: "2026-11-30", start: "08:00", end: "09:00", ref: null },
      ],
    };
    const { call, store } = await connect("codex", { google });
    const ev = await call("add_event", { title: "Study pods", date: "2026-11-30", start: "14:00", end: "16:00", links: ["learning/kubernetes"] });
    expect(ev).toMatchObject({ id: "2026-11-30-study-pods" });
    expect(store.listActivity()[0]).toMatchObject({ agent: "codex", entity: "schedule/events" });

    const week = await call("get_schedule", { from: "2026-11-30", to: "2026-12-01" });
    expect(week.map((i: { kind: string; title: string }) => `${i.kind}:${i.title}`)).toEqual([
      "google:Dentist", "class:Operating Systems", "event:Study pods", "assignment:Process scheduling lab",
    ]);
    expect(await call("update_event", { id: ev.id, start: null, end: null })).toMatchObject({ start: null });
    expect(await call("add_event", { title: "x", date: "2026-11-30", start: "10:00" })).toMatchObject({ error: expect.stringMatching(/VALIDATION/) });
    expect(await call("sync_calendar")).toMatchObject({ pushed: 1 });
    await call("delete_event", { id: ev.id });
    expect(store.listEvents()).toEqual([]);
  });

  it("explains how to connect when Google is not connected", async () => {
    const { call } = await connect();
    expect((await call("sync_calendar")).error).toMatch(/not connected/);
  });
});

describe("stdio process", () => {
  it("runs with plain `node src/main.ts` like an MCP client launches it", async () => {
    const dataDir = tempDataDir();
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve(import.meta.dirname, "../src/main.ts"), "--agent", "stdio-test", "--data", dataDir],
      stderr: "pipe",
    });
    const client = new Client({ name: "stdio-test", version: "0" });
    await client.connect(transport);
    clients.push(client);
    const res = (await client.callTool({ name: "add_task", arguments: { project: "weather-app", title: "From stdio" } })) as {
      content: { text: string }[];
    };
    expect(JSON.parse(res.content[0]!.text)).toMatchObject({ id: "t-005", title: "From stdio" });
    const store = new Store({ dataDir, agent: "check" });
    expect(store.listActivity()[0]).toMatchObject({ agent: "stdio-test" });
  }, 20_000);
});

it("classroom profile stages an inert draft and cannot invoke legacy live writers", async () => {
  const { client, call, store } = await connect("classroom-synthetic-test", { profile: "classroom" });
  expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual(["classroom_format", "get_draft_receipt", "get_draft_status", "submit_course_draft", "validate_course_visual"]);
  const format = await call("classroom_format");
  const first = await call("submit_course_draft", { request_id: "synthetic-01", bundle: format.example });
  expect(first).toMatchObject({ ok: true, status: "staged" });
  expect(await call("submit_course_draft", { request_id: "synthetic-01", bundle: format.example })).toEqual(first);
  expect(await call("get_draft_receipt", { request_id: "synthetic-01" })).toEqual(first);
  for (const name of ["create_course", "create_quiz", "save_visual", "get_overview", "publish_course", "undo_change"]) {
    expect((await client.callTool({ name, arguments: {} })).isError).toBe(true);
  }
  expect(store.listLearning().some((item) => item.id === format.example.course_id)).toBe(false);
});

it("reports draft execution via stdio and recovers the same receipt after reconnecting", async () => {
  const dataDir = tempDataDir();
  const args = [resolve(import.meta.dirname, "../src/main.ts"), "--profile", "classroom", "--data", dataDir];
  const start = async () => {
    const client = new Client({ name: "isolated-draft-stdio", version: "1" });
    clients.push(client);
    await client.connect(new StdioClientTransport({ command: process.execPath, args, stderr: "pipe" }));
    return client;
  };
  const call = async (client: Client, name: string, args: Record<string, unknown> = {}, messages?: string[]) => {
    const result = (await client.callTool({ name, arguments: args }, undefined, messages ? {
      onprogress: ({ message }) => { if (message) messages.push(message); },
    } : undefined)) as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).not.toBe(true);
    return JSON.parse(result.content[0]!.text);
  };
  const first = await start();
  const request_id = "synthetic-stdio-01";
  expect(await call(first, "get_draft_status", { request_id })).toEqual({ request_id, status: "unknown" });
  const { example } = await call(first, "classroom_format");
  const messages: string[] = [];
  const receipt = await call(first, "submit_course_draft", { request_id, bundle: example }, messages);
  expect(messages).toEqual(["running"]);
  expect(receipt).toMatchObject({ ok: true, status: "staged" });
  await first.close();
  const again = await start();
  expect(await call(again, "get_draft_status", { request_id })).toEqual({ request_id, status: "staged", receipt });
  expect(await call(again, "submit_course_draft", { request_id, bundle: example })).toEqual(receipt);
  expect(await call(again, "submit_course_draft", { request_id, bundle: { ...example, title: "Different" } })).toMatchObject({
    ok: false, issues: [{ code: "REQUEST_CONFLICT" }],
  });
  expect(await call(again, "submit_course_draft", { request_id: "synthetic-rejected", bundle: {} })).toMatchObject({ ok: false });
  expect(await call(again, "get_draft_status", { request_id: "synthetic-rejected" })).toEqual({
    request_id: "synthetic-rejected", status: "unknown",
  });
}, 20_000);

describe("published classroom read model", () => {
  it("makes current courses discoverable, scopes reads, and does not return drafts or answers", async () => {
    const { call, store, client } = await connect("remote-chatgpt", {profile:"remote"});
    const db = new ClassroomStore(store.dataDir);
    const format=await call("classroom_format",{include_schema:true});
    expect(format.schema.properties).toHaveProperty("lessons");
    const sample=format.example;
    sample.title="Imported networking test course";
    const lesson=sample.lessons[0]!;
    lesson.questions[0].model_answer="SECRET-CLASSROOM-ANSWER";
    lesson.questions[0].rubric=["SECRET-CLASSROOM-RUBRIC"];
    lesson.blocks.push({type:"visual",fallback:"Worked example",visual:{id:"native-visual",title:"Native visual",type:"lesson",data:{blocks:[{
      kind:"check",q:"Explain the example",a:"SECRET-INLINE-CHECK"
    }]}}});
    const first=db.submit({request_id:"read-classroom-first",bundle:sample});
    expect(first.ok).toBe(true);
    if(!first.ok)throw Error(JSON.stringify(first));
    expect(await call("list_published_courses")).toEqual([]);
    expect(await call("get_published_course",{course_id:sample.course_id})).toMatchObject({ok:false,error:{code:"NOT_FOUND",retryable:false}});
    db.publish(first.revision_id);
    const next=db.submit({request_id:"read-classroom-pending",base_revision:first.revision_id,bundle:{...sample,title:"PRIVATE-PENDING-DRAFT"}});
    if(!next.ok)throw Error(JSON.stringify(next));
    const [overview,search,list,course,legacyAlias,visuals,section,visual,anchor]=await Promise.all([
      call("get_overview"),call("search",{query:"networking test"}),call("list_learning"),
      call("get_published_course",{course_id:sample.course_id}),
      call("get_learning",{id:sample.course_id}),
      call("get_visuals",{learning:sample.course_id}),
      call("get_course_lesson",{course_id:sample.course_id,lesson_id:lesson.id,section:"check",limit:1}),
      call("get_course_visuals",{course_id:sample.course_id,lesson_id:lesson.id,visual_id:"native-visual"}),
      call("get_course_revision_anchor",{course_id:sample.course_id})
    ]);
    expect(overview.classroom).toMatchObject({published_count:1,courses:[{course_id:sample.course_id,revision_id:first.revision_id}]});
    expect(search.hits).toContainEqual(expect.objectContaining({ref:"courses/"+sample.course_id}));
    expect(list).toContainEqual(expect.objectContaining({id:sample.course_id,kind:"classroom",progress:null}));
    expect(legacyAlias).toEqual(course);
    expect(course.lessons).toHaveLength(1);
    expect(visuals[0]).toMatchObject({lesson_id:lesson.id,id:"native-visual"});
    expect(section.entries[0]).toMatchObject({type:"explain",prompt:lesson.questions[0].prompt});
    expect(visual.visual.data.blocks[0]).toEqual({kind:"check",q:"Explain the example"});
    expect(anchor).toEqual({course_id:sample.course_id,published_revision_id:first.revision_id,base_revision:next.revision_id,pending_draft:true});
    expect(JSON.stringify([overview,search,list,course,legacyAlias,visuals,section,visual,anchor])).not.toMatch(/SECRET-|PRIVATE-PENDING-DRAFT/);
    expect((await call("get_course_activity",{course_id:sample.course_id})).events).toEqual([
      expect.objectContaining({action:"publish",revision_id:first.revision_id})
    ]);
    expect(await call("get_published_course",{course_id:sample.course_id,revision_id:next.revision_id})).toMatchObject({ok:false,error:{code:"CONFLICT"}});
    expect((await client.listTools()).tools.map(t=>t.name)).not.toContain("publish_course");
  });
});

it("advertises and validates cross-subject scenes without creating a draft", async () => {
  for (const profile of ["remote","classroom"] as const) {
    const { call, store } = await connect("scene-test", {profile});
    const format = await call("classroom_format", {include_scene_schema:true});
    expect(format.scene_schema).toMatchObject({type:"object",additionalProperties:false});
    const scene = format.scene_example.data;
    expect(await call("validate_course_visual",{scene})).toEqual({ok:true,scene_version:1});
    expect(await call("validate_course_visual",{scene:{...scene,tracks:[{...scene.tracks[0],entity:"missing"}]}}))
      .toMatchObject({ok:false,issues:[{path:"tracks.0.entity"}]});
    expect(new ClassroomStore(store.dataDir).listDrafts()).toEqual([]);
    format.example.lessons[0].blocks.push({type:"visual",visual:format.scene_example,fallback:"A point moves from left to right."});
    expect(await call("submit_course_draft",{request_id:"motion-fixture",bundle:format.example})).toMatchObject({ok:true,status:"staged"});
    expect(new ClassroomStore(store.dataDir).listPublished()).toEqual([]);
  }
});

it("exposes compact ISO authoring without adding a remote tool or Classroom v1 type", async () => {
  const { client, call, store } = await connect("iso-preview-test", {profile:"remote"});
  const tools=(await client.listTools()).tools;
  expect(tools.map(t=>t.name).sort()).toEqual([...REMOTE_TOOLS].sort());
  expect(JSON.stringify(tools)).not.toContain("load-balancer");
  const generic=await call("visual_formats");
  expect(generic.types.iso).toMatch(/Isometric/);
  const menu=await call("visual_formats",{type:"iso"});
  expect(menu.packs).toEqual(["network","physics"]);
  expect(menu.components).toBeUndefined();
  const f=await call("visual_formats",{type:"iso",pack:"network"});
  expect(f).toMatchObject({availability:"ready",example:{type:"iso",data:{pack:"network"}}});
  for (const spec of [f,await call("visual_formats",{type:"iso",pack:"physics"}),(await call("classroom_format",{iso_pack:"network"})).iso]) {
    expect(spec.rules).toContainEqual(expect.stringMatching(/projected overlap.*at least one clear view/i));
    expect(spec.rules).toContainEqual(expect.stringMatching(/one meaningful event per step/i));
  }
  expect(f.examples).toBeUndefined();
  expect(f.components.map((c:{component:string})=>c.component)).not.toContain("lamp");
  expect(f.components.find((c:{component:string})=>c.component==="client").anchors).toEqual({out:"out"});
  expect((await call("visual_formats",{type:"iso",pack:"biology"})).issue?.fix).toMatch(/network or physics/);
  const before=store.listActivity().length;
  expect((await call("save_visual",{learning:"unused-iso-learning",...f.example})).error).toMatch(/NOT_FOUND/);
  const {example}=await call("classroom_format");
  example.lessons[0]!.blocks.push({type:"visual",visual:{id:"iso-demo",...f.example},fallback:"Text fallback."});
  expect(await call("submit_course_draft",{request_id:"iso-frozen-v1",bundle:example})).toMatchObject({ok:false});
  expect(store.listActivity().length).toBe(before);
  expect(new ClassroomStore(store.dataDir).listDrafts()).toHaveLength(0);
});

it("authors ISO through only format output and stores a safe undoable visual",async()=>{
  const { call, store }=await connect("remote-iso",{profile:"remote"});
  const course=store.listLearning()[0]!;
  expect(course).toBeDefined();
  const before=store.listActivity().length;
  for(const pack of ["network","physics"]){
    const f=await call("visual_formats",{type:"iso",pack});
    expect(f.availability).toBe("ready");
    const scene={...f.example,id:"test-iso-"+pack};
    const bad=structuredClone(scene);
    bad.data.connections[0].from.anchor="wrong-port";
    const reject=await call("save_visual",{learning:course.id,...bad});
    expect(reject.error).toMatch(/anchors-exist/);
    expect(reject.error).toMatch(/data.connections.0.from/);
    const saved=await call("save_visual",{learning:course.id,...scene});
    expect(saved).toMatchObject({type:"iso"});
    expect(await call("get_visuals",{learning:course.id,id:scene.id})).toMatchObject({type:"iso",data:{pack}});
  }
  const format=await call("visual_formats",{type:"iso",pack:"network"});
  const cache=structuredClone(format.example);
  cache.id="test-iso-cache";cache.title="How a cached lookup reaches a cache";
  const target=cache.data.objects.at(-1);
  const catalogCache=format.components.find((part:{component:string})=>part.component==="cache");
  expect(catalogCache.anchors).toHaveProperty("in");
  target.component=catalogCache.component;target.label="Cache";
  cache.steps[1].text="The balancer routes the lookup to the cache.";
  expect(await call("save_visual",{learning:course.id,...cache})).toMatchObject({type:"iso",title:cache.title});
  expect(store.listActivity().length).toBe(before+3);
  const mismatch=await call("save_visual",{learning:course.id,id:"test-iso-network",title:"Accidental overwrite",type:"html",data:{html:"<p>no</p>"}});
  expect(mismatch.error).toMatch(/different type|retain its existing type/i);
  const latest=store.listActivity()[0]!;
  store.undo(latest.id);
  expect(()=>store.getVisual(course.id,"test-iso-cache")).toThrow(/not found/i);
  expect(store.getVisual(course.id,"test-iso-network").type).toBe("iso");
});

it("stages validated Classroom ISO only in explicit v2 and never publishes from MCP",async()=>{
  const {client,call,store}=await connect("remote-iso-course",{profile:"remote"});
  const authoring=await call("classroom_format",{iso_pack:"physics"});
  expect(authoring.supported_versions).toEqual([1,2]);
  const bundle={...authoring.example, schema_version:2};
  bundle.lessons[0].blocks.push({type:"visual",fallback:"The switch opens the circuit.",visual:{id:"circuit",...authoring.iso.example}});
  const malformed=structuredClone(bundle);
  malformed.lessons[0].blocks.at(-1).visual.data.objects[0].at[0]=.25;
  expect(await call("submit_course_draft",{request_id:"bad-iso-v2",bundle:malformed})).toMatchObject({ok:false,issues:expect.arrayContaining([expect.objectContaining({rule:"grid-aligned",fix:expect.any(String)})])});
  const v1={...bundle,schema_version:1};
  expect(await call("submit_course_draft",{request_id:"iso-not-v1",bundle:v1})).toMatchObject({ok:false});
  const ok=await call("submit_course_draft",{request_id:"valid-iso-v2",bundle});
  expect(ok).toMatchObject({ok:true,status:"staged"});
  expect(await call("list_published_courses")).toEqual([]);
  expect((await client.listTools()).tools.map(t=>t.name)).not.toContain("publish_course");
  const db=new ClassroomStore(store.dataDir);
  expect(db.getRevision(ok.revision_id)?.bundle).toMatchObject({schema_version:2});
});
