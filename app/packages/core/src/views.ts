/**
 * Compact views for AI clients (SPEC §1 token-efficient):
 * summaries by default, full detail only when asked.
 */
import { daysBetween } from "./calc.ts";
import { BrainError } from "./errors.ts";
import type { Quiz } from "./schemas.ts";
import type { GoalView, LearningView, ProjectView, Store, TopicView } from "./store.ts";

export function projectSummary(p: ProjectView) {
  const count = (s: string) => p.tasks.filter((t) => t.status === s).length;
  return {
    id: p.id,
    title: p.title,
    template: p.template,
    status: p.status,
    phase: p.phase,
    progress: p.progress,
    due: p.due,
    goal: p.goal,
    tasks: { todo: count("todo"), doing: count("doing"), review: count("review"), done: count("done") },
  };
}

function topicCompact(t: TopicView) {
  return {
    id: t.id,
    title: t.title,
    phase: t.phase,
    status: t.effective_status,
    ...(t.review.reasons.length ? { review: t.review.reasons } : {}),
    last_score: t.last_score,
    last_reviewed: t.last_reviewed,
    skills: t.skills,
    ...(t.depends_on.length ? { depends_on: t.depends_on } : {}),
  };
}

export function learningSummary(l: LearningView, today: string) {
  const nextExam = (l.exams ?? [])
    .filter((e) => e.date && e.date >= today)
    .sort((a, b) => a.date!.localeCompare(b.date!))[0];
  return {
    id: l.id,
    title: l.title,
    type: l.type,
    goal: l.goal,
    progress: l.progress,
    topics: l.topics.length,
    needs_review: l.topics.filter((t) => t.review.reasons.length > 0).length,
    ...(nextExam ? { next_exam: { title: nextExam.title, date: nextExam.date } } : {}),
  };
}

export function learningDetail(l: LearningView) {
  const { topics, ...rest } = l;
  return { ...rest, topics: topics.map(topicCompact) };
}

export function goalSummary(g: GoalView) {
  return { id: g.id, title: g.title, status: g.status, target_date: g.target_date, progress: g.progress };
}

/** One call that gives an AI the whole picture. */
export function overview(store: Store) {
  const today = store.today();
  const projects = store.listProjects();
  const learning = store.listLearning();

  const tasksDue = projects
    .flatMap((p) => p.tasks.filter((t) => t.status !== "done" && t.due).map((t) => ({ project: p.id, ...t })))
    .filter((t) => daysBetween(today, t.due!) <= 7)
    .sort((a, b) => a.due!.localeCompare(b.due!))
    .map((t) => ({
      ref: `projects/${t.project}`,
      task: t.id,
      title: t.title,
      due: t.due,
      priority: t.priority,
      overdue: t.due! < today,
    }));

  const review = store.getReviewQueue();
  return {
    today,
    goals: store.listGoals().map(goalSummary),
    projects: projects.filter((p) => p.status !== "archived").map(projectSummary),
    learning: learning.map((l) => learningSummary(l, today)),
    tasks_due: tasksDue,
    review_queue: {
      total: review.length,
      top: review.slice(0, 5).map((r) => ({
        ref: `learning/${r.learning_id}#${r.topic.id}`,
        title: r.topic.title,
        reasons: r.topic.review.reasons,
      })),
    },
    skills: store.getSkillProfile().map((d) => ({ id: d.id, title: d.title, level: d.level })),
    quizzes_open: store
      .listQuizzes({ status: "open" })
      .map((q) => ({ id: q.id, title: q.title, questions: q.questions.length, author: q.author })),
    inbox: store.listInbox().length,
    data_problems: store.validateAll().length,
  };
}

