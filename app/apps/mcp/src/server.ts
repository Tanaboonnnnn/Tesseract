/**
 * MCP server: exposes the Store to AI clients (SPEC §5).
 * Every write goes through Store, so it is validated and logged with the agent name.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  ASSESSMENT_SOURCES,
  BrainError,
  ClassroomStore,
  ClassroomSubmitSchema,
  DIFFICULTIES,
  GOAL_STATUS,
  MAP_STATUS,
  MAX_MAP_NODES,
  NOTE_TYPES,
  PRIORITIES,
  PROJECT_STATUS,
  PROJECT_TEMPLATES,
  TASK_STATUS,
  TOPIC_STATUS,
  VISUAL_TYPES,
  goalSummary,
  learningDetail,
  learningSummary,
  overview,
  projectSummary,
  quizContext,
  quizPublic,
  scheduleItems,
  search,
  type Store,
  visualFormat,
} from "@tesseract/core";
import type { GoogleService } from "@tesseract/gcal";
import { z } from "zod";

export const SERVER_INSTRUCTIONS = `Tesseract — the user's projects, learning, skills, goals and notes (local files).
- Start with get_overview; use list/get tools for detail only when needed.
- Ids are kebab-case. Refs: goals/<id>, projects/<id>, learning/<id>, learning/<id>#<topic>, notes/<id>, assessments/<id>, skills/<id>.
- Project maps: get_project_map / set_project_map draw a project's system (parts, lanes, links); link parts to tasks and keep set_map_focus on the part being worked on.
- Visuals (call visual_formats first, then save_visual with the topic id): to TEACH a topic save a "lesson": blocks of
  text, formula (LaTeX, \term{id}{...} parts explained), trace (step-by-step with every variable's current value),
  motion (native flow, reveal or compare), plot (real graphs, sliders), sim (the app runs kmeans / scheduling / gradient / value-iteration / q-learning from your
  inputs), check (self-test). Any graph → plot. Diagrams (state, gantt, grid, tree) only for structure. html is a
  sandboxed last resort. Prefer native motion for sequencing and comparison. Start with one learning outcome and end with a self-check that explains why.
- Learning maps are drawn from topics: phase = column, depends_on = links. Set them with add_topic / update_topic.
- Schedule: get_schedule shows the week; add_event/update_event plan time blocks (synced to Google Calendar).
- Be honest: grade strictly, never inflate scores or skill levels. Raising a level needs evidence.
- Every write is logged with your agent name and can be undone (get_activity, undo_change).`;

/* ---------- helpers ---------- */

function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

/** Business errors go back to the AI as tool errors it can read and fix. */
function run(fn: () => unknown): CallToolResult {
  try {
    return ok(fn());
  } catch (e) {
    if (e instanceof BrainError) return { isError: true, content: [{ type: "text", text: `[${e.code}] ${e.message}` }] };
    throw e;
  }
}

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;

/* ---------- shared input pieces ---------- */

const id = z.string(); // "Ids are kebab-case" is said once, in SERVER_INSTRUCTIONS
const date = z.string().describe("YYYY-MM-DD");
const tags = z.array(z.string()).optional();
const body = z.string().optional().describe("Markdown body");
const detail = z.boolean().optional().describe("Return full data instead of a summary");

const taskFields = {
  title: z.string(),
  status: z.enum(TASK_STATUS).optional(),
  priority: z.enum(PRIORITIES).optional(),
  due: date.nullable().optional(),
  phase: z.string().nullable().optional().describe("One of the project's phases"),
};
const topicFields = {
  title: z.string(),
  phase: z.string().optional().describe("One of the learning item's phases (default: first)"),
  status: z.enum(TOPIC_STATUS).optional(),
  skills: z.array(z.string()).optional().describe("Skill ids from the taxonomy"),
  depends_on: z.array(z.string()).optional().describe("Topic ids in the same learning item"),
  last_reviewed: date.nullable().optional(),
  last_score: z.number().min(0).max(100).nullable().optional(),
};
const topicInput = z.object({ id, ...topicFields });
const courseFields = {
  source: z.enum(["manual", "leb2"]).optional(),
  external_id: z.string().nullable().optional(),
  term: z.string().nullable().optional(),
  schedule: z
    .array(z.object({ day: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]), time: z.string(), room: z.string().nullable().optional() }))
    .optional(),
  assignments: z
    .array(
      z.object({
        id,
        title: z.string(),
        due: date.nullable().optional(),
        status: z.enum(["todo", "doing", "done"]).optional(),
        score: z.number().nullable().optional(),
        max_score: z.number().nullable().optional(),
      }),
    )
    .optional(),
  exams: z
    .array(
      z.object({
        id,
        title: z.string(),
        date: date.nullable().optional(),
        weight: z.number().nullable().optional(),
        score: z.number().nullable().optional(),
        max_score: z.number().nullable().optional(),
      }),
    )
    .optional(),
  grade: z.string().nullable().optional(),
};

