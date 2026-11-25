/**
 * HTTP API for the web UI. Thin layer over Store — all rules live in core.
 *
 * Security:
 * - Host header must be allowed                  → blocks DNS rebinding.
 * - Writes must be JSON and same-origin          → blocks other websites (CSRF).
 * - Only this machine is trusted without login: loopback address AND loopback Host.
 *   Everything else (phone over LAN/Tailscale, or a local proxy like `tailscale serve`)
 *   must pair once with the access token (httpOnly cookie) or send `Authorization: Bearer`.
 */
import { timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getConnInfo } from "@hono/node-server/conninfo";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { getCookie, setCookie } from "hono/cookie";
import {
  BrainError,
  goalSummary,
  learningSummary,
  noteDetail,
  overview,
  projectSummary,
  quizPublic,
  scheduleItems,
  type BrainErrorCode,
  type EventInput,
  type EventPatch,
  type GoogleSettingsPatch,
  learningMap,
  type LearningPatch,
  type MapNodePatch,
  type NoteInput,
  type ProjectMapInput,
  type NotePatch,
  type ProjectInput,
  type ProjectPatch,
  type Store,
  type TaskInput,
  type TaskPatch,
  type TopicInput,
  type TopicPatch,
} from "@tesseract/core";
import type { GoogleService } from "@tesseract/gcal";
import { MIN_WINDOW_OPACITY, type WindowControl } from "./window.ts";
import type { RemoteControl } from "./remote.ts";
import type { PhoneControl } from "./phone.ts";

export interface AppOptions {
  /** Host header values the server answers to, e.g. ["localhost:4320", "192.168.1.5:4320"]. */
  allowedHosts: string[];
  /** Built web app (Vite dist). Served with SPA fallback when present. */
  webDir?: string;
  /** Access token for devices other than this machine. Undefined = remote access off. */
  token?: string;
  /** Client address of a request. Injectable for tests. */
  remoteAddress?: (c: Context) => string | undefined;
  /** Google Calendar sync. Omit to run without it. */
  google?: Pick<GoogleService, "status" | "connect" | "sync" | "external" | "disconnect">;
  /** Desktop window opacity (Windows desktop app). Omit when not available. */
  window?: WindowControl;
  /** Remote access through OpenAI's tunnel (Phase 8a). Omit when not available. */
  remote?: RemoteControl;
  /** Phone & tablet (LAN) switch for the desktop app. Omit when not started by the launcher. */
  phone?: PhoneControl;
}

export const SESSION_COOKIE = "sbh_session";
const LOOPBACK_ADDRS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostName(host: string): string {
  return host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0]!;
}

function sameSecret(a: string | undefined, b: string): boolean {
  if (!a) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function defaultRemoteAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
}

const STATUS: Record<BrainErrorCode, 400 | 404 | 409 | 422> = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RULE: 422,
};

async function json(c: Context): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new BrainError("VALIDATION", "Request body must be a JSON object");
}