/** Simple case-insensitive text search across everything. */
export function search(store: Store, query: string, limit = 20) {
  const q = query.toLowerCase();
  const hits: { ref: string; title: string; in: string }[] = [];
  const check = (ref: string, title: string, fields: Record<string, string>) => {
    for (const [name, text] of Object.entries(fields)) {
      if (text.toLowerCase().includes(q)) {
        hits.push({ ref, title, in: name });
        return;
      }
    }
  };
  for (const g of store.listGoals()) check(`goals/${g.id}`, g.title, { title: g.title, body: g.body });
  for (const p of store.listProjects()) {
    check(`projects/${p.id}`, p.title, { title: p.title, body: p.body, tags: p.tags.join(" ") });
    for (const t of p.tasks) check(`projects/${p.id}`, t.title, { [`task ${t.id}`]: t.title });
  }
  for (const l of store.listLearning()) {
    check(`learning/${l.id}`, l.title, { title: l.title, body: l.body, tags: l.tags.join(" ") });
    for (const t of l.topics) check(`learning/${l.id}#${t.id}`, t.title, { topic: t.title });
  }
  for (const n of store.listNotes()) check(`notes/${n.id}`, n.title, { title: n.title, body: n.body, tags: n.tags.join(" ") });
  for (const a of store.listAssessments()) check(`assessments/${a.id}`, a.title, { title: a.title, body: a.body });
  for (const d of store.getTaxonomy()) {
    for (const s of d.skills) check(`skills/${s.id}`, s.title, { skill: s.title });
  }
  return { query, total: hits.length, hits: hits.slice(0, limit) };
}

/** Everything an AI needs to write a fair quiz for a skill or topic. */
export function quizContext(store: Store, args: { skill?: string; topic_ref?: string }) {
  let skillIds: string[] = args.skill ? [args.skill] : [];
  let topic: ReturnType<typeof topicCompact> | undefined;
  if (args.topic_ref) {
    const [learningPart, topicId] = args.topic_ref.split("#");
    const learning = store.getLearning(learningPart!.replace(/^learning\//, ""));
    const t = learning.topics.find((x) => x.id === topicId);
    if (!t) throw new BrainError("NOT_FOUND", `Topic "${args.topic_ref}" not found`);
    topic = topicCompact(t);
    skillIds = [...new Set([...skillIds, ...t.skills])];
  }
  if (skillIds.length === 0) throw new BrainError("VALIDATION", "Give a skill or a topic_ref");

  const skills = skillIds.map((id) => {
    const s = store.getSkill(id);
    return {
      id: s.id,
      title: s.title,
      level: s.level,
      computed: s.computed,
      adjustment: s.adjustment,
      known_weaknesses: s.adjustments.filter((a) => a.delta < 0).map((a) => a.reason),
    };
  });
  const recent = store
    .listAssessments()
    .filter((a) => skillIds.some((id) => id in a.skills))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
    .map((a) => ({ id: a.id, title: a.title, score: a.score, difficulty: a.difficulty, date: a.date }));

  return {
    ...(topic ? { topic } : {}),
    skills,
    recent_assessments: recent,
    guidance: [
      "Pick difficulty from the level: <40 easy, 40–70 medium, >70 hard.",
      "Target known weaknesses. Grade strictly and honestly — never round up.",
      "Quiz in chat: save the result with record_assessment (source: ai-quiz), with questions, answers and your analysis in body.",
      "Quiz in the web app: create_quiz with single / multi (select all) / short (typed) questions; the server grades it.",
    ],
  };
}

/** Quiz as the web app may see it: answers and explanations stay hidden until it is taken. */
export function quizPublic(q: Quiz) {
  if (q.status === "done") return q;
  return {
    ...q,
    questions: q.questions.map((x) => (x.type === "short" ? { type: x.type, q: x.q } : { type: x.type, q: x.q, choices: x.choices })),
  };
}

/* ---------- Schedule (SPEC §4.13) ---------- */

/** `google` = read-only item from the user's other Google calendars (never stored). */
export type ScheduleKind = "event" | "class" | "task" | "assignment" | "exam" | "google";

export interface ScheduleItem {
  /** Stable key, e.g. `event:<id>`, `class:<learning>/<slot>`, `task:<project>/<task>`. */
  key: string;
  kind: ScheduleKind;
  title: string;
  date: string;
  start: string | null;
  end: string | null;
  ref: string | null;
  detail?: string;
}

export interface CourseSlot {
  key: string;
  learning: string;
  title: string;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  start: string | null;
  end: string | null;
  room: string | null;
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** "9:00-12:00" / "09:00 – 12:00" → ["09:00", "12:00"]; anything else → all-day. */
export function parseSlotTime(time: string): [string, string] | [null, null] {
  const m = /^\s*(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})\s*$/.exec(time);
  if (!m) return [null, null];
  const hhmm = (h: string, mm: string) => `${h.padStart(2, "0")}:${mm}`;
  return [hhmm(m[1]!, m[2]!), hhmm(m[3]!, m[4]!)];
}

/** Weekly class times of courses still running (no final grade yet). */
export function courseSlots(store: Store): CourseSlot[] {
  return store
    .listLearning()
    .filter((l) => l.type === "course" && !l.grade)
    .flatMap((l) =>
      (l.schedule ?? []).map((s, i) => {
        const [start, end] = parseSlotTime(s.time);
        return {
          key: `class:${l.id}/${i}`,
          learning: l.id,
          title: l.title,
          weekday: WEEKDAYS.indexOf(s.day),
          start,
          end,
          room: s.room,
        };
      }),
    );
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d + n);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d).getDay();
}