/* ---------- server ---------- */

function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export interface ServerOptions {
  /** Google Calendar (optional): read-only overlay in get_schedule and sync_calendar. */
  google?: Pick<GoogleService, "status" | "sync" | "external">;
  /**
   * "remote": cloud chat apps reaching this PC through a tunnel (Phase 8a). Only REMOTE_TOOLS are registered:
   * reads plus a few undoable, low-risk writes. No deletes, undo, bulk redraws, skill/assessment changes or inbox.
   */
  profile?: "local" | "remote" | "classroom";
}

/** Least-privilege tool set for the remote profile (SPEC §5). */
export const REMOTE_TOOLS = [
  // read
  "get_overview", "search", "list_goals", "list_projects", "get_project", "get_project_map", "list_learning",
  "get_learning", "get_review_queue", "get_skill_profile", "list_assessments", "list_notes", "get_note",
  "list_quizzes", "get_schedule", "get_visuals", "visual_formats", "generate_quiz_context", "get_activity",
  // low-risk, undoable writes
  "add_task", "update_task", "add_topic", "update_topic", "add_event", "update_event", "create_note", "create_quiz",
  "save_visual", "set_map_focus",
] as const;

const REMOTE_NOTE = `
- You are connected remotely (cloud chat through a tunnel). This is a read-mostly tool set: deleting, undoing and
  changing skill levels or assessments are not available here; ask the user to do those in the app.`;

const CLASSROOM_EXAMPLE = {
  schema_version: 1, course_id: "synthetic-example", title: "Synthetic example", language: "en",
  sources: [{ id: "ref", title: "Illustrative only", url: "https://example.com/reference", accessed_on: "2026-01-01", rights: "reference-only", summary: "Shape example; not a factual course." }],
  lessons: [{ id: "intro", title: "Example lesson", objective: "Demonstrate payload shape", source_ids: ["ref"], blocks: [{ type: "text", markdown: "Write supported Markdown here." }],
    questions: [{ id: "reason", type: "explain", prompt: "Explain in your own words.", rubric: ["State a reason"], model_answer: "Illustrative answer." }] }],
} as const;

function classroomServer(store: Store): McpServer {
  const c = new ClassroomStore(store.dataDir);
  const server = new McpServer({ name: "tesseract-classroom", version: "0.1.0" }, {
    instructions: "Draft-only. Use classroom_format if you need the bundle shape. Submit once with a stable request_id. On timeout call get_draft_status first. Unknown means no durable receipt, not proof of no execution. Never automatically replay a write; if approved, reuse the same ID and payload. Only the owner can publish locally. Do not send secrets, raw HTML, copied articles, or private files.",
  });
  server.registerTool("classroom_format", { description: "Compact bundle example and constraints.", annotations: READ }, () => ok({
    example: CLASSROOM_EXAMPLE, limits: { max_bytes: 262144, max_lessons: 24 },
    blocks: { text: "{type, markdown}", visual: "{type, visual: typed Panya/Tesseract renderer data, fallback}" },
    questions: { explain: "{id,type,prompt,rubric,model_answer}", multi: "{id,type,prompt,choices,correct,explanation}" },
    labs: "{platform,environment,prerequisites,steps,expected,cleanup?}",
  }));
  server.registerTool("get_draft_receipt", { description: "Look up receipt by request ID without generating another draft.", inputSchema: { request_id: ClassroomSubmitSchema.shape.request_id }, annotations: READ },
    ({ request_id }) => run(() => c.getReceipt(request_id) ?? { ok: false, status: "not_found" }));
  server.registerTool("get_draft_status", { description: "Read-only status by request ID. Unknown means there is no durable receipt yet. Does not replay.", inputSchema: { request_id: ClassroomSubmitSchema.shape.request_id }, annotations: READ },
    ({ request_id }) => run(() => {
      const receipt = c.getReceipt(request_id);
      return receipt ? { request_id, status: "staged", receipt } : { request_id, status: "unknown" };
    }));
  server.registerTool("submit_course_draft", { description: "Validate and stage one sourced course bundle. Same ID and payload return the same receipt. Never publishes.", inputSchema: ClassroomSubmitSchema.shape, annotations: WRITE },
    async (input, extra) => {
      const progressToken = extra._meta?.progressToken;
      if (progressToken !== undefined) {
        await extra.sendNotification({ method: "notifications/progress", params: { progressToken, progress: 0, total: 1, message: "running" } });
      }
      if (extra.signal.aborted) return { isError: true, content: [{ type: "text", text: "Request cancelled before staging. Check status by request ID." }] };
      return run(() => c.submit(input));
    });
  return server;
}

