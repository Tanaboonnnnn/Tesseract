import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveDataDir, Store, VISUAL_EXAMPLES } from "@tesseract/core";
import { describe, expect, it, vi } from "vitest";
import { createApp, type AppOptions } from "../src/app.ts";

const NOW = () => new Date(2026, 10, 23, 12, 0, 0);
const HOST = "localhost:4320";

function setup(
  webDir?: string,
  remote: { address?: string; token?: string; hosts?: string[] } = {},
  google?: AppOptions["google"],
  window?: AppOptions["window"],
  remoteAccess?: AppOptions["remote"],
  phone?: AppOptions["phone"],
) {
  const dataDir = mkdtempSync(join(tmpdir(), "brain-server-"));
  cpSync(resolveDataDir(), dataDir, { recursive: true });
  const store = new Store({ dataDir, agent: "web-ui", now: NOW });
  const app = createApp(store, {
    allowedHosts: [HOST, ...(remote.hosts ?? [])],
    webDir,
    token: remote.token,
    google,
    window,
    remote: remoteAccess,
    phone,
    // Default: requests come from this machine.
    remoteAddress: () => remote.address ?? "127.0.0.1",
  });

  const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    app.request(path, {
      method,
      headers: { host: HOST, ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  return { store, req };
}

describe("read API", () => {
  it("serves the overview", async () => {
    const { req } = setup();
    const res = await req("GET", "/api/overview");
    expect(res.status).toBe(200);
    const o = await res.json();
    expect(o.projects[0]).toMatchObject({ id: "weather-app", progress: 25 });
  });

  it("serves projects, learning, goals, skills, health", async () => {
    const { req } = setup();
    expect((await (await req("GET", "/api/projects/weather-app")).json()).tasks).toHaveLength(4);
    expect(await (await req("GET", "/api/learning")).json()).toHaveLength(2);
    expect((await (await req("GET", "/api/goals")).json())[0].progress).toBe(25);
    expect(await (await req("GET", "/api/skills")).json()).toHaveLength(9);
    expect(await (await req("GET", "/api/health")).json()).toEqual({ ok: true, agent: "web-ui", problems: [] });
  });

  it("maps errors to HTTP status codes", async () => {
    const { req } = setup();
    expect((await req("GET", "/api/projects/nope")).status).toBe(404);
    expect((await req("GET", "/api/projects/Bad_Id")).status).toBe(400);
    expect((await req("GET", "/api/nope")).status).toBe(404);
  });
});

describe("write API", () => {
  it("creates a project and manages tasks, logged as web-ui", async () => {
    const { req, store } = setup();
    expect((await req("POST", "/api/projects", { id: "home-lab", title: "Home Lab", template: "coding" })).status).toBe(201);
    const task = await (await req("POST", "/api/projects/home-lab/tasks", { title: "Buy switch", priority: "high" })).json();
    expect(task.id).toBe("t-001");
    const moved = await (await req("PATCH", "/api/projects/home-lab/tasks/t-001", { status: "done" })).json();
    expect(moved.done_at).toBe("2026-11-23");
    expect((await req("PATCH", "/api/projects/home-lab", { phase: "build" })).status).toBe(200);
    expect((await req("DELETE", "/api/projects/home-lab/tasks/t-001")).status).toBe(204);
    expect(store.listActivity().every((e) => e.agent === "web-ui")).toBe(true);
  });

  it("returns validation and conflict errors", async () => {
    const { req } = setup();
    const bad = await req("POST", "/api/projects/weather-app/tasks", { title: "x", priority: "asap" });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("VALIDATION");
    expect((await req("POST", "/api/projects", { id: "weather-app", title: "Dup" })).status).toBe(409);
  });

  it("undoes a change", async () => {
    const { req } = setup();
    await req("POST", "/api/projects/weather-app/tasks", { title: "Temp" });
    const [last] = await (await req("GET", "/api/activity")).json();
    expect((await req("POST", `/api/activity/${last.id}/undo`, {})).status).toBe(200);
    expect((await (await req("GET", "/api/projects/weather-app")).json()).tasks).toHaveLength(4);
  });
});

describe("guide API", () => {
  it("measures token cost live", async () => {
    const { req } = setup();
    const r = await (await req("GET", "/api/guide/tokens")).json();
    expect(r.session.tools).toBeGreaterThan(40);
    expect(r.calls.length).toBeGreaterThan(3);
  });
});

describe("phone access API", () => {
  it("shows pairing links to this PC only and switches from this PC only", async () => {
    const calls: boolean[] = [];
    const phone = { on: true, urls: ["http://192.168.1.5:4320"], token: "t".repeat(32), set: (on: boolean) => void calls.push(on) };
    const local = setup(undefined, { token: "t".repeat(32), hosts: ["192.168.1.5:4320"] }, undefined, undefined, undefined, phone);
    expect(await (await local.req("GET", "/api/phone")).json()).toEqual({
      available: true,
      on: true,
      urls: ["http://192.168.1.5:4320"],
      pairUrls: [`http://192.168.1.5:4320/#pair=${"t".repeat(32)}`],
    });
    expect(await (await local.req("POST", "/api/phone", { on: false })).json()).toMatchObject({ on: false, switching: true });
    expect(calls).toEqual([false]);
    expect((await local.req("POST", "/api/phone", { on: "yes" })).status).toBe(400);

    const lanPhone = setup(undefined, { address: "192.168.1.20", token: "t".repeat(32), hosts: ["192.168.1.5:4320"] }, undefined, undefined, undefined, phone);
    const auth = { host: "192.168.1.5:4320", authorization: `Bearer ${"t".repeat(32)}` };
    const seen = await (await lanPhone.req("GET", "/api/phone", undefined, auth)).json();
    expect(seen.pairUrls).toBeUndefined(); // never hand the token to another device
    expect((await lanPhone.req("POST", "/api/phone", { on: false }, auth)).status).toBe(403);
  });

  it("is off when not started by the desktop launcher", async () => {
    const { req } = setup();
    expect(await (await req("GET", "/api/phone")).json()).toEqual({ available: false });
  });
});

describe("remote access API", () => {
  const fake = () => {
    let on = false;
    const st = () => ({ on, until: on ? "2026-11-25T20:00:00.000Z" : null, setup: { binary: true, key: true, tunnel: true }, error: null });
    return { state: st, configure: vi.fn(() => st()), start: () => ((on = true), st()), stop: () => ((on = false), st()), dispose() {} };
  };

  it("is off outside the desktop app", async () => {
    const { req } = setup();
    expect(await (await req("GET", "/api/remote")).json()).toEqual({ available: false });
  });

  it("does not accept tunnel credentials from paired devices or a different origin, or echo them", async () => {
    const remote = fake();
    const body = { tunnelId: "tunnel_" + "a".repeat(32), key: "sk-test-never-echo-this-key" };
    const local = setup(undefined, {}, undefined, undefined, remote);
    expect((await local.req("POST", "/api/remote/setup", body, { origin: "https://example.com" })).status).toBe(403);
    const phone = setup(undefined, { address: "192.168.1.20", token: "t".repeat(32), hosts: ["192.168.1.5:4320"] }, undefined, undefined, remote);
    expect((await phone.req("POST", "/api/remote/setup", body, { host: "192.168.1.5:4320", authorization: `Bearer ${"t".repeat(32)}` })).status).toBe(403);
    expect(remote.configure).not.toHaveBeenCalled();
    expect((await local.req("POST", "/api/remote/setup", { ...body, key: "a".repeat(3000) })).status).toBe(413);
    expect(remote.configure).not.toHaveBeenCalled();
    const res = await local.req("POST", "/api/remote/setup", body);
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain(body.key);
    expect(remote.configure).toHaveBeenCalledWith(body);
  });

  it("starts and stops from this machine only, for 1, 8 or 24 hours", async () => {
    const remote = fake();
    const local = setup(undefined, {}, undefined, undefined, remote);
    expect((await local.req("POST", "/api/remote/start", { hours: 3 })).status).toBe(400);
    expect(await (await local.req("POST", "/api/remote/start", { hours: 8 })).json()).toMatchObject({ available: true, on: true });
    expect(await (await local.req("POST", "/api/remote/stop", {})).json()).toMatchObject({ on: false });

    const phone = setup(undefined, { address: "192.168.1.20", token: "t".repeat(32), hosts: ["192.168.1.5:4320"] }, undefined, undefined, remote);
    const auth = { host: "192.168.1.5:4320", authorization: `Bearer ${"t".repeat(32)}` };
    expect((await phone.req("POST", "/api/remote/start", { hours: 1 }, auth)).status).toBe(403);
    expect(remote.state().on).toBe(false);
    expect((await phone.req("GET", "/api/remote", undefined, auth)).status).toBe(200); // status is fine to show
  });
});

describe("window opacity API", () => {
  it("is off outside the desktop app", async () => {
    const { req } = setup();
    expect(await (await req("GET", "/api/window")).json()).toEqual({ available: false });
    expect((await req("PUT", "/api/window", { opacity: 90 })).status).toBe(422);
  });

  it("sets the window from this machine only, within 50–100", async () => {
    let current = 100;
    const win = { get: () => current, set: async (p: number) => (current = p) };
    const local = setup(undefined, {}, undefined, win);
    expect(await (await local.req("PUT", "/api/window", { opacity: 85 })).json()).toEqual({ available: true, opacity: 85 });
    expect(await (await local.req("GET", "/api/window")).json()).toEqual({ available: true, opacity: 85 });
    expect((await local.req("PUT", "/api/window", { opacity: 20 })).status).toBe(400);

    const phone = setup(undefined, { address: "192.168.1.20", token: "t".repeat(32), hosts: ["192.168.1.5:4320"] }, undefined, win);
    const res = await phone.req("PUT", "/api/window", { opacity: 60 }, { host: "192.168.1.5:4320", authorization: `Bearer ${"t".repeat(32)}` });
    expect(res.status).toBe(403);
    expect(current).toBe(85);
  });
});

describe("delete API", () => {
  it("shows the impact, then deletes a project and a learning item", async () => {
    const { req } = setup();
    const impact = await (await req("GET", "/api/projects/weather-app/delete-impact")).json();
    expect(impact.ref).toBe("projects/weather-app");
    expect((await req("GET", "/api/projects/weather-app")).status).toBe(200); // dry run wrote nothing
    expect((await req("DELETE", "/api/projects/weather-app")).status).toBe(200);
    expect((await req("GET", "/api/projects/weather-app")).status).toBe(404);
    expect((await req("DELETE", "/api/learning/kubernetes")).status).toBe(200);
    expect((await req("GET", "/api/learning/kubernetes")).status).toBe(404);
  });
});

describe("visuals API", () => {
  it("lists, reads and deletes visuals", async () => {
    const { req, store } = setup();
    store.saveVisual("kubernetes", { ...VISUAL_EXAMPLES.grid.example, topic: "pods" });
    const list = await (await req("GET", "/api/learning/kubernetes/visuals")).json();
    expect(list).toMatchObject([{ id: "k-map-f-b", type: "grid", topic: "pods", steps: 2 }]);
    expect((await (await req("GET", "/api/learning/kubernetes/visuals/k-map-f-b")).json()).data.columns).toEqual(["B=0", "B=1"]);
    expect((await req("DELETE", "/api/learning/kubernetes/visuals/k-map-f-b")).status).toBe(204);
    expect((await req("GET", "/api/learning/kubernetes/visuals/k-map-f-b")).status).toBe(404);
  });
});

describe("learning map API", () => {
  it("derives the map from topics", async () => {
    const { req } = setup();
    const m = await (await req("GET", "/api/learning/kubernetes/map")).json();
    expect(m.lanes).toEqual(["basics", "workloads", "networking", "security"]);
    expect(m.edges).toHaveLength(3);
    expect((await req("GET", "/api/learning/nope/map")).status).toBe(404);
  });
});

describe("system map API", () => {
  it("draws, edits and focuses a project map", async () => {
    const { req } = setup();
    expect(await (await req("GET", "/api/projects/weather-app/map")).json()).toBeNull();
    const drawn = await req("PUT", "/api/projects/weather-app/map", {
      lanes: ["core"],
      nodes: [{ id: "engine", label: "Engine", lane: "core", tasks: ["t-002"] }],
    });
    expect(drawn.status).toBe(200);
    expect((await drawn.json()).nodes[0].effective_status).toBe("building");
    expect((await req("PATCH", "/api/projects/weather-app/map/nodes/engine", { status: "done" })).status).toBe(422);
    expect((await req("PATCH", "/api/projects/weather-app/map/nodes/engine", { note: "Go" })).status).toBe(200);
    expect((await (await req("PUT", "/api/projects/weather-app/map/focus", { node: "engine" })).json()).summary.focus).toEqual({ id: "engine", label: "Engine" });
  });
});

describe("schedule API", () => {
  const fakeGoogle = () => {
    const calls: string[] = [];
    const google: NonNullable<AppOptions["google"]> = {
      status: () => ({ client: true, connected: true, calendar_id: "c", last_sync: null, last_error: null }),
      connect: async () => (calls.push("connect"), { url: "https://accounts.google.com/o/oauth2/v2/auth?x" }),
      sync: async () => (calls.push("sync"), { calendar_id: "c", pulled: 0, pushed: 2, removed: 0, last_sync: "t" }),
      external: async () => [
        { key: "google:primary/1", kind: "google", title: "Dentist", date: "2026-11-30", start: "08:00", end: "09:00", ref: null },
      ],
      disconnect: async () => void calls.push("disconnect"),
    };
    return { google, calls };
  };

  it("merges own events, classes and Google events, and edits events", async () => {
    const { google } = fakeGoogle();
    const { req, store } = setup(undefined, {}, google);
    const created = await req("POST", "/api/events", { title: "Study", date: "2026-11-30", start: "14:00", end: "15:00" });
    expect(created.status).toBe(201);
    const { items } = await (await req("GET", "/api/schedule?from=2026-11-30&to=2026-11-30")).json();
    expect(items.map((i: { kind: string }) => i.kind)).toEqual(["google", "class", "event"]);
    expect((await req("PATCH", "/api/events/2026-11-30-study", { title: "Study pods" })).status).toBe(200);
    expect((await req("POST", "/api/events", { title: "x", date: "2026-11-30", end: "10:00" })).status).toBe(400);
    expect((await req("DELETE", "/api/events/2026-11-30-study")).status).toBe(204);
    expect(store.listActivity().every((e) => e.agent === "web-ui")).toBe(true);
  });

  it("connects only from this computer and syncs on request", async () => {
    const { google, calls } = fakeGoogle();
    const local = setup(undefined, {}, google);
    expect(await (await local.req("POST", "/api/google/connect", {})).json()).toMatchObject({ url: expect.stringMatching(/^https:\/\/accounts\.google\.com/) });
    expect(await (await local.req("POST", "/api/google/sync", {})).json()).toMatchObject({ pushed: 2 });
    expect(await (await local.req("PATCH", "/api/google/settings", { push: { exams: false } })).json()).toMatchObject({ push: { exams: false } });
    expect(await (await local.req("GET", "/api/google")).json()).toMatchObject({ available: true, connected: true, settings: { push: { exams: false } } });

    const phone = setup(undefined, { address: "192.168.1.20", token: "x".repeat(32), hosts: ["192.168.1.5:4320"] }, google);
    const res = await phone.req("POST", "/api/google/connect", {}, { host: "192.168.1.5:4320", authorization: `Bearer ${"x".repeat(32)}` });
    expect(res.status).toBe(403);
    expect(calls).toEqual(["connect", "sync"]);
  });

  it("works without Google", async () => {
    const { req } = setup();
    expect(await (await req("GET", "/api/google")).json()).toMatchObject({ available: false });
    expect((await req("POST", "/api/google/sync", {})).status).toBe(422);
    expect((await (await req("GET", "/api/schedule?from=2026-11-30&to=2026-11-30")).json()).items).toHaveLength(1);
  });
});

describe("learning, skills, quizzes", () => {
  const QUIZ = "2026-11-23-kubernetes-deployments";

  it("serves learning detail and updates topics", async () => {
    const { req } = setup();
    const l = await (await req("GET", "/api/learning/kubernetes")).json();
    expect(l.topics.map((t: { id: string }) => t.id)).toEqual(["pods", "deployments", "network-policies", "rbac"]);
    const t = await (await req("PATCH", "/api/learning/kubernetes/topics/rbac", { status: "learning" })).json();
    expect(t).toMatchObject({ status: "learning", last_reviewed: "2026-11-23" });
    expect((await req("POST", "/api/learning/kubernetes/topics", { id: "secrets", title: "Secrets" })).status).toBe(201);
    expect((await (await req("GET", "/api/review")).json())[0].topic.id).toBe("deployments");
  });

  it("serves a skill with its assessments", async () => {
    const { req } = setup();
    expect(await (await req("GET", "/api/skills/kubernetes-ops")).json()).toMatchObject({ level: 57, domain: "cloud-devops" });
    expect(await (await req("GET", "/api/assessments?skill=kubernetes-ops")).json()).toHaveLength(1);
  });

  it("never sends answers of an open quiz", async () => {
    const { req } = setup();
    const list = await (await req("GET", "/api/quizzes")).json();
    expect(list[0]).toMatchObject({ id: QUIZ, status: "open", questions: 4 });
    const text = await (await req("GET", `/api/quizzes/${QUIZ}`)).text();
    expect(text).not.toMatch(/"answer"|"explain"/);
  });

  it("grades a submission and returns results once", async () => {
    const { req } = setup();
    const res = await req("POST", `/api/quizzes/${QUIZ}/submit`, { answers: [1, 1, 0, 1] });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ score: 100, correct: 4, total: 4 });
    expect((await req("POST", `/api/quizzes/${QUIZ}/submit`, { answers: [1, 1, 0, 1] })).status).toBe(409);
    expect((await (await req("GET", `/api/quizzes/${QUIZ}`)).json()).questions[0].answer).toBe(1);
  });
});

describe("notes API", () => {
  it("lists, creates, reads with backlinks and updates notes", async () => {
    const { req } = setup();
    expect((await req("POST", "/api/notes", { id: "rbac", title: "RBAC", body: "Roles vs ClusterRoles" })).status).toBe(201);
    await req("POST", "/api/notes", { id: "k8s-log", title: "K8s log", type: "log", body: "Studied [[RBAC]] today" });
    const list = await (await req("GET", "/api/notes")).json();
    expect(list.map((n: { id: string }) => n.id)).toContain("rbac");
    expect(list[0]).toHaveProperty("excerpt");
    expect(list[0]).not.toHaveProperty("body");
    expect(await (await req("GET", "/api/notes?type=log")).json()).toHaveLength(1);
    const detail = await (await req("GET", "/api/notes/rbac")).json();
    expect(detail.backlinks).toEqual([{ id: "k8s-log", title: "K8s log", type: "log" }]);
    const updated = await (await req("PATCH", "/api/notes/rbac", { type: "decision" })).json();
    expect(updated).toMatchObject({ type: "decision", body: "Roles vs ClusterRoles" });
  });
});

describe("remote access (LAN / Tailscale)", () => {
  const TOKEN = "t0ken-for-tests-0123456789abcdef";
  const LAN = "192.168.1.5:4320";
  const phone = () => setup(undefined, { address: "192.168.1.20", token: TOKEN, hosts: [LAN] });

  it("is off without a token", async () => {
    const { req } = setup(undefined, { address: "192.168.1.20", hosts: [LAN] });
    expect((await req("GET", "/api/overview", undefined, { host: LAN })).status).toBe(403);
  });

  it("requires pairing for other devices", async () => {
    const { req } = phone();
    const res = await req("GET", "/api/overview", undefined, { host: LAN });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("UNAUTHORIZED");
  });

  it("pairs with the right token and sets an httpOnly cookie", async () => {
    const { req } = phone();
    expect((await req("POST", "/api/pair", { token: "wrong" }, { host: LAN })).status).toBe(401);
    const ok = await req("POST", "/api/pair", { token: TOKEN }, { host: LAN });
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get("set-cookie")!;
    expect(cookie).toMatch(/sbh_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    const session = cookie.split(";")[0]!;
    expect((await req("GET", "/api/overview", undefined, { host: LAN, cookie: session })).status).toBe(200);
  });

  it("accepts a Bearer token", async () => {
    const { req } = phone();
    const res = await req("GET", "/api/overview", undefined, { host: LAN, authorization: `Bearer ${TOKEN}` });
    expect(res.status).toBe(200);
  });

  it("does not trust a spoofed localhost Host from another device", async () => {
    const { req } = phone();
    expect((await req("GET", "/api/overview", undefined, { host: HOST })).status).toBe(401);
  });

  it("does not trust a local proxy forwarding another Host (tailscale serve)", async () => {
    const { req } = setup(undefined, { address: "127.0.0.1", token: TOKEN, hosts: ["pc.tail1234.ts.net"] });
    expect((await req("GET", "/api/overview", undefined, { host: "pc.tail1234.ts.net" })).status).toBe(401);
  });

  it("still serves the app shell so the phone can show the pairing screen", async () => {
    const webDir = mkdtempSync(join(tmpdir(), "brain-web-"));
    writeFileSync(join(webDir, "index.html"), "<!doctype html><div id=root></div>");
    const { req } = setup(webDir, { address: "192.168.1.20", token: TOKEN, hosts: [LAN] });
    expect((await req("GET", "/", undefined, { host: LAN })).status).toBe(200);
  });
});

describe("security", () => {
  it("rejects unknown Host headers (DNS rebinding)", async () => {
    const { req } = setup();
    expect((await req("GET", "/api/overview", undefined, { host: "evil.example:4320" })).status).toBe(403);
  });

  it("blocks cross-origin writes", async () => {
    const { req } = setup();
    const res = await req("POST", "/api/projects/weather-app/tasks", { title: "x" }, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    const same = await req("POST", "/api/projects/weather-app/tasks", { title: "x" }, { origin: `http://${HOST}` });
    expect(same.status).toBe(201);
  });

  it("requires JSON for writes (no simple form posts)", async () => {
    const { req } = setup();
    const res = await req("POST", "/api/projects/weather-app/tasks", undefined, {
      "content-type": "text/plain",
    });
    expect(res.status).toBe(415);
  });

  it("rejects non-object JSON bodies", async () => {
    const { req } = setup();
    expect((await req("POST", "/api/projects", [1, 2])).status).toBe(400);
  });
});

describe("web app hosting", () => {
  it("serves index.html for app routes and keeps API 404s as JSON", async () => {
    const webDir = mkdtempSync(join(tmpdir(), "brain-web-"));
    mkdirSync(join(webDir, "assets"));
    writeFileSync(join(webDir, "index.html"), "<!doctype html><div id=root></div>");
    writeFileSync(join(webDir, "assets", "app.js"), "console.log(1)");
    const { req } = setup(webDir);
    expect(await (await req("GET", "/projects/weather-app")).text()).toContain("root");
    expect(await (await req("GET", "/assets/app.js")).text()).toContain("console");
    expect((await req("GET", "/api/missing")).headers.get("content-type")).toContain("json");
    expect((await req("GET", "/assets/old-hash.js")).status).toBe(404);
  });
});

it("identifies this app at the desktop readiness endpoint", async () => {
  const { req } = setup();
  const result = await req("GET", "/api/session");
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ app: "tesseract", ok: true, local: true });
});

describe("classroom onboarding", () => {
  const bundle = {
    schema_version: 1, course_id: "course-fixture", title: "Isolated test course", language: "en",
    sources: [{ id: "source", title: "Example", url: "https://example.org", accessed_on: "2026-11-25", rights: "reference-only", summary: "Fixture" }],
    lessons: [{ id: "lesson", title: "Test lesson", objective: "Check publication boundary", source_ids: ["source"],
      blocks: [{type:"text",markdown:"Fixture text"}], questions: [{id:"q",type:"single",prompt:"Pick A",choices:["A","B"],correct:[0],explanation:"Fixture answer."}] }]
  };
  const file = { format: "json", contents: Buffer.from(JSON.stringify(bundle)).toString("base64") };

  it("previews without writes, stages idempotently, publishes, tracks answers and links tasks", async () => {
    const { req }=setup();
    expect((await req("POST","/api/learning",{title:"Empty course"})).status).toBe(201);
    expect((await req("POST","/api/classroom/import",file)).status).toBe(200);
    expect(await (await req("GET","/api/classroom/drafts")).json()).toEqual([]);
    expect((await req("POST","/api/classroom/import",{...file,confirm:true,request_id:"test-receipt"})).status).toBe(201);
    const first = (await (await req("GET","/api/classroom/drafts")).json())[0].revision_id;
    expect((await (await req("POST","/api/classroom/import",{...file,confirm:true,request_id:"test-receipt"})).json()).revision_id).toBe(first);
    expect((await req("GET","/api/classroom/published/course-fixture")).status).toBe(404);
    expect((await req("POST","/api/classroom/drafts/"+first+"/publish",{})).status).toBe(200);
    const path="/api/classroom/published/course-fixture/attempts";
    expect(await (await req("POST",path,{revision_id:first,attempt_id:"test-answer",lesson_id:"lesson",question_id:"q",answer:[0]})).json()).toEqual({score:1});
    const task=await (await req("POST","/api/projects/weather-app/tasks",{title:"Review fixture",topic_refs:["learning/course-fixture#lesson"]})).json();
    expect(task.topic_refs).toEqual(["learning/course-fixture#lesson"]);
    expect((await req("PATCH","/api/projects/weather-app/tasks/"+task.id,{status:"done"})).status).toBe(200);
    expect((await (await req("GET",path)).json())[0].score).toBe(1);
    expect((await (await req("GET","/api/learning-related-tasks/course-fixture")).json())[0].status).toBe("done");
    const second = (await (await req("POST","/api/classroom/import",{...file,confirm:true,request_id:"test-receipt-2",base_revision:first})).json()).revision_id;
    expect((await req("POST","/api/classroom/drafts/"+second+"/publish",{})).status).toBe(200);
    expect(await (await req("GET",path)).json()).toEqual([]);
    expect((await req("POST","/api/classroom/drafts/"+first+"/restore",{})).status).toBe(200);
    expect((await (await req("GET",path)).json())[0].score).toBe(1);
  });
  it("does not let a paired device import, inspect drafts, or publish", async()=>{
    const {req}=setup(undefined,{address:"192.168.1.9",token:"paired-fixture"});
    const auth={authorization:"Bearer paired-fixture"};
    expect((await req("GET","/api/classroom/published",undefined,auth)).status).toBe(200);
    expect((await req("GET","/api/classroom/drafts",undefined,auth)).status).toBe(403);
    expect((await req("POST","/api/classroom/import",file,auth)).status).toBe(403);
    expect((await req("POST","/api/classroom/drafts/fixture/publish",{},auth)).status).toBe(403);
  });
});