/** Everything on the calendar between two dates (inclusive, max 92 days), sorted. */
export function scheduleItems(store: Store, from: string, to: string): ScheduleItem[] {
  if (to < from) throw new BrainError("VALIDATION", "`to` must not be before `from`");
  if (daysBetween(from, to) > 92) throw new BrainError("VALIDATION", "Range is limited to 92 days");
  const inRange = (d: string | null): d is string => !!d && d >= from && d <= to;
  const items: ScheduleItem[] = [];

  for (const e of store.listEvents({ from, to })) {
    items.push({
      key: `event:${e.id}`,
      kind: "event",
      title: e.title,
      date: e.date,
      start: e.start,
      end: e.end,
      ref: e.links[0] ?? null,
      ...(e.notes ? { detail: e.notes } : {}),
    });
  }

  const slots = courseSlots(store);
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const wd = weekdayOf(d);
    for (const s of slots.filter((x) => x.weekday === wd)) {
      items.push({
        key: `${s.key}/${d}`,
        kind: "class",
        title: s.title,
        date: d,
        start: s.start,
        end: s.end,
        ref: `learning/${s.learning}`,
        ...(s.room ? { detail: s.room } : {}),
      });
    }
  }

  for (const p of store.listProjects()) {
    if (p.status === "archived" || p.status === "done") continue;
    for (const t of p.tasks) {
      if (t.status === "done" || !inRange(t.due)) continue;
      items.push({
        key: `task:${p.id}/${t.id}`,
        kind: "task",
        title: t.title,
        date: t.due,
        start: null,
        end: null,
        ref: `projects/${p.id}`,
        detail: `${p.title} · ${t.priority}`,
      });
    }
  }

  for (const l of store.listLearning()) {
    for (const a of l.assignments ?? []) {
      if (a.status === "done" || !inRange(a.due)) continue;
      items.push({ key: `assignment:${l.id}/${a.id}`, kind: "assignment", title: a.title, date: a.due, start: null, end: null, ref: `learning/${l.id}`, detail: l.title });
    }
    for (const x of l.exams ?? []) {
      if (!inRange(x.date)) continue;
      items.push({ key: `exam:${l.id}/${x.id}`, kind: "exam", title: x.title, date: x.date, start: null, end: null, ref: `learning/${l.id}`, detail: l.title });
    }
  }

  return items.sort(
    (a, b) => a.date.localeCompare(b.date) || (a.start ?? "").localeCompare(b.start ?? "") || a.key.localeCompare(b.key),
  );
}

/** Resolve `[[target]]` to an entity ref: note id/title first, then project / learning / goal / skill ids. */
function wikiResolver(store: Store): (target: string) => string | null {
  const slug = (t: string) =>
    t
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const notes = store.listNotes();
  const byTitle = new Map(notes.map((n) => [n.title.toLowerCase(), n.id]));
  const ids = new Map<string, string>();
  for (const g of store.listGoals()) ids.set(g.id, `goals/${g.id}`);
  for (const d of store.getTaxonomy()) for (const s of d.skills) ids.set(s.id, `skills/${s.id}`);
  for (const l of store.listLearning()) ids.set(l.id, `learning/${l.id}`);
  for (const p of store.listProjects()) ids.set(p.id, `projects/${p.id}`);
  for (const n of notes) ids.set(n.id, `notes/${n.id}`); // notes win
  return (target) => {
    const t = target.split("|")[0]!.trim();
    const byName = byTitle.get(t.toLowerCase());
    if (byName) return `notes/${byName}`;
    return ids.get(slug(t)) ?? null;
  };
}