export function createApp(store: Store, options: AppOptions): Hono {
  const app = new Hono();
  const hosts = new Set(options.allowedHosts.map((h) => h.toLowerCase()));
  const origins = new Set(options.allowedHosts.flatMap((h) => [`http://${h.toLowerCase()}`, `https://${h.toLowerCase()}`]));
  const remoteAddress = options.remoteAddress ?? defaultRemoteAddress;
  const token = options.token;

  /** This machine, directly (not via a proxy that forwards a different Host). */
  const isLocal = (c: Context) => {
    const host = (c.req.header("host") ?? "").toLowerCase();
    return LOOPBACK_HOSTS.has(hostName(host)) && LOOPBACK_ADDRS.has(remoteAddress(c) ?? "");
  };
  const isPaired = (c: Context) =>
    !!token &&
    (sameSecret(getCookie(c, SESSION_COOKIE), token) ||
      sameSecret(c.req.header("authorization")?.replace(/^Bearer\s+/i, ""), token));

  app.use("*", async (c, next) => {
    if (c.req.path.startsWith("/api/")) c.header("Cache-Control", "no-store");
    const host = (c.req.header("host") ?? "").toLowerCase();
    if (!hosts.has(host)) return c.json({ error: "FORBIDDEN", message: "Host not allowed" }, 403);
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      const origin = c.req.header("origin");
      if (origin && !origins.has(origin.toLowerCase())) {
        return c.json({ error: "FORBIDDEN", message: "Cross-origin write blocked" }, 403);
      }
      const type = c.req.header("content-type") ?? "";
      if (c.req.method !== "DELETE" && !type.startsWith("application/json")) {
        return c.json({ error: "UNSUPPORTED", message: "Use Content-Type: application/json" }, 415);
      }
    }
    // Other devices: the app shell and /api/pair are open; data needs pairing.
    const path = c.req.path;
    if (path.startsWith("/api/") && path !== "/api/pair" && !isLocal(c) && !isPaired(c)) {
      return token
        ? c.json({ error: "UNAUTHORIZED", message: "Pair this device first" }, 401)
        : c.json({ error: "FORBIDDEN", message: "Remote access is off" }, 403);
    }
    await next();
  });

  app.onError((err, c) => {
    if (err instanceof HTTPException && err.status === 413) return c.json({ error: "TOO_LARGE", message: "Request body is too large." }, 413);
    if (err instanceof BrainError) return c.json({ error: err.code, message: err.message }, STATUS[err.code]);
    console.error(err);
    return c.json({ error: "INTERNAL", message: "Unexpected error" }, 500);
  });

  const api = new Hono();
  const scoreOf = (assessmentId: string): number | null => {
    try {
      return store.getAssessment(assessmentId).score;
    } catch {
      return null;
    }
  };

  api.get("/health", (c) => c.json({ ok: true, agent: store.agent, problems: store.validateAll() }));
  api.get("/session", (c) => c.json({ app: "tesseract", ok: true, local: isLocal(c) }));
  api.post("/pair", async (c) => {
    const body = await json(c);
    if (!token || typeof body.token !== "string" || !sameSecret(body.token.trim(), token)) {
      await new Promise((r) => setTimeout(r, 400)); // slow down guessing
      return c.json({ error: "UNAUTHORIZED", message: token ? "Wrong token" : "Remote access is off" }, 401);
    }
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "Strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      secure: c.req.header("x-forwarded-proto") === "https" || c.req.url.startsWith("https:"),
    });
    return c.json({ ok: true });
  });
  api.get("/overview", (c) => c.json(overview(store)));

  api.get("/goals", (c) => c.json(store.listGoals().map(goalSummary)));

  api.get("/projects", (c) => c.json(store.listProjects().map(projectSummary)));
  api.get("/projects/:id", (c) => c.json(store.getProject(c.req.param("id"))));
  // Delete: dry run first (what goes), then the delete itself (one undoable change). Web UI only, not MCP.
  for (const kind of ["projects", "learning"] as const) {
    api.get(`/${kind}/:id/delete-impact`, (c) => c.json(store.deleteImpact(kind, c.req.param("id"))));
    api.delete(`/${kind}/:id`, (c) => c.json(store.deleteEntity(kind, c.req.param("id"))));
  }
  api.post("/projects", async (c) => c.json(store.createProject((await json(c)) as unknown as ProjectInput), 201));
  api.patch("/projects/:id", async (c) =>
    c.json(store.updateProject(c.req.param("id"), (await json(c)) as ProjectPatch)),
  );

  api.post("/projects/:id/tasks", async (c) =>
    c.json(store.addTask(c.req.param("id"), (await json(c)) as unknown as TaskInput), 201),
  );
  api.patch("/projects/:id/tasks/:task", async (c) =>
    c.json(store.updateTask(c.req.param("id"), c.req.param("task"), (await json(c)) as TaskPatch)),
  );
  api.delete("/projects/:id/tasks/:task", (c) => {
    store.deleteTask(c.req.param("id"), c.req.param("task"));
    return c.body(null, 204);
  });

  api.get("/projects/:id/map", (c) => c.json(store.getProjectMap(c.req.param("id"))));
  api.put("/projects/:id/map", async (c) =>
    c.json(store.setProjectMap(c.req.param("id"), (await json(c)) as unknown as ProjectMapInput)),
  );
  api.patch("/projects/:id/map/nodes/:node", async (c) =>
    c.json(store.updateMapNode(c.req.param("id"), c.req.param("node"), (await json(c)) as MapNodePatch)),
  );
  api.put("/projects/:id/map/focus", async (c) => {
    const { node } = await json(c);
    return c.json(store.setMapFocus(c.req.param("id"), typeof node === "string" ? node : null));
  });

  api.get("/learning", (c) => c.json(store.listLearning().map((l) => learningSummary(l, store.today()))));
  api.get("/learning/:id", (c) => c.json(store.getLearning(c.req.param("id"))));
  api.get("/learning/:id/map", (c) => c.json(learningMap(store.getLearning(c.req.param("id")))));
  api.get("/learning/:id/visuals", (c) => c.json(store.listVisuals(c.req.param("id"))));
  api.get("/learning/:id/visuals/:vid", (c) => c.json(store.getVisual(c.req.param("id"), c.req.param("vid"))));
  api.delete("/learning/:id/visuals/:vid", (c) => {
    store.deleteVisual(c.req.param("id"), c.req.param("vid"));
    return c.body(null, 204);
  });
  api.patch("/learning/:id", async (c) =>
    c.json(store.updateLearning(c.req.param("id"), (await json(c)) as LearningPatch)),
  );
  api.post("/learning/:id/topics", async (c) =>
    c.json(store.addTopic(c.req.param("id"), (await json(c)) as unknown as TopicInput), 201),
  );
  api.patch("/learning/:id/topics/:topic", async (c) =>
    c.json(store.updateTopic(c.req.param("id"), c.req.param("topic"), (await json(c)) as TopicPatch)),
  );
  api.get("/review", (c) => c.json(store.getReviewQueue()));

  api.get("/skills", (c) => c.json(store.getSkillProfile()));
  api.get("/skills/:id", (c) => c.json(store.getSkill(c.req.param("id"))));
  api.get("/assessments", (c) => {
    const skill = c.req.query("skill");
    const list = store.listAssessments(skill ? { skill } : {}).sort((a, b) => b.date.localeCompare(a.date));
    return c.json(list.map(({ body: _b, ...a }) => a));
  });

  // Answers never leave the server for open quizzes; grading happens here.
  api.get("/quizzes", (c) =>
    c.json(
      store.listQuizzes().map((q) => ({
        id: q.id,
        title: q.title,
        status: q.status,
        difficulty: q.difficulty,
        skills: q.skills,
        questions: q.questions.length,
        author: q.author,
        created: q.created,
        topic_refs: q.topic_refs,
        assessment: q.assessment,
        score: q.assessment ? scoreOf(q.assessment) : null,
      })),
    ),
  );
  api.get("/quizzes/:id", (c) => c.json(quizPublic(store.getQuiz(c.req.param("id")))));
  api.post("/quizzes/:id/submit", async (c) => c.json(store.submitQuiz(c.req.param("id"), (await json(c)).answers)));

  api.get("/notes", (c) => {
    const type = c.req.query("type") as NoteInput["type"] | undefined;
    const notes = store.listNotes(type ? { type } : {}).sort((a, b) => b.updated.localeCompare(a.updated));
    return c.json(notes.map(({ body, ...n }) => ({ ...n, excerpt: body.replace(/\s+/g, " ").slice(0, 160) })));
  });
  api.get("/notes/:id", (c) => c.json(noteDetail(store, c.req.param("id"))));
  api.post("/notes", async (c) => c.json(store.createNote((await json(c)) as unknown as NoteInput), 201));
  api.patch("/notes/:id", async (c) => c.json(store.updateNote(c.req.param("id"), (await json(c)) as NotePatch)));

  /* ----- schedule + Google Calendar (SPEC §4.13) ----- */

  const google = options.google;
  // After an edit, push it to Google a few seconds later (several quick edits → one sync).
  let syncTimer: ReturnType<typeof setTimeout> | undefined;
  const kickSync = () => {
    if (!google?.status().connected) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => google.sync().catch(() => {}), 3_000);
    syncTimer.unref?.();
  };

  api.get("/schedule", async (c) => {
    const from = c.req.query("from") ?? store.today();
    const to = c.req.query("to") ?? from;
    const own = scheduleItems(store, from, to);
    const external = google ? await google.external(from, to) : [];
    const items = [...own, ...external].sort(
      (a, b) => a.date.localeCompare(b.date) || (a.start ?? "").localeCompare(b.start ?? "") || a.key.localeCompare(b.key),
    );
    return c.json({ from, to, items });
  });
  api.get("/events/:id", (c) => c.json(store.getEvent(c.req.param("id"))));
  api.post("/events", async (c) => {
    const event = store.addEvent((await json(c)) as unknown as EventInput);
    kickSync();
    return c.json(event, 201);
  });
  api.patch("/events/:id", async (c) => {
    const event = store.updateEvent(c.req.param("id"), (await json(c)) as EventPatch);
    kickSync();
    return c.json(event);
  });
  api.delete("/events/:id", (c) => {
    store.deleteEvent(c.req.param("id"));
    kickSync();
    return c.body(null, 204);
  });

  api.get("/google", (c) =>
    c.json({ available: !!google, ...(google?.status() ?? {}), settings: store.getGoogleSettings() }),
  );
  api.patch("/google/settings", async (c) => {
    const settings = store.updateGoogleSettings((await json(c)) as GoogleSettingsPatch);
    kickSync();
    return c.json(settings);
  });
  // Connecting opens a browser on this PC and stores a token here: this machine only.
  const localOnly = (c: Context) =>
    isLocal(c) ? null : c.json({ error: "FORBIDDEN", message: "Do this on the computer running Tesseract" }, 403);
  // Desktop window opacity: changes a window on this PC, so this machine only.
  api.get("/window", (c) => c.json(options.window ? { available: true, opacity: options.window.get() } : { available: false }));
  api.put("/window", async (c) => {
    if (!options.window) throw new BrainError("RULE", "Window opacity is only available in the Windows desktop app");
    const denied = localOnly(c);
    if (denied) return denied;
    const v = (await json(c)).opacity;
    if (typeof v !== "number" || !Number.isFinite(v) || v < MIN_WINDOW_OPACITY || v > 100) {
      throw new BrainError("VALIDATION", `opacity must be a number from ${MIN_WINDOW_OPACITY} to 100`);
    }
    return c.json({ available: true, opacity: await options.window.set(v) });
  });

  // Phone & tablet: status for everyone (paired devices included); pairing links and the switch for this PC only.
  api.get("/phone", (c) => {
    const p = options.phone;
    if (!p) return c.json({ available: false });
    const pair = isLocal(c) && p.on && p.token ? { pairUrls: p.urls.map((u) => `${u}/#pair=${encodeURIComponent(p.token!)}`) } : {};
    return c.json({ available: true, on: p.on, urls: p.urls, ...pair });
  });
  api.post("/phone", async (c) => {
    if (!options.phone) throw new BrainError("RULE", "Phone access is only available in the desktop app");
    const denied = localOnly(c);
    if (denied) return denied;
    const on = (await json(c)).on;
    if (typeof on !== "boolean") throw new BrainError("VALIDATION", "on must be true or false");
    const switching = on !== options.phone.on;
    options.phone.set(on);
    return c.json({ available: true, on, switching });
  });

  // Remote access: starts/stops a process on this PC, so this machine only. State is safe to show anywhere.
  api.get("/remote", (c) => c.json(options.remote ? { available: true, ...options.remote.state() } : { available: false }));
  api.post("/remote/setup", async (c, next) => {
    if (!options.remote) throw new BrainError("RULE", "Remote access is only available on the main computer.");
    const denied = localOnly(c);
    if (denied) return denied;
    const origin = c.req.header("origin");
    const host = c.req.header("host");
    if (origin && origin !== `http://${host}` && origin !== `https://${host}`) {
      return c.json({ error: "FORBIDDEN", message: "Open Settings directly on this computer." }, 403);
    }
    return next();
  }, bodyLimit({ maxSize: 2048 }), async (c) => {
    const { tunnelId, key } = await json(c);
    return c.json({ available: true, ...options.remote!.configure({ tunnelId, key }) });
  });
  api.post("/remote/start", async (c) => {
    if (!options.remote) throw new BrainError("RULE", "Remote access is only available in the desktop app");
    const denied = localOnly(c);
    if (denied) return denied;
    const hours = (await json(c)).hours;
    if (hours !== 1 && hours !== 8 && hours !== 24) throw new BrainError("VALIDATION", "hours must be 1, 8 or 24");
    return c.json({ available: true, ...options.remote.start(hours) });
  });
  api.post("/remote/stop", (c) => {
    if (!options.remote) throw new BrainError("RULE", "Remote access is only available in the desktop app");
    return localOnly(c) ?? c.json({ available: true, ...options.remote.stop() });
  });

  api.post("/google/connect", async (c) => {
    if (!google) throw new BrainError("RULE", "Google Calendar is not available in this server");
    return localOnly(c) ?? c.json(await google.connect());
  });
  api.post("/google/sync", async (c) => {
    if (!google?.status().connected) throw new BrainError("RULE", "Google Calendar is not connected");
    try {
      return c.json(await google.sync());
    } catch (e) {
      return c.json({ error: "GOOGLE", message: (e as Error).message }, 502);
    }
  });
  api.post("/google/disconnect", async (c) => {
    if (!google) throw new BrainError("RULE", "Google Calendar is not available in this server");
    const denied = localOnly(c);
    if (denied) return denied;
    await google.disconnect();
    return c.json({ ok: true });
  });

  api.get("/activity", (c) => c.json(store.listActivity()));

  // Guide page: live token cost. Loaded on demand (the MCP server code is only needed here); cached 60 s.
  let tokenCache: { at: number; data: unknown } | null = null;
  api.get("/guide/tokens", async (c) => {
    if (!tokenCache || Date.now() - tokenCache.at > 60_000) {
      const { measureTokens } = await import("@tesseract/mcp/measure");
      tokenCache = { at: Date.now(), data: await measureTokens(store) };
    }
    return c.json(tokenCache.data);
  });
  api.post("/activity/:id/undo", (c) => c.json(store.undo(c.req.param("id"))));

  api.all("*", (c) => c.json({ error: "NOT_FOUND", message: "Unknown API route" }, 404));
  app.route("/api", api);

  // Web app (production build) with SPA fallback.
  const webDir = options.webDir;
  if (webDir && existsSync(join(webDir, "index.html"))) {
    app.use("*", serveStatic({ root: webDir }));
    // Read per request so a rebuild never serves stale asset hashes.
    // Missing files (paths with an extension) are real 404s, not the app shell.
    app.get("*", (c) =>
      /\.[a-z0-9]+$/i.test(c.req.path) ? c.notFound() : c.html(readFileSync(join(webDir, "index.html"), "utf8")),
    );
  }

  return app;
}
