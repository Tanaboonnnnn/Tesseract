import { z } from "zod";

/* ---------- primitives ---------- */

const ID_RE = "[a-z0-9]+(?:-[a-z0-9]+)*";
export const Id = z.string().regex(new RegExp(`^${ID_RE}$`), "must be kebab-case (a-z, 0-9, -)");
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");
export const Percent = z.number().min(0).max(100);
const Title = z.string().trim().min(1);
const Tags = z.array(z.string()).default([]);
const Timestamps = { created: IsoDate, updated: IsoDate };

export const REF_KINDS = ["goals", "projects", "learning", "assessments", "notes", "skills"] as const;
export type RefKind = (typeof REF_KINDS)[number];
/** Reference to another entity, e.g. `projects/weather-app`. */
export const EntityRef = z
  .string()
  .regex(new RegExp(`^(${REF_KINDS.join("|")})/${ID_RE}$`), "must look like <kind>/<id>");
/** Reference to a topic, e.g. `learning/kubernetes#pods`. */
export const TopicRef = z
  .string()
  .regex(new RegExp(`^learning/${ID_RE}#${ID_RE}$`), "must look like learning/<id>#<topic>");

const uniqueIds = (items: { id: string }[]) => new Set(items.map((i) => i.id)).size === items.length;

/* ---------- Goal (SPEC §4.1) ---------- */

export const GOAL_STATUS = ["active", "achieved", "dropped"] as const;
export const GoalSchema = z.object({
  id: Id,
  title: Title,
  tags: Tags,
  status: z.enum(GOAL_STATUS).default("active"),
  target_date: IsoDate.nullable().default(null),
  ...Timestamps,
});

/* ---------- Project (SPEC §4.2) ---------- */

export const PROJECT_TEMPLATES = ["coding", "general"] as const;
export const PROJECT_STATUS = ["idea", "active", "paused", "done", "archived"] as const;
export const DEFAULT_PHASES = ["ideation", "plan", "build", "test", "release"] as const;

export const ProjectSchema = z
  .object({
    id: Id,
    title: Title,
    tags: Tags,
    template: z.enum(PROJECT_TEMPLATES).default("general"),
    status: z.enum(PROJECT_STATUS).default("active"),
    goal: Id.nullable().default(null),
    phases: z.array(Id).min(1).refine((p) => new Set(p).size === p.length, "phases must be unique"),
    phase: Id,
    progress_override: Percent.nullable().default(null),
    start: IsoDate.nullable().default(null),
    due: IsoDate.nullable().default(null),
    repo: z.string().nullable().optional(),
    stack: z.array(z.string()).optional(),
    ...Timestamps,
  })
  .refine((p) => p.phases.includes(p.phase), { message: "phase must be one of phases", path: ["phase"] });

/* ---------- Task (SPEC §4.3) ---------- */

export const TASK_STATUS = ["todo", "doing", "review", "done"] as const;
export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export const TaskSchema = z.object({
  id: Id,
  title: Title,
  status: z.enum(TASK_STATUS).default("todo"),
  priority: z.enum(PRIORITIES).default("medium"),
  due: IsoDate.nullable().default(null),
  phase: Id.nullable().default(null),
  done_at: IsoDate.nullable().default(null),
});
export const TaskListSchema = z.array(TaskSchema).refine(uniqueIds, "task ids must be unique");

/* ---------- Learning (SPEC §4.4) ---------- */

export const LEARNING_TYPES = ["roadmap", "course"] as const;
const Score = z.number().min(0).nullable().default(null);

const ScheduleSlot = z.object({
  day: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
  time: z.string(),
  room: z.string().nullable().default(null),
});
const Assignment = z.object({
  id: Id,
  title: Title,
  due: IsoDate.nullable().default(null),
  status: z.enum(["todo", "doing", "done"]).default("todo"),
  score: Score,
  max_score: z.number().positive().nullable().default(null),
});
const Exam = z.object({
  id: Id,
  title: Title,
  date: IsoDate.nullable().default(null),
  weight: Percent.nullable().default(null),
  score: Score,
  max_score: z.number().positive().nullable().default(null),
});

