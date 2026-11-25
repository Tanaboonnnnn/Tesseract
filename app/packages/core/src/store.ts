/**
 * Store — the ONLY code that writes to the data folder (AGENTS.md rule 1).
 * Every write: validate → check references/rules → write atomically → append activity log.
 * Reads always go to disk, so several processes (MCP, web server) see fresh data.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import {
  average,
  computeSkillProfile,
  effectiveTopicStatus,
  learningProgress,
  projectProgress,
  roundScore,
  toIsoDate,
  topicReview,
  type DomainLevel,
  type SkillLevel,
  type TopicReview,
} from "./calc.ts";
import { resolveDataDir } from "./config.ts";
import { BrainError } from "./errors.ts";
import { type Visual, type VisualInput, VisualSchema, type VisualSummary } from "./visuals.ts";
import {
  fileInfo,
  listFiles,
  listSubdirsWith,
  listTree,
  removeIfEmpty,
  parseFrontmatter,
  parseYaml,
  readText,
  toMarkdown,
  toYaml,
  writeAtomic,
} from "./files.ts";
import {
  AdjustmentListSchema,
  AdjustmentSchema,
  AssessmentSchema,
  DEFAULT_PHASES,
  EventListSchema,
  EventSchema,
  GoalSchema,
  GoogleSettingsSchema,
  Id,
  ProjectMapSchema,
  LearningSchema,
  MAX_AI_ADJUSTMENT,
  NoteSchema,
  ProjectSchema,
  QuizSchema,
  TaskListSchema,
  TaskSchema,
  TaxonomySchema,
  TopicListSchema,
  TopicSchema,
  type Adjustment,
  type AdjustmentInput,
  type Assessment,
  type AssessmentInput,
  type EventInput,
  type EventPatch,
  type Goal,
  type GoalInput,
  type GoogleSettings,
  type GoogleSettingsPatch,
  type Learning,
  type LearningInput,
  type LearningPatch,
  type MapNode,
  type MapNodePatch,
  type MapStatus,
  type Note,
  type NoteInput,
  type NotePatch,
  type Project,
  type ProjectInput,
  type ProjectMap,
  type ProjectMapInput,
  type ProjectPatch,
  type Question,
  type Quiz,
  type QuizInput,
  type ScheduleEvent,
  type Task,
  type TaskInput,
  type TaskPatch,
  type Taxonomy,
  type Topic,
  type TopicInput,
  type TopicPatch,
  type TopicStatus,
  type WithBody,
} from "./schemas.ts";

/* ---------- public types ---------- */

export interface StoreOptions {
  /** Defaults to BRAIN_DATA_DIR or <repo>/data. */
  dataDir?: string;
  /** Who is writing: "claude-code", "codex", "web-ui", ... Logged on every change. */
  agent: string;
  /** Injectable clock for tests. */
  now?: () => Date;
  /** How many changes the activity log keeps (and can undo). Default 20. */
  activityLimit?: number;
  /** Also `git commit` each change inside the data folder. Default false. */
  gitCommit?: boolean;
}

export type GoalView = WithBody<Goal> & { progress: number };
export type ProjectView = WithBody<Project> & { tasks: Task[]; progress: number };
export type TopicView = Topic & { effective_status: TopicStatus; review: TopicReview };
export type LearningView = WithBody<Learning> & { topics: TopicView[]; progress: number };
export type SkillView = SkillLevel & { domain: string; adjustments: Adjustment[] };

export interface DeleteImpact {
  ref: string;
  title: string;
  /** Files inside the item's folder. */
  files: number;
  /** tasks + map, or topics + visuals. */
  counts: Record<string, number>;
  /** Notes / events whose link to it is removed. */
  unlinked: string[];
  /** Open quizzes on it that are deleted too. */
  quizzes: string[];
}

export type MapNodeView = MapNode & { effective_status: MapStatus; progress: number | null };
export type ProjectMapView = Omit<ProjectMap, "nodes"> & {
  project: string;
  nodes: MapNodeView[];
  summary: { parts: number; done: number; building: number; blocked: number; focus: { id: string; label: string } | null };
};

/** What the user gave for one question: a choice index (single), indexes (multi) or text (short). */
export type Given = number | number[] | string;

const norm = (s: string) => s.normalize("NFKC").trim().replace(/\s+/g, " ").replace(/[.。]$/, "").toLowerCase();
const asNumber = (s: string) => {
  const t = s.trim().replace(/,/g, "");
  return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? Number(t) : null;
};

/** Grade one question honestly (SPEC §4.12). Throws VALIDATION for a malformed answer. */
export function gradeQuestion(q: Question, given: unknown, n: number): { chosen: Given; correct: boolean } {
  const bad = (msg: string) => new BrainError("VALIDATION", `Answer ${n}: ${msg}`);
  switch (q.type) {
    case "single": {
      if (typeof given !== "number" || !Number.isInteger(given) || given < 0 || given >= q.choices.length) throw bad(`must be a choice index 0-${q.choices.length - 1}`);
      return { chosen: given, correct: given === q.answer };
    }
    case "multi": {
      if (!Array.isArray(given) || given.length === 0 || !given.every((g) => Number.isInteger(g) && g >= 0 && g < q.choices.length)) {
        throw bad(`must be a non-empty list of choice indexes 0-${q.choices.length - 1}`);
      }
      const picked = [...new Set(given as number[])].sort((a, b) => a - b);
      const key = [...q.answers].sort((a, b) => a - b);
      return { chosen: picked, correct: picked.length === key.length && picked.every((p, i) => p === key[i]) };
    }
    case "short": {
      if (typeof given !== "string" || !given.trim()) throw bad("must be non-empty text");
      if (given.length > 500) throw bad("is too long (500 characters max)");
      const text = given.trim();
      const num = asNumber(text);
      const correct = q.accept.some((a) => {
        const an = asNumber(a);
        if (num !== null && an !== null) return Math.abs(num - an) <= (q.tolerance ?? 0) + 1e-9;
        return norm(a) === norm(text);
      });
      return { chosen: text, correct };
    }
  }
}

/** Readable answer for the assessment body. */
function shown(q: Question, v: Given): string {
  if (q.type === "short") return String(v);
  const idx = Array.isArray(v) ? v : [v as number];
  return idx.map((i) => q.choices[i]).join("; ");
}

export interface QuizResult {
  quiz: Quiz;
  assessment: WithBody<Assessment>;
  score: number;
  correct: number;
  total: number;
  results: (Question & { chosen: Given; correct: boolean })[];
}

export interface ReviewItem {
  learning_id: string;
  learning_title: string;
  topic: TopicView;
}

export interface FileChange {
  path: string;
  before: string | null;
  after: string | null;
}

export interface ActivityEntry {
  id: string;
  ts: string;
  agent: string;
  action: "create" | "update" | "delete" | "undo";
  entity: string;
  summary: string;
  files: FileChange[];
}

export type ActivitySummary = Omit<ActivityEntry, "files"> & { files: string[] };

export interface Problem {
  path: string;
  error: string;
}

/* ---------- helpers ---------- */

const ACTIVITY_LOG = ".activity/log.jsonl";
const TAXONOMY = "skills/taxonomy.yaml";
const ADJUSTMENTS = "skills/adjustments.yaml";
const EVENTS = "schedule/events.yaml";
const GOOGLE_SETTINGS = "schedule/google.yaml";
const MAX_VISUAL_BYTES: Record<string, number> = { lesson: 250_000, html: 450_000 };
const MAX_VISUAL_DEFAULT = 64_000;

