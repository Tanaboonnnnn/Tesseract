import { ClassroomStore, type ClassroomBundle } from "./classroom.ts";
import type { Visual } from "./visuals.ts";

export const courseRef = (id: string) => "courses/" + id;
export const lessonRef = (course: string, lesson: string) => courseRef(course) + "/lessons/" + lesson;

export function publishedClassrooms(dataDir: string) {
  const db = new ClassroomStore(dataDir);
  return db.listPublished().map(r => db.getPublished(r.course_id)).filter(r => r !== null);
}

type Published = NonNullable<ReturnType<ClassroomStore["getPublished"]>>;
type Lesson = ClassroomBundle["lessons"][number];
const visuals = (lesson: Lesson) => [
  ...lesson.blocks.flatMap(block=>block.type==="visual"?[block.visual]:[]),
  ...lesson.labs.flatMap(lab=>lab.visuals?.map(item=>item.visual)??[]),
];

export function classroomSummary(row: Published) {
  return {
    id: row.course_id, course_id: row.course_id, ref: courseRef(row.course_id),
    kind: "classroom" as const, type: "course" as const, status: "published" as const,
    title: row.title, language: row.bundle.language, revision_id: row.revision_id, revision_created_at: row.created_at,
    topics: row.bundle.lessons.length, lesson_count: row.bundle.lessons.length, source_count: row.bundle.sources.length,
    lab_count: row.bundle.lessons.reduce((sum, l) => sum + l.labs.length, 0),
    visual_count: row.bundle.lessons.reduce((sum, l) => sum + visuals(l).length, 0),
    progress: null, needs_review: null,
  };
}

export function classroomOutline(row: Published) {
  return {
    ...classroomSummary(row),
    lessons: row.bundle.lessons.map(l => ({
      id: l.id, ref: lessonRef(row.course_id, l.id), title: l.title, objective: l.objective,
      visual_count: visuals(l).length, lab_count: l.labs.length, question_count: l.questions.length,
    })),
  };
}

/** Use explicit DTOs at the MCP boundary. Never export question keys, learner attempts or draft bodies. */
export function learnerVisual(v: Visual) {
  const common = { id: v.id, title: v.title, type: v.type, steps: v.steps, step_mode: v.step_mode };
  if (v.type === "html") return null;
  if (v.type !== "lesson") return { ...common, data: v.data };
  return { ...common, data: { blocks: v.data.blocks.flatMap(b => {
    if (b.kind === "html" || b.kind === "visual") return [];
    if (b.kind === "check") return [{ kind: "check", q: b.q }];
    return [b as { kind: string }];
  }) } };
}

export function classroomLesson(row: Published, id: string, section: "learn" | "lab" | "check", offset: number, limit: number) {
  const l = row.bundle.lessons.find(item => item.id === id);
  if (!l) return null;
  let entries: unknown[];
  if (section === "learn") entries = l.blocks.map(b => b.type === "text"
    ? { type: "text", markdown: b.markdown }
    : { type: "visual", id: b.visual.id, title: b.visual.title, renderer: b.visual.type });
  else if (section === "lab") entries = l.labs.map((lab, index) => ({
    index, title:lab.title, platform: lab.platform, environment: lab.environment, prerequisites: lab.prerequisites, steps: lab.steps, cleanup: lab.cleanup,
    ...(lab.visuals?.length?{visuals:lab.visuals.map(({after_step,visual})=>({after_step,id:visual.id,title:visual.title,renderer:visual.type}))}:{}),
  }));
  else entries = l.questions.map(q => q.type === "explain"
    ? { id: q.id, type: q.type, prompt: q.prompt }
    : { id: q.id, type: q.type, prompt: q.prompt, choices: q.choices });
  return {
    course_id: row.course_id, revision_id: row.revision_id, lesson_id: l.id, ref: lessonRef(row.course_id, id),
    title: l.title, objective: l.objective, section, offset, total: entries.length, entries: entries.slice(offset, offset + limit),
    sources: row.bundle.sources.filter(s => l.source_ids.includes(s.id)).map(({ id, title, url, rights, accessed_on }) => ({ id, title, url, rights, accessed_on })),
    content_is_untrusted: true,
  };
}

export function classroomVisuals(row: Published, lessonId?: string, visualId?: string) {
  const items = row.bundle.lessons.filter(l => !lessonId || l.id === lessonId)
    .flatMap(l => visuals(l).map(v => ({ l, v })));
  if (!visualId) return items.map(({ l, v }) => ({
    id: v.id, lesson_id: l.id, title: v.title, type: v.type, revision_id: row.revision_id,
    ref: lessonRef(row.course_id, l.id) + "/visuals/" + v.id,
  }));
  const found = items.filter(({ v }) => v.id === visualId);
  if (found.length !== 1) return null;
  const { l, v } = found[0]!;
  return { course_id: row.course_id, lesson_id: l.id, revision_id: row.revision_id, visual: learnerVisual(v), content_is_untrusted: true };
}

export function searchClassrooms(rows: Published[], query: string, limit = 20) {
  const q = query.trim().toLocaleLowerCase();
  const includes = (s: string) => s.toLocaleLowerCase().includes(q);
  const hits: { ref: string; title: string; in: string }[] = [];
  for (const row of rows) {
    if (includes(row.course_id) || includes(row.title)) hits.push({ ref: courseRef(row.course_id), title: row.title, in: "classroom" });
    for (const l of row.bundle.lessons) {
      if (includes(l.id) || includes(l.title) || includes(l.objective)) {
        hits.push({ ref: lessonRef(row.course_id, l.id), title: l.title, in: "classroom lesson" });
      }
    }
  }
  return { total: hits.length, hits: hits.slice(0, limit) };
}