export const LearningSchema = z.object({
  id: Id,
  title: Title,
  tags: Tags,
  type: z.enum(LEARNING_TYPES),
  goal: Id.nullable().default(null),
  phases: z.array(Id).min(1).refine((p) => new Set(p).size === p.length, "phases must be unique"),
  // course-only fields (LEB2-ready); omitted for roadmaps
  source: z.enum(["manual", "leb2"]).optional(),
  external_id: z.string().nullable().optional(),
  term: z.string().nullable().optional(),
  schedule: z.array(ScheduleSlot).optional(),
  assignments: z.array(Assignment).optional(),
  exams: z.array(Exam).optional(),
  grade: z.string().nullable().optional(),
  ...Timestamps,
});

/* ---------- Topic (SPEC §4.5) ---------- */

export const TOPIC_STATUS = ["not-started", "learning", "understood", "needs-review"] as const;

export const TopicSchema = z.object({
  id: Id,
  title: Title,
  phase: Id,
  status: z.enum(TOPIC_STATUS).default("not-started"),
  skills: z.array(Id).default([]),
  depends_on: z.array(Id).default([]),
  last_reviewed: IsoDate.nullable().default(null),
  last_score: Percent.nullable().default(null),
});
export const TopicListSchema = z.array(TopicSchema).refine(uniqueIds, "topic ids must be unique");

/* ---------- Skills (SPEC §4.7) ---------- */

export const DomainSchema = z.object({
  id: Id,
  title: Title,
  skills: z.array(z.object({ id: Id, title: Title })).min(1),
});
export const TaxonomySchema = z.array(DomainSchema).refine((domains) => {
  const ids = domains.flatMap((d) => [d.id, ...d.skills.map((s) => s.id)]);
  return new Set(ids).size === ids.length;
}, "domain and skill ids must be unique");

export const MAX_AI_ADJUSTMENT = 15;
export const AdjustmentSchema = z.object({
  id: z.string().min(1),
  skill: Id,
  delta: z
    .number()
    .int()
    .min(-MAX_AI_ADJUSTMENT)
    .max(MAX_AI_ADJUSTMENT)
    .refine((d) => d !== 0, "delta must not be 0"),
  reason: z.string().trim().min(10, "give a real reason (10+ chars)"),
  evidence: z.array(EntityRef).default([]),
  agent: z.string().min(1),
  date: IsoDate,
});
export const AdjustmentListSchema = z.array(AdjustmentSchema);

/* ---------- Assessment (SPEC §4.8) ---------- */

export const ASSESSMENT_SOURCES = ["ai-quiz", "web-quiz", "ctf", "lab", "competition", "exam", "project"] as const;
export const DIFFICULTIES = ["easy", "medium", "hard"] as const;

/** `{ skill_id: weight }`, weights sum to 1. */
const SkillWeights = z
  .record(Id, z.number().positive().max(1))
  .refine((s) => Object.keys(s).length > 0, "at least one skill is required")
  .refine((s) => Math.abs(Object.values(s).reduce((a, b) => a + b, 0) - 1) <= 0.01, "skill weights must sum to 1");

export const AssessmentSchema = z.object({
  id: Id,
  title: Title,
  tags: Tags,
  source: z.enum(ASSESSMENT_SOURCES),
  skills: SkillWeights,
  score: Percent,
  difficulty: z.enum(DIFFICULTIES),
  date: IsoDate,
  topic_refs: z.array(TopicRef).default([]),
  raw: z.string().nullable().default(null),
});

/* ---------- Quiz (SPEC §4.12) ---------- */

export const QUIZ_STATUS = ["open", "done"] as const;

export const QUESTION_TYPES = ["single", "multi", "short"] as const;
const QText = z.string().trim().min(1).max(1000);
const Choices = z.array(z.string().trim().min(1).max(300)).min(2).max(8);
const Explain = z.string().max(2000).default("");

/**
 * Question kinds (SPEC §4.12). Old quizzes have no `type` → single.
 * - single: one correct choice (`answer` = index).
 * - multi:  select all that apply (`answers` = indexes); correct only when exactly that set is picked.
 * - short:  typed answer, matched against `accept` (case, spacing and a trailing period ignored; numbers compared
 *           as numbers, within `tolerance` if given).
 */