const WIKILINK = /\[\[([^\]\n]+)\]\]/g;

/** A note plus resolved [[wikilinks]] and the notes that point to it. */
export function noteDetail(store: Store, id: string) {
  const note = store.getNote(id);
  const resolve = wikiResolver(store);
  const wikilinks = [...new Set([...note.body.matchAll(WIKILINK)].map((m) => m[1]!))].map((text) => ({
    text,
    ref: resolve(text),
  }));
  const backlinks = store
    .listNotes()
    .filter((n) => n.id !== note.id)
    .filter(
      (n) =>
        n.links.includes(`notes/${note.id}`) ||
        [...n.body.matchAll(WIKILINK)].some((m) => resolve(m[1]!) === `notes/${note.id}`),
    )
    .map((n) => ({ id: n.id, title: n.title, type: n.type }));
  return { ...note, wikilinks, backlinks };
}

/* ---------- Learning map (SPEC §4.15): derived from topics, nothing stored ---------- */

export type LearningMapStatus = "planned" | "building" | "done" | "review";

export interface LearningMapView {
  learning: string;
  /** Phases that have topics, in roadmap order. */
  lanes: string[];
  /** "You are here": the topic being learned now (or the next one to start). */
  focus: string | null;
  nodes: {
    id: string;
    label: string;
    lane: string;
    effective_status: LearningMapStatus;
    progress: null;
    last_score: number | null;
    review: string[];
  }[];
  /** depends_on → links (prerequisite → topic). */
  edges: { from: string; to: string; label: string }[];
  summary: { parts: number; done: number; building: number; review: number; focus: { id: string; label: string } | null };
}

const TOPIC_TO_MAP = {
  "not-started": "planned",
  learning: "building",
  understood: "done",
  "needs-review": "review",
} as const satisfies Record<TopicView["effective_status"], LearningMapStatus>;

/**
 * A learning item as a map: phases are columns, topics are cards, depends_on are links.
 * Honest by construction: colors come from each topic's effective status (needs-review included).
 */
export function learningMap(l: LearningView): LearningMapView {
  const lanes = l.phases.filter((p) => l.topics.some((t) => t.phase === p));
  const all = new Map(l.topics.map((t) => [t.id, t]));
  // depth = longest prerequisite chain; inside a column, prerequisites come first (stable otherwise)
  const depth = new Map<string, number>();
  const depthOf = (id: string, seen: Set<string> = new Set()): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0; // cycle guard
    seen.add(id);
    const deps = all.get(id)?.depends_on.filter((d) => all.has(d)) ?? [];
    const d = deps.length ? 1 + Math.max(...deps.map((x) => depthOf(x, seen))) : 0;
    depth.set(id, d);
    return d;
  };
  const byLane = lanes.flatMap((p) => l.topics.filter((t) => t.phase === p).sort((a, b) => depthOf(a.id) - depthOf(b.id)));
  const ids = new Set(byLane.map((t) => t.id));
  const nodes = byLane.map((t) => ({
    id: t.id,
    label: t.title,
    lane: t.phase,
    effective_status: TOPIC_TO_MAP[t.effective_status],
    progress: null,
    last_score: t.last_score,
    review: t.review.reasons,
  }));
  const edges = byLane.flatMap((t) => t.depends_on.filter((d) => ids.has(d) && d !== t.id).map((d) => ({ from: d, to: t.id, label: "" })));
  const understood = new Set(nodes.filter((n) => n.effective_status === "done").map((n) => n.id));
  const ready = (id: string) => byLane.find((t) => t.id === id)!.depends_on.every((d) => understood.has(d) || !ids.has(d));
  const focusNode =
    nodes.find((n) => n.effective_status === "building") ??
    nodes.find((n) => n.effective_status === "review") ??
    nodes.find((n) => n.effective_status === "planned" && ready(n.id)) ??
    null;
  const count = (s: LearningMapStatus) => nodes.filter((n) => n.effective_status === s).length;
  return {
    learning: l.id,
    lanes,
    focus: focusNode?.id ?? null,
    nodes,
    edges,
    summary: {
      parts: nodes.length,
      done: count("done"),
      building: count("building"),
      review: count("review"),
      focus: focusNode ? { id: focusNode.id, label: focusNode.label } : null,
    },
  };
}