function validate<S extends z.ZodType>(schema: S, data: unknown, what: string): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new BrainError("VALIDATION", `Invalid ${what}:\n${z.prettifyError(r.error)}`);
  return r.data;
}

function checkId(id: unknown, what: string): string {
  const r = Id.safeParse(id);
  if (!r.success) throw new BrainError("VALIDATION", `Invalid ${what} id "${String(id)}": must be kebab-case`);
  return r.data;
}

/** Drop keys whose value is undefined so patches never erase fields by accident. */
function defined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "item";
}

function nextTaskId(tasks: Task[]): string {
  const max = tasks.reduce((m, t) => {
    const n = /^t-(\d+)$/.exec(t.id);
    return n ? Math.max(m, Number(n[1])) : m;
  }, 0);
  return `t-${String(max + 1).padStart(3, "0")}`;
}

/** Same data, ignoring the `updated` stamp — used to skip no-op writes. */
function same(a: object, b: object): boolean {
  const strip = ({ updated: _u, ...rest }: Record<string, unknown>) => rest;
  return JSON.stringify(strip(a as Record<string, unknown>)) === JSON.stringify(strip(b as Record<string, unknown>));
}

function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** Date, then all-day before timed, then start time, then id. */
function byDateTime(a: ScheduleEvent, b: ScheduleEvent): number {
  return a.date.localeCompare(b.date) || (a.start ?? "").localeCompare(b.start ?? "") || a.id.localeCompare(b.id);
}

/**
 * Honest part status: linked tasks decide (all done → done, some started → building).
 * An explicit status is kept, except "done" is ignored while linked tasks are open.
 */
export function mapNodeStatus(node: MapNode, tasks: Task[]): MapStatus {
  const linked = tasks.filter((t) => node.tasks.includes(t.id));
  const open = linked.filter((t) => t.status !== "done");
  let derived: MapStatus = "planned";
  if (linked.length && !open.length) derived = "done";
  else if (linked.some((t) => t.status !== "todo")) derived = "building";
  if (node.status === null) return derived;
  if (node.status === "done" && open.length) return derived;
  return node.status;
}

function mapView(project: string, map: ProjectMap, tasks: Task[]): ProjectMapView {
  const nodes = map.nodes.map((n) => {
    const linked = tasks.filter((t) => n.tasks.includes(t.id));
    const done = linked.filter((t) => t.status === "done").length;
    return {
      ...n,
      effective_status: mapNodeStatus(n, tasks),
      progress: linked.length ? Math.round((done / linked.length) * 100) : null,
    };
  });
  const count = (s: MapStatus) => nodes.filter((n) => n.effective_status === s).length;
  return {
    project,
    ...map,
    nodes,
    summary: {
      parts: nodes.length,
      done: count("done"),
      building: count("building"),
      blocked: count("blocked"),
      focus: map.focus ? { id: map.focus, label: map.nodes.find((n) => n.id === map.focus)!.label } : null,
    },
  };
}

function summarize(e: ActivityEntry): ActivitySummary {
  return { ...e, files: e.files.map((f) => f.path) };
}

/* ---------- store ---------- */

export class Store {
  readonly dataDir: string;
  readonly agent: string;
  readonly #now: () => Date;
  readonly #activityLimit: number;
  readonly #gitCommit: boolean;

  constructor(options: StoreOptions) {
    if (!options.agent?.trim()) throw new BrainError("VALIDATION", "agent name is required");
    this.dataDir = resolveDataDir(options.dataDir);
    this.agent = options.agent.trim();
    this.#now = options.now ?? (() => new Date());
    this.#activityLimit = options.activityLimit ?? 20;
    this.#gitCommit = options.gitCommit ?? false;
  }

  today(): string {
    return toIsoDate(this.#now());
  }

  /* ======================= Goals ======================= */

  listGoals(): GoalView[] {
    const progressOf = this.#goalProgressIndex();
    return this.#listMd("goals", GoalSchema, "goal").map((g) => ({ ...g, progress: progressOf(g.id) }));
  }

  getGoal(id: string): GoalView {
    const goal = this.#requireMd(`goals/${checkId(id, "goal")}.md`, GoalSchema, "goal");
    return { ...goal, progress: this.#goalProgressIndex()(goal.id) };
  }

  /** Create or update a goal. */
  upsertGoal(input: GoalInput): GoalView {
    const id = checkId(input.id, "goal");
    const rel = `goals/${id}.md`;
    const existing = this.#loadMd(rel, GoalSchema, "goal");
    const { body, ...fields } = { ...existing, ...defined(input) };
    const today = this.today();
    const goal = validate(GoalSchema, { ...fields, created: existing?.created ?? today, updated: today }, "goal");
    if (existing && same(existing, { ...goal, body: body ?? "" })) return this.getGoal(id);
    this.#commit(existing ? "update" : "create", `goals/${id}`, `${existing ? "update" : "create"} goal ${id}`, {
      [rel]: toMarkdown(goal, body ?? ""),
    });
    return this.getGoal(id);
  }