export const QuestionSchema = z.preprocess(
  (v) => (v && typeof v === "object" && !("type" in v) ? { ...v, type: "single" } : v),
  z.discriminatedUnion("type", [
    z
      .object({ type: z.literal("single"), q: QText, choices: Choices, answer: z.number().int().min(0), explain: Explain })
      .refine((q) => q.answer < q.choices.length, { message: "answer must be the index of a choice", path: ["answer"] }),
    z
      .object({ type: z.literal("multi"), q: QText, choices: Choices, answers: z.array(z.number().int().min(0)).min(1), explain: Explain })
      .refine((q) => q.answers.every((a) => a < q.choices.length), { message: "answers must be indexes of choices", path: ["answers"] })
      .refine((q) => new Set(q.answers).size === q.answers.length, { message: "answers must not repeat", path: ["answers"] }),
    z.object({
      type: z.literal("short"),
      q: QText,
      accept: z.array(z.string().trim().min(1).max(200)).min(1).max(10),
      tolerance: z.number().min(0).optional(),
      explain: Explain,
    }),
  ]),
);

export const QuizSchema = z.object({
  id: Id,
  title: Title,
  tags: Tags,
  skills: SkillWeights,
  difficulty: z.enum(DIFFICULTIES),
  topic_refs: z.array(TopicRef).default([]),
  status: z.enum(QUIZ_STATUS).default("open"),
  /** Assessment id once submitted. */
  assessment: Id.nullable().default(null),
  /** Agent that wrote the quiz. */
  author: z.string().min(1),
  questions: z.array(QuestionSchema).min(1).max(50),
  ...Timestamps,
});

/* ---------- Note (SPEC §4.10) ---------- */

export const NOTE_TYPES = ["note", "decision", "log"] as const;
export const NoteSchema = z.object({
  id: Id,
  title: Title,
  type: z.enum(NOTE_TYPES).default("note"),
  tags: Tags,
  links: z.array(EntityRef).default([]),
  ...Timestamps,
});

/* ---------- Schedule (SPEC §4.13) ---------- */

export const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:MM (24h)");

export const EventSchema = z
  .object({
    id: Id,
    title: Title,
    date: IsoDate,
    /** null + null = all-day. */
    start: Time.nullable().default(null),
    end: Time.nullable().default(null),
    links: z.array(EntityRef).default([]),
    notes: z.string().default(""),
    /** Google Calendar event id once synced. */
    google_id: z.string().nullable().default(null),
    /** ISO timestamp of the last change (used to resolve sync conflicts). */
    updated: z.iso.datetime({ offset: true }),
  })
  .refine((e) => (e.start === null) === (e.end === null), { message: "give both start and end, or neither (all-day)", path: ["end"] })
  .refine((e) => e.start === null || e.end! > e.start, { message: "end must be after start", path: ["end"] });
export const EventListSchema = z.array(EventSchema).refine(uniqueIds, "event ids must be unique");

/** Google Calendar settings. Secrets and sync cursors live outside data/ (~/.panya). */
export const GoogleSettingsSchema = z.object({
  /** The dedicated "Panya" calendar the app writes to. */
  calendar_id: z.string().nullable().default(null),
  /** Calendars shown read-only in the Schedule. */
  pull_calendars: z.array(z.string().min(1)).default(["primary"]),
  push: z
    .object({
      events: z.boolean().default(true),
      task_dues: z.boolean().default(true),
      course_slots: z.boolean().default(true),
      exams: z.boolean().default(true),
    })
    .prefault({}),
});

/* ---------- System map (SPEC §4.14) ---------- */

export const MAP_STATUS = ["planned", "building", "done", "blocked"] as const;
export const MAX_MAP_NODES = 60;

export const MapNodeSchema = z.object({
  id: Id,
  label: Title,
  /** Column, left → right. One of the map's lanes. */
  lane: Id,
  /** Optional; derived from linked tasks when omitted. */
  status: z.enum(MAP_STATUS).nullable().default(null),
  /** Task ids of the same project that build this part. */
  tasks: z.array(z.string()).default([]),
  note: z.string().default(""),
});

export const MapEdgeSchema = z.object({
  from: Id,
  to: Id,
  label: z.string().default(""),
});