export function createServer(store: Store, options: ServerOptions = {}): McpServer {
  if (options.profile === "classroom") return classroomServer(store);
  const remote = options.profile === "remote";
  const server = new McpServer({ name: "tesseract", version: "0.1.0" }, { instructions: SERVER_INSTRUCTIONS + (remote ? REMOTE_NOTE : "") });
  const allowed = new Set<string>(REMOTE_TOOLS);
  const register = server.registerTool.bind(server);
  // Remote profile: tools outside the allow-list are never registered, so they can't be listed or called.
  const tool = ((name: string, ...rest: unknown[]) => (remote && !allowed.has(name) ? undefined : (register as (...a: unknown[]) => unknown)(name, ...rest))) as typeof register;

  /* ----- overview & search ----- */

  tool(
    "get_overview",
    { description: "Compact snapshot of everything: goals, projects, learning, due tasks, review queue, skill domains.", annotations: READ },
    () => run(() => overview(store)),
  );

  tool(
    "search",
    { description: "Case-insensitive text search across all entities. Returns refs.", inputSchema: { query: z.string().min(2) }, annotations: READ },
    ({ query }) => run(() => search(store, query)),
  );

  /* ----- goals ----- */

  tool("list_goals", { description: "Goals with progress.", annotations: READ }, () =>
    run(() => store.listGoals().map(goalSummary)),
  );

  tool(
    "upsert_goal",
    {
      description: "Create or update a goal.",
      inputSchema: { id, title: z.string(), status: z.enum(GOAL_STATUS).optional(), target_date: date.nullable().optional(), tags, body },
      annotations: WRITE,
    },
    (args) => run(() => goalSummary(store.upsertGoal(args))),
  );

  /* ----- projects & tasks ----- */

  tool("list_projects", { description: "Project summaries (phase, progress, task counts).", annotations: READ }, () =>
    run(() => store.listProjects().map(projectSummary)),
  );

  tool(
    "get_project",
    { description: "One project with its tasks.", inputSchema: { id, detail }, annotations: READ },
    ({ id, detail }) =>
      run(() => {
        const p = store.getProject(id);
        return detail ? p : { ...projectSummary(p), tasks: p.tasks };
      }),
  );

  tool(
    "create_project",
    {
      description: "Create a project, optionally with initial tasks. Default phases: ideation, plan, build, test, release.",
      inputSchema: {
        id,
        title: z.string(),
        template: z.enum(PROJECT_TEMPLATES).optional(),
        status: z.enum(PROJECT_STATUS).optional(),
        goal: z.string().nullable().optional(),
        phases: z.array(z.string()).optional(),
        phase: z.string().optional(),
        start: date.nullable().optional(),
        due: date.nullable().optional(),
        repo: z.string().nullable().optional(),
        stack: z.array(z.string()).optional(),
        tags,
        body,
        tasks: z.array(z.object(taskFields)).optional(),
      },
      annotations: WRITE,
    },
    (args) => run(() => projectSummary(store.createProject(args))),
  );

  tool(
    "update_project",
    {
      description: "Update project fields. progress_override: number to override auto progress, null to clear.",
      inputSchema: {
        id,
        title: z.string().optional(),
        template: z.enum(PROJECT_TEMPLATES).optional(),
        status: z.enum(PROJECT_STATUS).optional(),
        goal: z.string().nullable().optional(),
        phases: z.array(z.string()).optional(),
        phase: z.string().optional(),
        progress_override: z.number().min(0).max(100).nullable().optional(),
        start: date.nullable().optional(),
        due: date.nullable().optional(),
        repo: z.string().nullable().optional(),
        stack: z.array(z.string()).optional(),
        tags,
        body,
      },
      annotations: WRITE,
    },
    ({ id, ...patch }) => run(() => projectSummary(store.updateProject(id, patch))),
  );

  tool(
    "add_task",
    { description: "Add a task to a project.", inputSchema: { project: id, ...taskFields }, annotations: WRITE },
    ({ project, ...task }) => run(() => store.addTask(project, task)),
  );

  tool(
    "update_task",
    {
      description: "Update a task (status, priority, due, phase, title).",
      inputSchema: {
        project: id,
        task: z.string().describe("Task id, e.g. t-003"),
        ...taskFields,
        title: z.string().optional(),
      },
      annotations: WRITE,
    },
    ({ project, task, ...patch }) => run(() => store.updateTask(project, task, patch)),
  );

  tool(
    "delete_task",
    { description: "Delete a task.", inputSchema: { project: id, task: z.string() }, annotations: DESTRUCTIVE },
    ({ project, task }) =>
      run(() => {
        store.deleteTask(project, task);
        return { deleted: `${project}/${task}` };
      }),
  );

  /* ----- learning ----- */

  tool("list_learning", { description: "Roadmaps and courses with progress and review counts.", annotations: READ }, () =>
    run(() => store.listLearning().map((l) => learningSummary(l, store.today()))),
  );

  tool(
    "get_learning",
    { description: "One roadmap/course with all topics and their review status.", inputSchema: { id }, annotations: READ },
    ({ id }) => run(() => learningDetail(store.getLearning(id))),
  );

  tool(
    "create_roadmap",
    {
      description:
        "Create a learning roadmap with phases and topics in one call. Link topics to skill ids (see get_skill_profile) and to a goal.",
      inputSchema: {
        id,
        title: z.string(),
        goal: z.string().nullable().optional(),
        phases: z.array(z.string()).min(1),
        tags,
        body,
        topics: z.array(topicInput).optional(),
      },
      annotations: WRITE,
    },
    (args) => run(() => learningSummary(store.createLearning({ ...args, type: "roadmap" }), store.today())),
  );

  tool(
    "create_course",
    {
      description: "Create a university/other course with topics, schedule, assignments and exams.",
      inputSchema: {
        id,
        title: z.string(),
        goal: z.string().nullable().optional(),
        phases: z.array(z.string()).min(1),
        tags,
        body,
        topics: z.array(topicInput).optional(),
        ...courseFields,
      },
      annotations: WRITE,
    },
    (args) => run(() => learningSummary(store.createLearning({ ...args, type: "course" }), store.today())),
  );

  tool(
    "update_learning",
    {
      description: "Update a roadmap/course (title, goal, phases, course fields like exams/assignments/grade).",
      inputSchema: {
        id,
        title: z.string().optional(),
        goal: z.string().nullable().optional(),
        phases: z.array(z.string()).optional(),
        tags,
        body,
        ...courseFields,
      },
      annotations: WRITE,
    },
    ({ id, ...patch }) => run(() => learningSummary(store.updateLearning(id, patch), store.today())),
  );

  tool(
    "add_topic",
    { description: "Add a topic to a roadmap/course.", inputSchema: { learning: id, topic: topicInput }, annotations: WRITE },
    ({ learning, topic }) => run(() => store.addTopic(learning, topic)),
  );

  tool(
    "update_topic",
    {
      description: "Update a topic. Setting status learning/understood marks it reviewed today.",
      inputSchema: { learning: id, topic: z.string(), ...topicFields, title: z.string().optional() },
      annotations: WRITE,
    },
    ({ learning, topic, ...patch }) => run(() => store.updateTopic(learning, topic, patch)),
  );

  /* ----- learning visuals (SPEC §4.16) ----- */

  tool(
    "visual_formats",
    {
      description:
        "Study visual types and, for one type, its fields + a full example. Best for teaching: lesson (text, formula, step-by-step trace, native motion, plot, simulation, self-check). Also plot, state, gantt, grid, tree, html. Call before save_visual.",
      inputSchema: { type: z.enum(VISUAL_TYPES).optional() },
      annotations: READ,
    },
    ({ type }) => run(() => visualFormat(type)),
  );

  tool(
    "save_visual",
    {
      description:
        "Save a study visual for a learning item (drawn by the app, opened from the topic's Review button). Prefer type lesson for formulas, calculations and algorithms. Same id replaces it. Format: visual_formats.",
      inputSchema: {
        learning: id,
        id: id.optional(),
        title: z.string(),
        topic: z.string().nullable().optional().describe("Topic id in this learning item"),
        type: z.enum(VISUAL_TYPES),
        data: z.record(z.string(), z.unknown()),
        steps: z.array(z.object({ text: z.string(), highlight: z.array(z.string()).optional() })).optional(),
        step_mode: z.enum(["highlight", "build"]).optional(),
      },
      annotations: WRITE,
    },
    ({ learning, ...input }) =>
      run(() => {
        const v = store.saveVisual(learning, input);
        return { saved: `learning/${learning}/visuals/${v.id}`, title: v.title, type: v.type, topic: v.topic, steps: v.steps.length };
      }),
  );

  tool(
    "get_visuals",
    { description: "List the visuals of a learning item, or one visual in full by id.", inputSchema: { learning: id, id: id.optional() }, annotations: READ },
    ({ learning, id: vid }) => run(() => (vid ? store.getVisual(learning, vid) : store.listVisuals(learning))),
  );

  tool(
    "delete_visual",
    { description: "Delete a visual (undoable).", inputSchema: { learning: id, id }, annotations: DESTRUCTIVE },
    ({ learning, id: vid }) =>
      run(() => {
        store.deleteVisual(learning, vid);
        return { deleted: vid };
      }),
  );

  tool(
    "get_review_queue",
    { description: "Topics needing review, most urgent first. Reasons: stale (>14 days), weak (<60), manual.", annotations: READ },
    () =>
      run(() =>
        store.getReviewQueue().map((r) => ({
          ref: `learning/${r.learning_id}#${r.topic.id}`,
          title: r.topic.title,
          reasons: r.topic.review.reasons,
          days_since_review: r.topic.review.days_since_review,
          last_score: r.topic.last_score,
        })),
      ),
  );

  /* ----- skills & assessments ----- */

  tool(
    "get_skill_profile",
    {
      description: "Skill levels 0–100. No domain: level per domain. With domain: its skills (computed, AI adjustment, final).",
      inputSchema: { domain: z.string().optional() },
      annotations: READ,
    },
    ({ domain }) =>
      run(() => {
        const profile = store.getSkillProfile();
        if (!domain) return profile.map((d) => ({ id: d.id, title: d.title, level: d.level, skills: d.skills.map((s) => s.id) }));
        const d = profile.find((x) => x.id === domain);
        if (!d) throw new BrainError("NOT_FOUND", `Domain "${domain}" not found`);
        return d;
      }),
  );

  tool(
    "adjust_skill_level",
    {
      description:
        "Adjust a skill level from your analysis of the user's answers. Honest only: total adjustment stays within ±15; " +
        "increases require evidence refs that exist (assessments/<id>, notes/<id>, projects/<id>). Prefer record_assessment when there is a score.",
      inputSchema: {
        skill: id,
        delta: z.number().int().min(-15).max(15),
        reason: z.string().min(10),
        evidence: z.array(z.string()).optional(),
      },
      annotations: WRITE,
    },
    (args) => run(() => store.adjustSkill(args)),
  );

  tool(
    "generate_quiz_context",
    {
      description: "Context for writing a fair quiz: skill levels, known weaknesses, recent results, grading guidance.",
      inputSchema: { skill: z.string().optional(), topic_ref: z.string().optional().describe("learning/<id>#<topic>") },
      annotations: READ,
    },
    (args) => run(() => quizContext(store, args)),
  );

  tool(
    "create_quiz",
    {
      description:
        "Write a quiz the user takes in the web app (answers stay hidden there until submitted; the server grades it and " +
        "records a web-quiz assessment). Use generate_quiz_context first. Question types: single (one right choice, " +
        "answer = its index), multi (select all that apply, answers = indexes; right only if exactly that set), short " +
        "(typed answer checked against accept: case/spacing ignored, numbers compared as numbers within tolerance). " +
        "Mix them; use short for calculations and definitions.",
      inputSchema: {
        title: z.string(),
        skills: z.record(z.string(), z.number()).describe("{skill_id: weight}, weights sum to 1"),
        difficulty: z.enum(DIFFICULTIES),
        topic_refs: z.array(z.string()).optional().describe("learning/<id>#<topic>"),
        questions: z
          .array(
            z.union([
              z.object({
                type: z.literal("single").optional(),
                q: z.string(),
                choices: z.array(z.string()).min(2).max(8),
                answer: z.number().int().min(0).describe("Index of the correct choice"),
                explain: z.string().optional().describe("Why the answer is right; shown after submitting"),
              }),
              z.object({
                type: z.literal("multi"),
                q: z.string(),
                choices: z.array(z.string()).min(2).max(8),
                answers: z.array(z.number().int().min(0)).min(1).describe("Indexes of ALL correct choices"),
                explain: z.string().optional(),
              }),
              z.object({
                type: z.literal("short"),
                q: z.string(),
                accept: z.array(z.string()).min(1).max(10).describe("Accepted answers (synonyms, units-free numbers)"),
                tolerance: z.number().min(0).optional().describe("For numeric answers: allowed absolute difference"),
                explain: z.string().optional(),
              }),
            ]),
          )
          .min(1)
          .max(50),
        id: z.string().optional(),
        tags,
      },
      annotations: WRITE,
    },
    (args) =>
      run(() => {
        const q = store.createQuiz(args);
        return { id: q.id, title: q.title, questions: q.questions.length, status: q.status };
      }),
  );

  tool(
    "list_quizzes",
    { description: "Quizzes and their status (open = waiting for the user).", annotations: READ },
    () =>
      run(() =>
        store.listQuizzes().map((q) => ({
          id: q.id,
          title: q.title,
          status: q.status,
          questions: q.questions.length,
          assessment: q.assessment,
          author: q.author,
        })),
      ),
  );

  tool(
    "record_assessment",
    {
      description:
        "Record a quiz/CTF/lab/exam result. skills: {skill_id: weight}, weights sum to 1. Linked topics get last_score/last_reviewed updated.",
      inputSchema: {
        title: z.string(),
        source: z.enum(ASSESSMENT_SOURCES),
        skills: z.record(z.string(), z.number()),
        score: z.number().min(0).max(100),
        difficulty: z.enum(DIFFICULTIES),
        date: date.optional(),
        topic_refs: z.array(z.string()).optional().describe("learning/<id>#<topic>"),
        raw: z.string().nullable().optional().describe("Inbox file this came from, e.g. inbox/ctf-01.txt"),
        id: z.string().optional(),
        tags,
        body: z.string().optional().describe("Questions, answers and your analysis (Markdown)"),
      },
      annotations: WRITE,
    },
    (args) =>
      run(() => {
        const { body: _b, ...a } = store.recordAssessment(args);
        return a;
      }),
  );

  tool(
    "list_assessments",
    { description: "Assessments (optionally for one skill), newest first.", inputSchema: { skill: z.string().optional() }, annotations: READ },
    ({ skill }) =>
      run(() =>
        store
          .listAssessments(skill ? { skill } : {})
          .sort((a, b) => b.date.localeCompare(a.date))
          .map(({ body: _b, ...a }) => a),
      ),
  );

  tool("list_inbox", { description: "Raw files the user dropped in inbox/ (CTF/lab problems, results).", annotations: READ }, () =>
    run(() => store.listInbox()),
  );

  tool(
    "read_inbox",
    { description: "Read one inbox file.", inputSchema: { name: z.string() }, annotations: READ },
    ({ name }) => run(() => ({ name, content: store.readInbox(name) })),
  );

  /* ----- notes ----- */

  tool(
    "list_notes",
    { description: "Notes (id, title, type, tags, links).", inputSchema: { type: z.enum(NOTE_TYPES).optional() }, annotations: READ },
    ({ type }) => run(() => store.listNotes(type ? { type } : {}).map(({ body: _b, ...n }) => n)),
  );

  tool("get_note", { description: "One note with its body.", inputSchema: { id }, annotations: READ }, ({ id }) =>
    run(() => store.getNote(id)),
  );

  tool(
    "create_note",
    {
      description: "Create a note. type: note (knowledge), decision (choice + why), log (what happened). Use [[wikilinks]] in body.",
      inputSchema: {
        id,
        title: z.string(),
        type: z.enum(NOTE_TYPES).optional(),
        tags,
        links: z.array(z.string()).optional().describe("Refs like projects/<id>, skills/<id>"),
        body,
      },
      annotations: WRITE,
    },
    (args) => run(() => store.createNote(args)),
  );

  tool(
    "update_note",
    {
      description: "Update a note.",
      inputSchema: {
        id,
        title: z.string().optional(),
        type: z.enum(NOTE_TYPES).optional(),
        tags,
        links: z.array(z.string()).optional(),
        body,
      },
      annotations: WRITE,
    },
    ({ id, ...patch }) => run(() => store.updateNote(id, patch)),
  );

  /* ----- system map (SPEC §4.14) ----- */

  const nodeFields = {
    label: z.string(),
    lane: z.string().describe("One of the map's lanes (columns, left → right)"),
    status: z.enum(MAP_STATUS).nullable().optional().describe("Omit to derive from linked tasks. 'done' is refused while linked tasks are open."),
    tasks: z.array(z.string()).optional().describe("Task ids of this project that build this part"),
    note: z.string().optional(),
  };
  const compactMap = (m: NonNullable<ReturnType<Store["getProjectMap"]>>) => ({
    focus: m.focus,
    lanes: m.lanes,
    summary: m.summary,
    nodes: m.nodes.map((n) => ({ id: n.id, label: n.label, lane: n.lane, status: n.effective_status, progress: n.progress, tasks: n.tasks, ...(n.note ? { note: n.note } : {}) })),
    edges: m.edges,
  });

  tool(
    "get_project_map",
    { description: "A project's system map: parts (nodes) in lanes, connections, honest status per part, and 'you are here' (focus).", inputSchema: { project: id }, annotations: READ },
    ({ project }) =>
      run(() => {
        const m = store.getProjectMap(project);
        return m ? compactMap(m) : { map: null, hint: "No map yet. Draw one with set_project_map." };
      }),
  );

  tool(
    "set_project_map",
    {
      description:
        "Draw or redraw a project's whole system map. Lanes are columns left → right (e.g. input, core, output or frontend, api, data). Link parts to tasks so status stays honest; set focus to the part being worked on now.",
      inputSchema: {
        project: id,
        lanes: z.array(z.string()).min(1),
        nodes: z.array(z.object({ id, ...nodeFields })).max(MAX_MAP_NODES),
        edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() })).optional(),
        focus: z.string().nullable().optional(),
      },
      annotations: WRITE,
    },
    ({ project, ...map }) => run(() => compactMap(store.setProjectMap(project, map))),
  );

  tool(
    "update_map_node",
    {
      description: "Update one part of a project's map, or add it if the id is new (label and lane required then).",
      inputSchema: { project: id, node: id, ...nodeFields, label: z.string().optional(), lane: nodeFields.lane.optional() },
      annotations: WRITE,
    },
    ({ project, node, ...patch }) => run(() => compactMap(store.updateMapNode(project, node, patch))),
  );

  tool(
    "set_map_focus",
    { description: "Move 'you are here' on a project's map (null clears it).", inputSchema: { project: id, node: id.nullable() }, annotations: WRITE },
    ({ project, node }) => run(() => compactMap(store.setMapFocus(project, node))),
  );

  /* ----- schedule (SPEC §4.13) ----- */

  const time = z.string().describe("HH:MM 24h");
  tool(
    "get_schedule",
    {
      description:
        "Calendar for a date range (default 7 days): own events, weekly classes, task due dates, assignments, exams, and (if connected) read-only Google events.",
      inputSchema: { from: date.optional().describe("YYYY-MM-DD, default today"), to: date.optional() },
      annotations: READ,
    },
    async ({ from, to }) => {
      const start = from ?? store.today();
      const end = to ?? addDaysIso(start, 6);
      const own = run(() => scheduleItems(store, start, end));
      if (own.isError || !options.google) return own;
      const external = await options.google.external(start, end);
      const items = [...JSON.parse((own.content[0] as { text: string }).text), ...external].sort(
        (a: { date: string; start: string | null }, b: { date: string; start: string | null }) =>
          a.date.localeCompare(b.date) || (a.start ?? "").localeCompare(b.start ?? ""),
      );
      return ok(items);
    },
  );

  tool(
    "add_event",
    {
      description: "Add an event to the user's schedule (synced to the 'Tesseract' Google calendar). Omit start/end for all-day.",
      inputSchema: {
        title: z.string(),
        date,
        start: time.optional(),
        end: time.optional(),
        links: z.array(z.string()).optional().describe("Refs, e.g. learning/kubernetes, projects/weather-app"),
        notes: z.string().optional(),
      },
      annotations: WRITE,
    },
    (args) => run(() => store.addEvent(args)),
  );

  tool(
    "update_event",
    {
      description: "Move or edit an event. Set start and end to null to make it all-day.",
      inputSchema: {
        id,
        title: z.string().optional(),
        date: date.optional(),
        start: time.nullable().optional(),
        end: time.nullable().optional(),
        links: z.array(z.string()).optional(),
        notes: z.string().optional(),
      },
      annotations: WRITE,
    },
    ({ id, ...patch }) => run(() => store.updateEvent(id, patch)),
  );

  tool(
    "delete_event",
    { description: "Delete an event (also removed from Google on the next sync).", inputSchema: { id }, annotations: DESTRUCTIVE },
    ({ id }) =>
      run(() => {
        store.deleteEvent(id);
        return { deleted: id };
      }),
  );

  tool(
    "sync_calendar",
    { description: "Two-way sync with Google Calendar now (needs a one-time connect in the app).", annotations: WRITE },
    async () => {
      if (!options.google?.status().connected) {
        return { isError: true, content: [{ type: "text", text: "Google Calendar is not connected. Connect it on the Schedule page." }] };
      }
      try {
        return ok(await options.google.sync());
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: (e as Error).message }] };
      }
    },
  );

  /* ----- history ----- */

  tool(
    "get_activity",
    { description: "Recent changes (who changed what), newest first.", inputSchema: { limit: z.number().int().min(1).max(20).optional() }, annotations: READ },
    ({ limit }) => run(() => store.listActivity(limit)),
  );

  tool(
    "undo_change",
    { description: "Undo one change by activity id. Fails if newer changes touched the same files.", inputSchema: { id: z.string() }, annotations: DESTRUCTIVE },
    ({ id }) => run(() => store.undo(id)),
  );

  slimToolList(server);
  return server;
}

/**
 * The tool list is sent to the AI at the start of every session, so every byte costs tokens each time.
 * Drop the boilerplate the SDK adds to all tools: "$schema" on each input schema and
 * execution.taskSupport "forbidden" (already the default). Measured: about -15% of the tool list.
 */
function slimToolList(server: McpServer): void {
  // The SDK has no public hook for this; wrap its tools/list handler (guarded by a test).
  const handlers = (server.server as unknown as { _requestHandlers?: Map<string, (...a: unknown[]) => Promise<unknown>> })._requestHandlers;
  const list = handlers?.get("tools/list");
  if (!handlers || !list) return;
  handlers.set("tools/list", async (...args) => {
    const res = (await list(...args)) as { tools: Record<string, unknown>[] };
    for (const t of res.tools) {
      delete (t.inputSchema as Record<string, unknown>).$schema;
      if ((t.execution as { taskSupport?: string } | undefined)?.taskSupport === "forbidden") delete t.execution;
    }
    return res;
  });
}