  #goalProgressIndex(): (goalId: string) => number {
    const items = [...this.listProjects(), ...this.listLearning()];
    return (goalId) => average(items.filter((i) => i.goal === goalId).map((i) => i.progress));
  }

  /* ======================= Projects & tasks ======================= */

  listProjects(): ProjectView[] {
    return listSubdirsWith(this.#abs("projects"), "project.md").flatMap((id) => this.#tryRead(() => this.getProject(id)));
  }

  getProject(id: string): ProjectView {
    checkId(id, "project");
    const project = this.#requireMd(`projects/${id}/project.md`, ProjectSchema, "project");
    const tasks = this.#loadTasks(id);
    return { ...project, tasks, progress: projectProgress(project, tasks) };
  }

  createProject(input: ProjectInput): ProjectView {
    const id = checkId(input.id, "project");
    if (this.#exists(`projects/${id}/project.md`)) throw new BrainError("CONFLICT", `Project "${id}" already exists`);
    const { body = "", tasks: taskInputs = [], ...rest } = defined(input);
    const phases = rest.phases ?? [...DEFAULT_PHASES];
    const today = this.today();
    const project = validate(
      ProjectSchema,
      { ...rest, phases, phase: rest.phase ?? phases[0], created: today, updated: today },
      "project",
    );
    this.#checkRef("goals", project.goal);

    const tasks: Task[] = [];
    for (const t of taskInputs) {
      tasks.push(this.#finishTask(validate(TaskSchema, { ...defined(t), id: t.id ?? nextTaskId(tasks) }, "task")));
    }
    this.#checkTasks(project, tasks);

    this.#commit("create", `projects/${id}`, `create project ${id}`, {
      [`projects/${id}/project.md`]: toMarkdown(project, body),
      [`projects/${id}/tasks.yaml`]: toYaml(tasks),
    });
    return this.getProject(id);
  }

  updateProject(id: string, patch: ProjectPatch): ProjectView {
    const { tasks, progress: _p, body, ...current } = this.getProject(id);
    const { body: newBody, ...changes } = defined(patch);
    const project = validate(ProjectSchema, { ...current, ...changes, id: current.id, updated: this.today() }, "project");
    this.#checkRef("goals", project.goal);
    this.#checkTasks(project, tasks);
    if (same(current, project) && (newBody ?? body) === body) return this.getProject(current.id);
    this.#commit("update", `projects/${current.id}`, `update project ${current.id}`, {
      [`projects/${current.id}/project.md`]: toMarkdown(project, newBody ?? body),
    });
    return this.getProject(current.id);
  }

  addTask(projectId: string, input: TaskInput): Task {
    const { tasks, progress: _p, body: _b, ...project } = this.getProject(projectId);
    const task = this.#finishTask(
      validate(TaskSchema, { ...defined(input), id: input.id ?? nextTaskId(tasks) }, "task"),
    );
    this.#saveTasks(project, [...tasks, task], "create", `add task ${task.id}: ${task.title}`);
    return task;
  }

  updateTask(projectId: string, taskId: string, patch: TaskPatch): Task {
    const { tasks, progress: _p, body: _b, ...project } = this.getProject(projectId);
    const current = tasks.find((t) => t.id === taskId);
    if (!current) throw new BrainError("NOT_FOUND", `Task "${taskId}" not found in project "${projectId}"`);
    const task = this.#finishTask(validate(TaskSchema, { ...current, ...defined(patch), id: taskId }, "task"));
    if (same(current, task)) return current;
    this.#saveTasks(project, tasks.map((t) => (t.id === taskId ? task : t)), "update", `update task ${taskId}`);
    return task;
  }

  deleteTask(projectId: string, taskId: string): void {
    const { tasks, progress: _p, body: _b, ...project } = this.getProject(projectId);
    if (!tasks.some((t) => t.id === taskId)) {
      throw new BrainError("NOT_FOUND", `Task "${taskId}" not found in project "${projectId}"`);
    }
    this.#saveTasks(project, tasks.filter((t) => t.id !== taskId), "delete", `delete task ${taskId}`);
  }

  /** done ⇒ done_at set (today if missing); not done ⇒ done_at cleared. */
  #finishTask(task: Task): Task {
    if (task.status === "done") return { ...task, done_at: task.done_at ?? this.today() };
    return { ...task, done_at: null };
  }

  #checkTasks(project: Project, tasks: Task[]): Task[] {
    const list = validate(TaskListSchema, tasks, `tasks of "${project.id}"`);
    for (const t of list) {
      if (t.phase !== null && !project.phases.includes(t.phase)) {
        throw new BrainError(
          "VALIDATION",
          `Task "${t.id}" has phase "${t.phase}", but project "${project.id}" phases are: ${project.phases.join(", ")}`,
        );
      }
    }
    return list;
  }

  #saveTasks(project: Project, tasks: Task[], action: ActivityEntry["action"], summary: string): void {
    this.#checkTasks(project, tasks);
    this.#commit(action, `projects/${project.id}`, summary, { [`projects/${project.id}/tasks.yaml`]: toYaml(tasks) });
  }

  #loadTasks(projectId: string): Task[] {
    return this.#loadYaml(`projects/${projectId}/tasks.yaml`, TaskListSchema, "tasks", []);
  }

  /* ======================= System map (SPEC §4.14) ======================= */

  /** The project's system map with honest, task-derived status. null when none drawn yet. */
  getProjectMap(projectId: string): ProjectMapView | null {
    const { tasks, id } = this.getProject(projectId);
    const map = this.#loadYaml(`projects/${id}/map.yaml`, ProjectMapSchema.nullable(), "map", null);
    return map ? mapView(id, map, tasks) : null;
  }

  /** Draw or redraw the whole map (one change, one undo). */
  setProjectMap(projectId: string, input: ProjectMapInput): ProjectMapView {
    const { tasks, id } = this.getProject(projectId);
    const map = validate(ProjectMapSchema, input, "map");
    this.#checkMap(map, tasks);
    this.#commit(this.#exists(`projects/${id}/map.yaml`) ? "update" : "create", `projects/${id}`, `draw map of ${id} (${map.nodes.length} parts)`, {
      [`projects/${id}/map.yaml`]: toYaml(map),
    });
    return mapView(id, map, tasks);
  }

  /** Update one part, or add it when the id is new (then label and lane are required). */
  updateMapNode(projectId: string, nodeId: string, patch: MapNodePatch): ProjectMapView {
    const { tasks, id } = this.getProject(projectId);
    const current = this.#requireMap(id);
    const existing = current.nodes.find((n) => n.id === nodeId);
    const node = { ...(existing ?? { id: nodeId }), ...defined(patch) };
    const nodes = existing ? current.nodes.map((n) => (n.id === nodeId ? node : n)) : [...current.nodes, node];
    const map = validate(ProjectMapSchema, { ...current, nodes }, "map");
    this.#checkMap(map, tasks);
    if (JSON.stringify(map) === JSON.stringify(current)) return mapView(id, current, tasks);
    this.#commit("update", `projects/${id}`, `${existing ? "update" : "add"} map part ${nodeId}`, { [`projects/${id}/map.yaml`]: toYaml(map) });
    return mapView(id, map, tasks);
  }

  /** Move "you are here" (null clears it). */
  setMapFocus(projectId: string, nodeId: string | null): ProjectMapView {
    const { tasks, id } = this.getProject(projectId);
    const current = this.#requireMap(id);
    const map = validate(ProjectMapSchema, { ...current, focus: nodeId }, "map");
    if (map.focus === current.focus) return mapView(id, current, tasks);
    this.#commit("update", `projects/${id}`, `map focus → ${nodeId ?? "none"}`, { [`projects/${id}/map.yaml`]: toYaml(map) });
    return mapView(id, map, tasks);
  }

  #requireMap(projectId: string): ProjectMap {
    const map = this.#loadYaml(`projects/${projectId}/map.yaml`, ProjectMapSchema.nullable(), "map", null);
    if (!map) throw new BrainError("NOT_FOUND", `Project "${projectId}" has no map yet; draw one with set_project_map`);
    return map;
  }

  /** Linked tasks must exist; a part can't be marked done while its tasks are open (honest metrics). */
  #checkMap(map: ProjectMap, tasks: Task[]): void {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    for (const n of map.nodes) {
      const missing = n.tasks.filter((t) => !byId.has(t));
      if (missing.length) throw new BrainError("VALIDATION", `Map part "${n.id}" links unknown task(s): ${missing.join(", ")}`);
      const open = n.tasks.filter((t) => byId.get(t)!.status !== "done");
      if (n.status === "done" && open.length) {
        throw new BrainError("RULE", `Map part "${n.id}" can't be done while task(s) ${open.join(", ")} are open`);
      }
    }
  }

  /* ======================= Learning & topics ======================= */

  listLearning(): LearningView[] {
    return listSubdirsWith(this.#abs("learning"), "learning.md").flatMap((id) => this.#tryRead(() => this.getLearning(id)));
  }

  getLearning(id: string): LearningView {
    checkId(id, "learning");
    const learning = this.#requireMd(`learning/${id}/learning.md`, LearningSchema, "learning");
    const topics = this.#loadTopics(id);
    const today = this.today();
    return {
      ...learning,
      topics: topics.map((t) => {
        const review = topicReview(t, today);
        return { ...t, effective_status: effectiveTopicStatus(t, review), review };
      }),
      progress: learningProgress(topics),
    };
  }

  /** Create a roadmap or course, optionally with its topics in one change. */
  createLearning(input: LearningInput): LearningView {
    const id = checkId(input.id, "learning");
    if (this.#exists(`learning/${id}/learning.md`)) throw new BrainError("CONFLICT", `Learning "${id}" already exists`);
    const { body = "", topics: topicInputs = [], ...rest } = defined(input);
    const today = this.today();
    const learning = validate(LearningSchema, { ...rest, created: today, updated: today }, "learning");
    this.#checkRef("goals", learning.goal);
    const topics = this.#checkTopics(
      learning,
      topicInputs.map((t) => this.#newTopic(learning, t)),
    );
    this.#commit("create", `learning/${id}`, `create ${learning.type} ${id}`, {
      [`learning/${id}/learning.md`]: toMarkdown(learning, body),
      [`learning/${id}/topics.yaml`]: toYaml(topics),
    });
    return this.getLearning(id);
  }

  updateLearning(id: string, patch: LearningPatch): LearningView {
    const { topics, progress: _p, body, ...current } = this.getLearning(id);
    const { body: newBody, ...changes } = defined(patch);
    const learning = validate(
      LearningSchema,
      { ...current, ...changes, id: current.id, type: current.type, updated: this.today() },
      "learning",
    );
    this.#checkRef("goals", learning.goal);
    this.#checkTopics(learning, topics.map(stripTopicView));
    if (same(current, learning) && (newBody ?? body) === body) return this.getLearning(current.id);
    this.#commit("update", `learning/${current.id}`, `update ${learning.type} ${current.id}`, {
      [`learning/${current.id}/learning.md`]: toMarkdown(learning, newBody ?? body),
    });
    return this.getLearning(current.id);
  }

  addTopic(learningId: string, input: TopicInput): TopicView {
    const { topics, progress: _p, body: _b, ...learning } = this.getLearning(learningId);
    const topic = this.#newTopic(learning, input);
    this.#saveTopics(learning, [...topics.map(stripTopicView), topic], "create", `add topic ${topic.id}`);
    return this.#topicView(learningId, topic.id);
  }

  /** Setting status to learning/understood also marks the topic reviewed today (unless given). */
  updateTopic(learningId: string, topicId: string, patch: TopicPatch): TopicView {
    const { topics, progress: _p, body: _b, ...learning } = this.getLearning(learningId);
    const current = topics.find((t) => t.id === topicId);
    if (!current) throw new BrainError("NOT_FOUND", `Topic "${topicId}" not found in "${learningId}"`);
    const changes = defined(patch);
    if ((changes.status === "learning" || changes.status === "understood") && changes.last_reviewed === undefined) {
      changes.last_reviewed = this.today();
    }
    const topic = validate(TopicSchema, { ...stripTopicView(current), ...changes, id: topicId }, "topic");
    if (same(stripTopicView(current), topic)) return current;
    this.#saveTopics(
      learning,
      topics.map((t) => (t.id === topicId ? topic : stripTopicView(t))),
      "update",
      `update topic ${learningId}#${topicId}`,
    );
    return this.#topicView(learningId, topicId);
  }

  /** Topics that need review, most urgent first (SPEC §4.6). */
  getReviewQueue(): ReviewItem[] {
    return this.listLearning()
      .flatMap((l) =>
        l.topics
          .filter((t) => t.review.reasons.length > 0)
          .map((topic) => ({ learning_id: l.id, learning_title: l.title, topic })),
      )
      .sort(
        (a, b) =>
          b.topic.review.priority - a.topic.review.priority ||
          (b.topic.review.days_since_review ?? Infinity) - (a.topic.review.days_since_review ?? Infinity),
      );
  }

  #newTopic(learning: Learning, input: TopicInput): Topic {
    return validate(TopicSchema, { ...defined(input), phase: input.phase ?? learning.phases[0] }, "topic");
  }

  #topicView(learningId: string, topicId: string): TopicView {
    return this.getLearning(learningId).topics.find((t) => t.id === topicId)!;
  }

  #checkTopics(learning: Learning, topics: Topic[]): Topic[] {
    const list = validate(TopicListSchema, topics, `topics of "${learning.id}"`);
    const ids = new Set(list.map((t) => t.id));
    const skills = this.#skillIds();
    for (const t of list) {
      if (!learning.phases.includes(t.phase)) {
        throw new BrainError(
          "VALIDATION",
          `Topic "${t.id}" has phase "${t.phase}", but "${learning.id}" phases are: ${learning.phases.join(", ")}`,
        );
      }
      for (const dep of t.depends_on) {
        if (dep === t.id || !ids.has(dep)) {
          throw new BrainError("VALIDATION", `Topic "${t.id}" depends on unknown topic "${dep}"`);
        }
      }
      for (const s of t.skills) {
        if (!skills.has(s)) throw new BrainError("VALIDATION", `Topic "${t.id}" uses unknown skill "${s}"`);
      }
    }
    return list;
  }

  #saveTopics(learning: Learning, topics: Topic[], action: ActivityEntry["action"], summary: string): void {
    this.#checkTopics(learning, topics);
    this.#commit(action, `learning/${learning.id}`, summary, { [`learning/${learning.id}/topics.yaml`]: toYaml(topics) });
  }

  #loadTopics(learningId: string): Topic[] {
    return this.#loadYaml(`learning/${learningId}/topics.yaml`, TopicListSchema, "topics", []);
  }

  /* ======================= Skills ======================= */

  getTaxonomy(): Taxonomy {
    return this.#loadYaml(TAXONOMY, TaxonomySchema, "skill taxonomy", []);
  }

  getSkillProfile(): DomainLevel[] {
    return computeSkillProfile(this.getTaxonomy(), this.listAssessments(), this.listAdjustments(), this.today());
  }

  getSkill(id: string): SkillView {
    for (const domain of this.getSkillProfile()) {
      const skill = domain.skills.find((s) => s.id === id);
      if (skill) return { ...skill, domain: domain.id, adjustments: this.listAdjustments(id) };
    }
    throw new BrainError("NOT_FOUND", `Skill "${id}" not found in taxonomy`);
  }

  listAdjustments(skill?: string): Adjustment[] {
    const all = this.#loadYaml(ADJUSTMENTS, AdjustmentListSchema, "skill adjustments", []);
    return skill ? all.filter((a) => a.skill === skill) : all;
  }

  /**
   * AI level adjustment — honest, no flattering (SPEC §4.9):
   * total stays within ±15; increases need evidence that exists.
   */
  adjustSkill(input: AdjustmentInput): SkillView {
    const skill = checkId(input.skill, "skill");
    if (!this.#skillIds().has(skill)) throw new BrainError("NOT_FOUND", `Skill "${skill}" not found in taxonomy`);
    const evidence = input.evidence ?? [];
    if (input.delta > 0 && evidence.length === 0) {
      throw new BrainError("RULE", "Increasing a skill level requires evidence (assessments, notes, projects…)");
    }
    const adjustment = validate(
      AdjustmentSchema,
      { id: randomUUID().slice(0, 8), skill, delta: input.delta, reason: input.reason, evidence, agent: this.agent, date: this.today() },
      "skill adjustment",
    );
    for (const ref of adjustment.evidence) {
      if (!this.#refExists(ref)) throw new BrainError("RULE", `Evidence "${ref}" does not exist`);
    }
    const all = this.listAdjustments();
    const total = all.filter((a) => a.skill === skill).reduce((t, a) => t + a.delta, 0) + adjustment.delta;
    if (Math.abs(total) > MAX_AI_ADJUSTMENT) {
      throw new BrainError(
        "RULE",
        `AI adjustment for "${skill}" would total ${total}; allowed range is ±${MAX_AI_ADJUSTMENT}. Record an assessment instead.`,
      );
    }
    this.#commit("create", `skills/${skill}`, `adjust ${skill} ${adjustment.delta > 0 ? "+" : ""}${adjustment.delta}`, {
      [ADJUSTMENTS]: toYaml([...all, adjustment]),
    });
    return this.getSkill(skill);
  }

  #skillIds(): Set<string> {
    return new Set(this.getTaxonomy().flatMap((d) => d.skills.map((s) => s.id)));
  }

  /* ======================= Assessments ======================= */

  listAssessments(filter: { skill?: string } = {}): WithBody<Assessment>[] {
    const all = this.#listMd("assessments", AssessmentSchema, "assessment");
    return filter.skill ? all.filter((a) => filter.skill! in a.skills) : all;
  }

  getAssessment(id: string): WithBody<Assessment> {
    return this.#requireMd(`assessments/${checkId(id, "assessment")}.md`, AssessmentSchema, "assessment");
  }

  /**
   * Record an assessment. Linked topics get last_score / last_reviewed updated
   * (and move from not-started to learning) in the same change.
   */
  recordAssessment(input: AssessmentInput): WithBody<Assessment> {
    const { assessment, changes } = this.#prepareAssessment(input);
    this.#commit("create", `assessments/${assessment.id}`, `record assessment ${assessment.id} (${assessment.score})`, changes);
    return this.getAssessment(assessment.id);
  }

  /** Validate an assessment and compute every file it touches, without writing. */
  #prepareAssessment(input: AssessmentInput): { assessment: Assessment; changes: Record<string, string | null> } {
    const { body = "", ...rest } = defined(input);
    const date = rest.date ?? this.today();
    const id = checkId(rest.id ?? `${date}-${slugify(rest.title)}`, "assessment");
    const rel = `assessments/${id}.md`;
    if (this.#exists(rel)) throw new BrainError("CONFLICT", `Assessment "${id}" already exists`);
    const assessment = validate(AssessmentSchema, { ...rest, id, date }, "assessment");
    this.#checkSkills(Object.keys(assessment.skills));

    const changes: Record<string, string | null> = { [rel]: toMarkdown(assessment, body) };
    for (const [learningId, topicIds] of this.#groupTopicRefs(assessment.topic_refs)) {
      const topics = this.#loadTopics(learningId);
      for (const topicId of topicIds) {
        const i = topics.findIndex((t) => t.id === topicId);
        const t = topics[i]!;
        topics[i] = {
          ...t,
          status: t.status === "not-started" ? "learning" : t.status,
          last_score: assessment.score,
          last_reviewed: t.last_reviewed && t.last_reviewed > date ? t.last_reviewed : date,
        };
      }
      changes[`learning/${learningId}/topics.yaml`] = toYaml(topics);
    }
    return { assessment, changes };
  }

  #checkSkills(ids: string[]): void {
    const skills = this.#skillIds();
    for (const s of ids) {
      if (!skills.has(s)) throw new BrainError("VALIDATION", `Unknown skill "${s}"`);
    }
  }

  /** `learning/<id>#<topic>` refs grouped by learning id; throws if any does not exist. */
  #groupTopicRefs(refs: string[]): Map<string, string[]> {
    const byLearning = new Map<string, string[]>();
    for (const ref of refs) {
      const [learningPart, topicId] = ref.split("#") as [string, string];
      const learningId = learningPart.slice("learning/".length);
      byLearning.set(learningId, [...(byLearning.get(learningId) ?? []), topicId]);
    }
    for (const [learningId, topicIds] of byLearning) {
      if (!this.#exists(`learning/${learningId}/learning.md`)) {
        throw new BrainError("VALIDATION", `Unknown learning "${learningId}" in topic_refs`);
      }
      const ids = new Set(this.#loadTopics(learningId).map((t) => t.id));
      for (const topicId of topicIds) {
        if (!ids.has(topicId)) throw new BrainError("VALIDATION", `Unknown topic "${learningId}#${topicId}" in topic_refs`);
      }
    }
    return byLearning;
  }

  /* ======================= Quizzes (SPEC §4.12) ======================= */

  listQuizzes(filter: { status?: Quiz["status"] } = {}): Quiz[] {
    const all = listFiles(this.#abs("quizzes"), ".yaml").flatMap((id) => this.#tryRead(() => this.getQuiz(id)));
    return filter.status ? all.filter((q) => q.status === filter.status) : all;
  }

  getQuiz(id: string): Quiz {
    const rel = `quizzes/${checkId(id, "quiz")}.yaml`;
    if (!this.#exists(rel)) throw new BrainError("NOT_FOUND", `Quiz not found: ${rel}`);
    return this.#loadYaml(rel, QuizSchema, "quiz", undefined as never);
  }

  /** An AI writes a quiz (single / multi / short questions); the user takes it in the web app. */
  createQuiz(input: QuizInput): Quiz {
    const today = this.today();
    const id = checkId(input.id ?? `${today}-${slugify(input.title)}`, "quiz");
    const rel = `quizzes/${id}.yaml`;
    if (this.#exists(rel)) throw new BrainError("CONFLICT", `Quiz "${id}" already exists`);
    if (this.#exists(`assessments/${id}.md`)) throw new BrainError("CONFLICT", `Assessment "${id}" already exists; pick another quiz id`);
    const quiz = validate(
      QuizSchema,
      { ...defined(input), id, status: "open", assessment: null, author: this.agent, created: today, updated: today },
      "quiz",
    );
    this.#checkSkills(Object.keys(quiz.skills));
    this.#groupTopicRefs(quiz.topic_refs);
    this.#commit("create", `quizzes/${id}`, `create quiz ${id} (${quiz.questions.length} questions)`, { [rel]: toYaml(quiz) });
    return quiz;
  }

  /**
   * Grade a quiz (one attempt only) and record it as a `web-quiz` assessment.
   * Assessment, topic updates and quiz status are written as one change.
   */
  submitQuiz(id: string, answers: unknown): QuizResult {
    const quiz = this.getQuiz(id);
    if (quiz.status === "done") throw new BrainError("CONFLICT", `Quiz "${id}" was already taken`);
    if (!Array.isArray(answers) || answers.length !== quiz.questions.length) {
      throw new BrainError("VALIDATION", `Expected ${quiz.questions.length} answers`);
    }
    const results = quiz.questions.map((q, i) => ({ ...q, ...gradeQuestion(q, answers[i], i + 1) }));
    const correct = results.filter((r) => r.correct).length;
    const score = roundScore((correct / results.length) * 100);

    const lines = [`Web quiz by ${quiz.author}: ${correct}/${results.length} correct.`];
    results.forEach((r, i) => {
      lines.push("", `### ${i + 1}. ${r.q}`, `- Your answer: ${shown(r, r.chosen)} ${r.correct ? "(correct)" : "(wrong)"}`);
      if (!r.correct) lines.push(`- Correct: ${r.type === "single" ? r.choices[r.answer] : r.type === "multi" ? shown(r, r.answers) : r.accept.join(" / ")}`);
      if (r.explain) lines.push(`- ${r.explain}`);
    });

    const { assessment, changes } = this.#prepareAssessment({
      id: quiz.id,
      title: quiz.title,
      source: "web-quiz",
      skills: quiz.skills,
      score,
      difficulty: quiz.difficulty,
      topic_refs: quiz.topic_refs,
      raw: `quizzes/${quiz.id}.yaml`,
      tags: quiz.tags,
      body: lines.join("\n"),
    });
    const done: Quiz = { ...quiz, status: "done", assessment: assessment.id, updated: this.today() };
    this.#commit("update", `quizzes/${id}`, `submit quiz ${id} (${score})`, {
      ...changes,
      [`quizzes/${id}.yaml`]: toYaml(done),
    });
    return { quiz: done, assessment: this.getAssessment(assessment.id), score, correct, total: results.length, results };
  }

  /* ======================= Notes ======================= */

  listNotes(filter: { type?: Note["type"] } = {}): WithBody<Note>[] {
    const all = this.#listMd("notes", NoteSchema, "note");
    return filter.type ? all.filter((n) => n.type === filter.type) : all;
  }

  getNote(id: string): WithBody<Note> {
    return this.#requireMd(`notes/${checkId(id, "note")}.md`, NoteSchema, "note");
  }

  createNote(input: NoteInput): WithBody<Note> {
    const id = checkId(input.id, "note");
    const rel = `notes/${id}.md`;
    if (this.#exists(rel)) throw new BrainError("CONFLICT", `Note "${id}" already exists`);
    const { body = "", ...rest } = defined(input);
    const today = this.today();
    const note = validate(NoteSchema, { ...rest, created: today, updated: today }, "note");
    this.#commit("create", `notes/${id}`, `create ${note.type} ${id}`, { [rel]: toMarkdown(note, body) });
    return this.getNote(id);
  }

  updateNote(id: string, patch: NotePatch): WithBody<Note> {
    const { body, ...current } = this.getNote(id);
    const { body: newBody, ...changes } = defined(patch);
    const note = validate(NoteSchema, { ...current, ...changes, id: current.id, updated: this.today() }, "note");
    if (same(current, note) && (newBody ?? body) === body) return this.getNote(current.id);
    this.#commit("update", `notes/${current.id}`, `update note ${current.id}`, {
      [`notes/${current.id}.md`]: toMarkdown(note, newBody ?? body),
    });
    return this.getNote(current.id);
  }

  /* ======================= Inbox ======================= */

  listInbox(): { name: string; size: number; modified: string }[] {
    return listFiles(this.#abs("inbox"), "")
      .filter((name) => !name.startsWith("."))
      .map((name) => {
        const { size, modified } = fileInfo(this.#abs(`inbox/${name}`));
        return { name, size, modified: modified.toISOString() };
      });
  }

  readInbox(name: string): string {
    if (!/^[^/\\]+$/.test(name) || name.startsWith(".")) throw new BrainError("VALIDATION", `Invalid inbox file "${name}"`);
    const text = readText(this.#abs(`inbox/${name}`));
    if (text === null) throw new BrainError("NOT_FOUND", `Inbox file "${name}" not found`);
    return text;
  }

  /* ======================= Schedule (SPEC §4.13) ======================= */

  /** Own events, sorted by date then time (all-day first). `from`/`to` are inclusive dates. */
  listEvents(range: { from?: string; to?: string } = {}): ScheduleEvent[] {
    return this.#loadEvents()
      .filter((e) => (!range.from || e.date >= range.from) && (!range.to || e.date <= range.to))
      .sort(byDateTime);
  }

  getEvent(id: string): ScheduleEvent {
    const event = this.#loadEvents().find((e) => e.id === id);
    if (!event) throw new BrainError("NOT_FOUND", `Event "${id}" not found`);
    return event;
  }

  addEvent(input: EventInput): ScheduleEvent {
    const events = this.#loadEvents();
    const taken = new Set(events.map((e) => e.id));
    const id = input.id ? checkId(input.id, "event") : uniqueId(`${input.date}-${slugify(input.title ?? "")}`, taken);
    if (taken.has(id)) throw new BrainError("CONFLICT", `Event "${id}" already exists`);
    const event = validate(
      EventSchema,
      { ...defined(input), id, google_id: null, updated: this.#now().toISOString() },
      "event",
    );
    this.#checkLinks(event.links);
    this.#saveEvents([...events, event], "create", `add event ${id}: ${event.title}`);
    return event;
  }

  updateEvent(id: string, patch: EventPatch): ScheduleEvent {
    const events = this.#loadEvents();
    const current = events.find((e) => e.id === id);
    if (!current) throw new BrainError("NOT_FOUND", `Event "${id}" not found`);
    const event = validate(EventSchema, { ...current, ...defined(patch), id, updated: this.#now().toISOString() }, "event");
    this.#checkLinks(event.links);
    if (same(current, event)) return current;
    this.#saveEvents(events.map((e) => (e.id === id ? event : e)), "update", `update event ${id}`);
    return event;
  }

  deleteEvent(id: string): void {
    const events = this.#loadEvents();
    if (!events.some((e) => e.id === id)) throw new BrainError("NOT_FOUND", `Event "${id}" not found`);
    this.#saveEvents(events.filter((e) => e.id !== id), "delete", `delete event ${id}`);
  }

  /**
   * Batch write from a calendar sync: one change, one undo.
   * `upsert` replaces events by id (new ids are added); `remove` deletes ids. Returns how many events changed.
   */
  applyEventSync(changes: { upsert: ScheduleEvent[]; remove: string[] }, summary: string): number {
    const events = new Map(this.#loadEvents().map((e) => [e.id, e]));
    let changed = 0;
    for (const raw of changes.upsert) {
      const e = validate(EventSchema, raw, "synced event");
      const before = events.get(e.id);
      if (before && JSON.stringify(before) === JSON.stringify(e)) continue;
      events.set(e.id, e);
      changed++;
    }
    for (const id of changes.remove) if (events.delete(id)) changed++;
    if (changed > 0) this.#saveEvents([...events.values()], "update", summary);
    return changed;
  }

  /** New id for an event, unique among `taken`. Exposed for sync code creating events. */
  newEventId(date: string, title: string, taken: Set<string> = new Set(this.#loadEvents().map((e) => e.id))): string {
    return uniqueId(`${date}-${slugify(title)}`, taken);
  }

  getGoogleSettings(): GoogleSettings {
    return this.#loadYaml(GOOGLE_SETTINGS, GoogleSettingsSchema, "Google settings", GoogleSettingsSchema.parse({}));
  }

  updateGoogleSettings(patch: GoogleSettingsPatch): GoogleSettings {
    const current = this.getGoogleSettings();
    const next = validate(
      GoogleSettingsSchema,
      { ...current, ...defined(patch), push: { ...current.push, ...defined(patch.push ?? {}) } },
      "Google settings",
    );
    if (JSON.stringify(current) === JSON.stringify(next) && this.#exists(GOOGLE_SETTINGS)) return current;
    this.#commit("update", "schedule/google", "update Google Calendar settings", { [GOOGLE_SETTINGS]: toYaml(next) });
    return next;
  }

  #loadEvents(): ScheduleEvent[] {
    return this.#loadYaml(EVENTS, EventListSchema, "events", []);
  }

  #saveEvents(events: ScheduleEvent[], action: ActivityEntry["action"], summary: string): void {
    const list = validate(EventListSchema, [...events].sort(byDateTime), "events");
    this.#commit(action, "schedule/events", summary, { [EVENTS]: toYaml(list) });
  }

  #checkLinks(links: string[]): void {
    for (const ref of links) {
      if (!this.#refExists(ref)) throw new BrainError("VALIDATION", `Unknown link "${ref}"`);
    }
  }

  /* ======================= Activity & undo ======================= */

  /** Most recent first. */
  listActivity(limit = this.#activityLimit): ActivitySummary[] {
    return this.#readActivity().reverse().slice(0, limit).map(summarize);
  }

  /** Revert one logged change. Fails if its files changed since (undo newer changes first). */
  undo(activityId: string): ActivitySummary {
    const entry = this.#readActivity().find((e) => e.id === activityId);
    if (!entry) {
      throw new BrainError("NOT_FOUND", `Change "${activityId}" is not in the last ${this.#activityLimit} changes`);
    }
    for (const f of entry.files) {
      if (this.#read(f.path) !== f.after) {
        throw new BrainError("CONFLICT", `"${f.path}" changed after ${activityId}; undo the newer change first`);
      }
    }
    const result = this.#commit(
      "undo",
      entry.entity,
      `undo ${entry.id} (${entry.summary})`,
      Object.fromEntries(entry.files.map((f) => [f.path, f.before])),
    );
    return summarize(result!);
  }

  /* ======================= Delete a project / learning item ======================= */

  /** What deleting would remove or change. Nothing is written. */
  deleteImpact(kind: "projects" | "learning", id: string): DeleteImpact {
    return this.#deletePlan(kind, id).impact;
  }

  /**
   * Delete a project or learning item with everything inside its folder (tasks, map, topics, visuals), in ONE
   * change, so one undo brings it all back. Links to it are removed from notes and events; open quizzes on a
   * deleted course go too. Assessments, finished quizzes and skill history stay: they are evidence (SPEC §4.9).
   */
  deleteEntity(kind: "projects" | "learning", id: string): DeleteImpact {
    const { impact, changes } = this.#deletePlan(kind, id);
    this.#commit("delete", impact.ref, `delete ${kind === "projects" ? "project" : "learning"} ${id}`, changes);
    removeIfEmpty(this.#abs(impact.ref));
    return impact;
  }

  #deletePlan(kind: "projects" | "learning", rawId: string): { impact: DeleteImpact; changes: Record<string, null | string> } {
    const item = kind === "projects" ? this.getProject(rawId) : this.getLearning(rawId);
    const ref = `${kind}/${item.id}`;
    const changes: Record<string, string | null> = {};
    for (const f of listTree(this.#abs(ref))) changes[`${ref}/${f}`] = null;

    const unlinked: string[] = [];
    for (const n of this.listNotes()) {
      if (!n.links.includes(ref)) continue;
      const { body, ...note } = n;
      changes[`notes/${n.id}.md`] = toMarkdown({ ...note, links: note.links.filter((l) => l !== ref) }, body);
      unlinked.push(`notes/${n.id}`);
    }
    const events = this.#loadEvents();
    if (events.some((e) => e.links.includes(ref))) {
      for (const e of events) if (e.links.includes(ref)) unlinked.push(`schedule/${e.id}`);
      const kept = events.map((e) => (e.links.includes(ref) ? { ...e, links: e.links.filter((l) => l !== ref) } : e));
      changes[EVENTS] = toYaml(validate(EventListSchema, kept, "events"));
    }
    const quizzes =
      kind === "learning" ? this.listQuizzes({ status: "open" }).filter((q) => q.topic_refs.some((r) => r.startsWith(`${ref}#`))).map((q) => q.id) : [];
    for (const q of quizzes) changes[`quizzes/${q}.yaml`] = null;

    const counts: Record<string, number> =
      kind === "projects"
        ? { tasks: (item as ProjectView).tasks.length, map: this.#exists(`${ref}/map.yaml`) ? 1 : 0 }
        : { topics: (item as LearningView).topics.length, visuals: listFiles(this.#abs(`${ref}/visuals`), ".yaml").length };
    return {
      impact: { ref, title: item.title, files: Object.values(changes).filter((v) => v === null).length - quizzes.length, counts, unlinked, quizzes },
      changes,
    };
  }

  /* ======================= Learning visuals (SPEC §4.16) ======================= */

  /** Visuals of a learning item (optionally one topic), newest first. */
  listVisuals(learningId: string, topic?: string): VisualSummary[] {
    const { id } = this.getLearning(learningId);
    return listFiles(this.#abs(`learning/${id}/visuals`), ".yaml")
      .flatMap((vid) => this.#tryRead(() => this.getVisual(id, vid)))
      .filter((v) => topic === undefined || v.topic === topic)
      .sort((a, b) => b.updated.localeCompare(a.updated) || a.title.localeCompare(b.title))
      .map((v) => ({ id: v.id, title: v.title, type: v.type, topic: v.topic, updated: v.updated, steps: v.steps.length }));
  }

  getVisual(learningId: string, visualId: string): Visual {
    const rel = `learning/${checkId(learningId, "learning")}/visuals/${checkId(visualId, "visual")}.yaml`;
    if (!this.#exists(rel)) throw new BrainError("NOT_FOUND", `Visual not found: ${rel}`);
    return this.#loadYaml(rel, VisualSchema, "visual", undefined as never);
  }

  /** Create, or replace when the id exists (one change, one undo). The id defaults to the title. */
  saveVisual(learningId: string, input: VisualInput): Visual {
    const learning = this.getLearning(learningId);
    const dir = `learning/${learning.id}/visuals`;
    const taken = new Set(listFiles(this.#abs(dir), ".yaml"));
    const id = input.id ? checkId(input.id, "visual") : uniqueId(slugify(input.title ?? "").slice(0, 40).replace(/-+$/, ""), taken);
    const rel = `${dir}/${id}.yaml`;
    const existing = this.#exists(rel) ? this.#tryRead(() => this.getVisual(learning.id, id))[0] : undefined;
    const topic = input.topic ?? null;
    if (topic !== null && !learning.topics.some((t) => t.id === topic)) {
      throw new BrainError("VALIDATION", `Topic "${topic}" is not in ${learning.id} (topics: ${learning.topics.map((t) => t.id).join(", ") || "none"})`);
    }
    const today = this.today();
    const visual = validate(VisualSchema, { ...defined(input), id, topic, author: this.agent, created: existing?.created ?? today, updated: today }, "visual");
    if (visual.type === "lesson") {
      for (const b of visual.data.blocks) {
        if (b.kind !== "visual") continue;
        if (b.ref === id) throw new BrainError("VALIDATION", "A lesson cannot embed itself");
        if (!taken.has(b.ref)) throw new BrainError("VALIDATION", `Lesson embeds visual "${b.ref}", which is not in ${learning.id} (visuals: ${[...taken].join(", ") || "none"})`);
      }
    }
    const yaml = toYaml(visual);
    const max = MAX_VISUAL_BYTES[visual.type] ?? MAX_VISUAL_DEFAULT;
    if (yaml.length > max) throw new BrainError("VALIDATION", `Visual is too big (${yaml.length} > ${max} characters); split it into smaller visuals`);
    this.#commit(existing ? "update" : "create", `learning/${learning.id}`, `${existing ? "update" : "add"} ${visual.type} visual "${visual.title}"`, { [rel]: yaml });
    return visual;
  }

  deleteVisual(learningId: string, visualId: string): void {
    const v = this.getVisual(learningId, visualId);
    this.#commit("delete", `learning/${learningId}`, `delete visual "${v.title}"`, { [`learning/${learningId}/visuals/${v.id}.yaml`]: null });
  }

  /* ======================= Health check ======================= */

  /** Validate every data file. Empty array = all good. */
  validateAll(): Problem[] {
    const problems: Problem[] = [];
    const check = (path: string, fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        problems.push({ path, error: e instanceof Error ? e.message : String(e) });
      }
    };
    check(TAXONOMY, () => this.getTaxonomy());
    check(ADJUSTMENTS, () => this.listAdjustments());
    for (const id of listFiles(this.#abs("goals"), ".md")) check(`goals/${id}.md`, () => this.getGoal(id));
    for (const id of listSubdirsWith(this.#abs("projects"), "project.md")) {
      check(`projects/${id}`, () => {
        const { tasks, progress: _p, body: _b, ...p } = this.getProject(id);
        this.#checkRef("goals", p.goal);
        this.#checkTasks(p, tasks);
        this.getProjectMap(id);
      });
    }
    for (const id of listSubdirsWith(this.#abs("learning"), "learning.md")) {
      check(`learning/${id}`, () => {
        const { topics, progress: _p, body: _b, ...l } = this.getLearning(id);
        this.#checkRef("goals", l.goal);
        this.#checkTopics(l, topics.map(stripTopicView));
      });
      for (const vid of listFiles(this.#abs(`learning/${id}/visuals`), ".yaml")) {
        check(`learning/${id}/visuals/${vid}.yaml`, () => {
          const v = this.getVisual(id, vid);
          if (v.topic && !this.getLearning(id).topics.some((t) => t.id === v.topic)) throw new Error(`topic "${v.topic}" not found`);
        });
      }
    }
    for (const id of listFiles(this.#abs("assessments"), ".md")) check(`assessments/${id}.md`, () => this.getAssessment(id));
    for (const id of listFiles(this.#abs("notes"), ".md")) check(`notes/${id}.md`, () => this.getNote(id));
    check(EVENTS, () => this.listEvents().forEach((e) => this.#checkLinks(e.links)));
    check(GOOGLE_SETTINGS, () => this.getGoogleSettings());
    for (const id of listFiles(this.#abs("quizzes"), ".yaml")) {
      check(`quizzes/${id}.yaml`, () => {
        const q = this.getQuiz(id);
        this.#checkSkills(Object.keys(q.skills));
        // finished quizzes are history: they may point at a deleted course
        if (q.status === "open") this.#groupTopicRefs(q.topic_refs);
      });
    }
    return problems;
  }

  /* ======================= internals ======================= */

  #abs(rel: string): string {
    return join(this.dataDir, rel);
  }

  #read(rel: string): string | null {
    return readText(this.#abs(rel));
  }

  #exists(rel: string): boolean {
    return this.#read(rel) !== null;
  }

  #loadMd<S extends z.ZodType>(rel: string, schema: S, what: string): WithBody<z.output<S>> | null {
    const text = this.#read(rel);
    if (text === null) return null;
    let parsed: { data: unknown; body: string };
    try {
      parsed = parseFrontmatter(text);
    } catch (e) {
      throw new BrainError("VALIDATION", `Invalid ${what} (${rel}): ${(e as Error).message}`);
    }
    return { ...(validate(schema, parsed.data, `${what} (${rel})`) as object), body: parsed.body } as WithBody<
      z.output<S>
    >;
  }

  #requireMd<S extends z.ZodType>(rel: string, schema: S, what: string): WithBody<z.output<S>> {
    const doc = this.#loadMd(rel, schema, what);
    if (!doc) throw new BrainError("NOT_FOUND", `${what[0]!.toUpperCase()}${what.slice(1)} not found: ${rel}`);
    return doc;
  }

  #listMd<S extends z.ZodType>(dir: string, schema: S, what: string): WithBody<z.output<S>>[] {
    return listFiles(this.#abs(dir), ".md").flatMap((id) =>
      this.#tryRead(() => this.#requireMd(`${dir}/${id}.md`, schema, what)),
    );
  }

  #loadYaml<S extends z.ZodType>(rel: string, schema: S, what: string, fallback: z.output<S>): z.output<S> {
    const text = this.#read(rel);
    if (text === null) return fallback;
    let data: unknown;
    try {
      data = parseYaml(text);
    } catch (e) {
      throw new BrainError("VALIDATION", `Invalid ${what} (${rel}): ${(e as Error).message}`);
    }
    return validate(schema, data ?? fallback, `${what} (${rel})`);
  }

  /** Lists skip broken files instead of failing; validateAll() reports them. */
  #tryRead<T>(fn: () => T): T[] {
    try {
      return [fn()];
    } catch (e) {
      if (e instanceof BrainError && e.code === "VALIDATION") return [];
      throw e;
    }
  }

  #checkRef(kind: "goals", id: string | null): void {
    if (id !== null && !this.#refExists(`${kind}/${id}`)) {
      throw new BrainError("VALIDATION", `Unknown ${kind.slice(0, -1)} "${id}"`);
    }
  }

  #refExists(ref: string): boolean {
    const [kind, id] = ref.split("/") as [string, string];
    switch (kind) {
      case "goals":
        return this.#exists(`goals/${id}.md`);
      case "projects":
        return this.#exists(`projects/${id}/project.md`);
      case "learning":
        return this.#exists(`learning/${id}/learning.md`);
      case "assessments":
        return this.#exists(`assessments/${id}.md`);
      case "notes":
        return this.#exists(`notes/${id}.md`);
      case "skills":
        return this.#skillIds().has(id);
      default:
        return false;
    }
  }

  /** Apply file changes atomically per file, then log them. Returns null if nothing changed. */
  #commit(
    action: ActivityEntry["action"],
    entity: string,
    summary: string,
    changes: Record<string, string | null>,
  ): ActivityEntry | null {
    const files: FileChange[] = Object.entries(changes)
      .map(([path, after]) => ({ path, before: this.#read(path), after }))
      .filter((f) => f.before !== f.after);
    if (files.length === 0) return null;

    for (const f of files) writeAtomic(this.#abs(f.path), f.after);

    const entry: ActivityEntry = {
      id: randomUUID().slice(0, 8),
      ts: this.#now().toISOString(),
      agent: this.agent,
      action,
      entity,
      summary,
      files,
    };
    const log = [...this.#readActivity(), entry].slice(-this.#activityLimit);
    writeAtomic(this.#abs(ACTIVITY_LOG), log.map((e) => JSON.stringify(e)).join("\n") + "\n");

    if (this.#gitCommit) this.#gitCommitEntry(entry);
    return entry;
  }

  #readActivity(): ActivityEntry[] {
    const text = this.#read(ACTIVITY_LOG);
    if (!text) return [];
    return text
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as ActivityEntry);
  }

  /** Best effort: history must never block a write. */
  #gitCommitEntry(entry: ActivityEntry): void {
    const paths = [...entry.files.map((f) => f.path), ACTIVITY_LOG];
    try {
      execFileSync("git", ["add", "-A", "--", ...paths], { cwd: this.dataDir, stdio: "ignore" });
      execFileSync("git", ["commit", "-m", `[${entry.agent}] ${entry.summary}`, "--", ...paths], {
        cwd: this.dataDir,
        stdio: "ignore",
      });
    } catch {
      /* not a git repo, nothing to commit, etc. */
    }
  }
}

function stripTopicView({ effective_status: _s, review: _r, ...topic }: TopicView): Topic {
  return topic;
}