export const ProjectMapSchema = z
  .object({
    /** "You are here": the part being worked on now. */
    focus: Id.nullable().default(null),
    lanes: z.array(Id).min(1).refine((l) => new Set(l).size === l.length, "lanes must be unique"),
    nodes: z.array(MapNodeSchema).max(MAX_MAP_NODES).default([]),
    edges: z.array(MapEdgeSchema).default([]),
  })
  .superRefine((m, ctx) => {
    const ids = new Set<string>();
    for (const n of m.nodes) {
      if (ids.has(n.id)) ctx.addIssue({ code: "custom", message: `duplicate node "${n.id}"`, path: ["nodes"] });
      ids.add(n.id);
      if (!m.lanes.includes(n.lane)) {
        ctx.addIssue({ code: "custom", message: `node "${n.id}" lane "${n.lane}" is not one of: ${m.lanes.join(", ")}`, path: ["nodes"] });
      }
    }
    for (const e of m.edges) {
      for (const end of [e.from, e.to]) {
        if (!ids.has(end)) ctx.addIssue({ code: "custom", message: `edge ${e.from} → ${e.to}: unknown node "${end}"`, path: ["edges"] });
      }
      if (e.from === e.to) ctx.addIssue({ code: "custom", message: `edge ${e.from} → ${e.to} points to itself`, path: ["edges"] });
    }
    if (m.focus !== null && !ids.has(m.focus)) {
      ctx.addIssue({ code: "custom", message: `focus "${m.focus}" is not a node`, path: ["focus"] });
    }
  });

/* ---------- types ---------- */

type Out<S extends z.ZodType> = z.output<S>;
type In<S extends z.ZodType> = z.input<S>;
type NoTimestamps<T> = Omit<T, "created" | "updated">;
/** Markdown-backed entity: frontmatter fields + free Markdown body. */
export type WithBody<T> = T & { body: string };

export type Goal = Out<typeof GoalSchema>;
export type Project = Out<typeof ProjectSchema>;
export type Task = Out<typeof TaskSchema>;
export type Learning = Out<typeof LearningSchema>;
export type Topic = Out<typeof TopicSchema>;
export type Domain = Out<typeof DomainSchema>;
export type Taxonomy = Out<typeof TaxonomySchema>;
export type Adjustment = Out<typeof AdjustmentSchema>;
export type Assessment = Out<typeof AssessmentSchema>;
export type Note = Out<typeof NoteSchema>;
export type Quiz = Out<typeof QuizSchema>;
export type Question = Out<typeof QuestionSchema>;

export type TaskStatus = Task["status"];
export type TopicStatus = Topic["status"];

export type GoalInput = NoTimestamps<In<typeof GoalSchema>> & { body?: string };
export type GoalPatch = Partial<Omit<GoalInput, "id">>;
export type ProjectInput = Omit<NoTimestamps<In<typeof ProjectSchema>>, "phase" | "phases"> & {
  phases?: string[];
  phase?: string;
  body?: string;
  tasks?: TaskInput[];
};
export type ProjectPatch = Partial<Omit<ProjectInput, "id" | "tasks">>;
export type TaskInput = Omit<In<typeof TaskSchema>, "id" | "done_at"> & { id?: string };
export type TaskPatch = Partial<Omit<TaskInput, "id">>;
export type LearningInput = NoTimestamps<In<typeof LearningSchema>> & { body?: string; topics?: TopicInput[] };
export type LearningPatch = Partial<Omit<LearningInput, "id" | "type" | "topics">>;
export type TopicInput = Omit<In<typeof TopicSchema>, "phase"> & { phase?: string };
export type TopicPatch = Partial<Omit<TopicInput, "id">>;
export type AdjustmentInput = { skill: string; delta: number; reason: string; evidence?: string[] };
export type AssessmentInput = Omit<In<typeof AssessmentSchema>, "id" | "date"> & {
  id?: string;
  date?: string;
  body?: string;
};
export type QuizInput = Omit<In<typeof QuizSchema>, "id" | "status" | "assessment" | "author" | "created" | "updated"> & {
  id?: string;
};
export type NoteInput = NoTimestamps<In<typeof NoteSchema>> & { body?: string };
export type NotePatch = Partial<Omit<NoteInput, "id">>;
export type ScheduleEvent = Out<typeof EventSchema>;
export type EventInput = Omit<In<typeof EventSchema>, "id" | "updated" | "google_id"> & { id?: string };
export type EventPatch = Partial<Omit<EventInput, "id">>;
export type GoogleSettings = Out<typeof GoogleSettingsSchema>;
export type GoogleSettingsPatch = Partial<In<typeof GoogleSettingsSchema>>;
export type ProjectMap = Out<typeof ProjectMapSchema>;
export type MapNode = Out<typeof MapNodeSchema>;
export type MapStatus = (typeof MAP_STATUS)[number];
export type ProjectMapInput = In<typeof ProjectMapSchema>;
export type MapNodePatch = Partial<Omit<In<typeof MapNodeSchema>, "id">>;
