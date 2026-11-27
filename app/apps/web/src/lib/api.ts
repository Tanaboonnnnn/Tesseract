import type { ClassroomBundle, ClassroomTrashItem } from "@tesseract/core";
/** Typed client for apps/server. Types come straight from core (type-only, nothing bundled). */
import type {
  ActivitySummary,
  Assessment,
  DomainLevel,
  goalSummary,
  learningSummary,
  LearningView,
  Note,
  noteDetail,
  NoteInput,
  NotePatch,
  overview,
  ProjectInput,
  ProjectPatch,
  projectSummary,
  ProjectView,
  quizPublic,
  QuizResult,
  ReviewItem,
  ProjectMapView,
  LearningMapView,
  Visual,
  VisualSummary,
  PlotData,
  PlotTrace,
  LessonBlock,
  DeleteImpact,
  MapNodePatch,
  ScheduleEvent,
  ScheduleItem,
  EventInput,
  EventPatch,
  GoogleSettings,
  GoogleSettingsPatch,
  SkillView,
  Task,
  TaskInput,
  TaskPatch,
  TopicInput,
  TopicPatch,
  TopicView,
} from "@tesseract/core";

export type Overview = ReturnType<typeof overview>;
export type ProjectSummary = ReturnType<typeof projectSummary>;
export type LearningSummary = ReturnType<typeof learningSummary>;
export type GoalSummary = ReturnType<typeof goalSummary>;
export type QuizPublic = ReturnType<typeof quizPublic>;
export type NoteDetail = ReturnType<typeof noteDetail>;
export type NoteSummary = Omit<Note, "body"> & { excerpt: string };
export type QuizSummary = {
  id: string;
  title: string;
  status: "open" | "done";
  difficulty: Assessment["difficulty"];
  skills: Record<string, number>;
  questions: number;
  author: string;
  created: string;
  topic_refs: string[];
  assessment: string | null;
  score: number | null;
};
export type { ActivitySummary, Assessment, DomainLevel, LearningView, ProjectView, QuizResult, ReviewItem, SkillView, Task, TopicView };
export type { ScheduleEvent, ScheduleItem, ProjectMapView, LearningMapView, Visual, VisualSummary, PlotData, PlotTrace, LessonBlock };
import type { TokenReport } from "@tesseract/mcp/measure";
export type { TokenReport };
/** Phone & tablet (LAN) state; pairUrls only on this PC (apps/server/src/phone.ts). */
export type PhoneInfo = { available: false } | { available: true; on: boolean; urls: string[]; pairUrls?: string[] };
/** Remote access state (apps/server/src/remote.ts). */
type LocalMcpPersistence = {canRemember?:true;remembered?:boolean;restoreError?:string};
export type LocalMcpInfo = {available:false} | (LocalMcpPersistence & (
  {available:true;on:false} | {available:true;on:true;mode?:"header";url:string;token?:string} | {available:true;on:true;mode:"link";url?:string}
));
export type RemoteInfo = { available: false } | { available: true; on: boolean; until: string | null; verified?: boolean; protectedKey?: boolean; setup: { binary: boolean; key: boolean; tunnel: boolean }; error: string | null };
export type GoogleInfo = {
  available: boolean;
  client?: boolean;
  connected?: boolean;
  calendar_id?: string | null;
  last_sync?: string | null;
  last_error?: string | null;
  settings: GoogleSettings;
};
export type SyncResult = { calendar_id: string; pulled: number; pushed: number; removed: number; last_sync: string };

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    cache: "no-store",
    signal,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? "ERROR", data.message ?? res.statusText, res.status);
  return data as T;
}

export type CourseRevision = { revision_id: string; course_id: string; title: string; created_at: string; published: boolean; previously_published: boolean; latest: boolean };
export type CourseDetail = Omit<CourseRevision, "published" | "previously_published" | "latest"> & Partial<Pick<CourseRevision, "published" | "previously_published" | "latest">> & { bundle: ClassroomBundle };
export type LessonOption = { ref: string; course: string; title: string; url: string };
export type RelatedTask = { ref: string; project: string; projectTitle: string; title: string; status: string };
export type CourseAttempt = { attempt_id: string; lesson_id: string; question_id: string; score: number | null };
export type CourseProgress = CourseAttempt & { revision_id: string; answer: string };

export const api = {
  overview: () => request<Overview>("GET", "/overview"),
  goals: () => request<GoalSummary[]>("GET", "/goals"),

  projects: () => request<ProjectSummary[]>("GET", "/projects"),
  project: (id: string) => request<ProjectView>("GET", `/projects/${id}`),
  createProject: (input: ProjectInput) => request<ProjectView>("POST", "/projects", input),
  updateProject: (id: string, patch: ProjectPatch) => request<ProjectView>("PATCH", `/projects/${id}`, patch),
  addTask: (project: string, input: TaskInput) => request<Task>("POST", `/projects/${project}/tasks`, input),
  updateTask: (project: string, task: string, patch: TaskPatch) =>
    request<Task>("PATCH", `/projects/${project}/tasks/${task}`, patch),
  deleteTask: (project: string, task: string) => request<void>("DELETE", `/projects/${project}/tasks/${task}`),
  projectMap: (project: string) => request<ProjectMapView | null>("GET", `/projects/${project}/map`),
  updateMapNode: (project: string, node: string, patch: MapNodePatch) =>
    request<ProjectMapView>("PATCH", `/projects/${project}/map/nodes/${node}`, patch),
  setMapFocus: (project: string, node: string | null) => request<ProjectMapView>("PUT", `/projects/${project}/map/focus`, { node }),

  newCourse: (title: string) => request<{ id: string }>("POST", "/learning", { title }),
  publishedCourses: () => request<CourseRevision[]>("GET", "/classroom/published"),
  publishedCourse: (id: string) => request<CourseDetail>("GET", "/classroom/published/" + id),
  latestDraftReceipt: () => request<{status:"unknown"}|{status:"staged";revision_id:string}>("GET", "/classroom/latest-receipt"),
  courseDrafts: () => request<CourseRevision[]>("GET", "/classroom/drafts"),
  classroomTrash: () => request<ClassroomTrashItem[]>("GET", "/classroom/trash"),
  setClassroomTrashed: (kind: ClassroomTrashItem["kind"], id: string, trashed: boolean) =>
    request<{ trashed: boolean }>("POST", "/classroom/trash/" + kind + "/" + encodeURIComponent(id), { trashed }),
  courseDraft: (id: string) => request<CourseDetail>("GET", "/classroom/drafts/" + id),
  previewCourseFile: (format: "json" | "zip", contents: string) =>
    request<{ bundle: ClassroomBundle }>("POST", "/classroom/import", { format, contents }),
  stageCourseFile: (format: "json" | "zip", contents: string, request_id: string, base_revision?: string) =>
    request<{ revision_id: string }>("POST", "/classroom/import", { format, contents, confirm: true, request_id, base_revision }),
  makeCourseCurrent: (revision: string, operation: "publish" | "restore") =>
    request<{ revision_id: string }>("POST", "/classroom/drafts/" + revision + "/" + operation, {}),
  lessonOptions: () => request<LessonOption[]>("GET", "/learning-topic-options"),
  relatedTasks: (id: string) => request<RelatedTask[]>("GET", "/learning-related-tasks/" + id),
  courseAttempts: (id: string) => request<CourseAttempt[]>("GET", "/classroom/published/" + id + "/attempts"),
  courseProgress: (id: string, revision: string) => request<CourseProgress[]>(
    "GET", "/classroom/published/" + encodeURIComponent(id) + "/progress?revision=" + encodeURIComponent(revision)),
  submitCourseAnswer: (id: string, input: { revision_id: string; attempt_id: string; lesson_id: string; question_id: string; answer: string | number[] }) =>
    request<{ score: null | number }>("POST", "/classroom/published/" + id + "/attempts", input),
  learning: () => request<LearningSummary[]>("GET", "/learning"),
  deleteImpact: (kind: "projects" | "learning", id: string) => request<DeleteImpact>("GET", `/${kind}/${id}/delete-impact`),
  deleteEntity: (kind: "projects" | "learning", id: string) => request<DeleteImpact>("DELETE", `/${kind}/${id}`),
  phone: () => request<PhoneInfo>("GET", "/phone"),
  setPhone: (on: boolean) => request<PhoneInfo & { switching?: boolean }>("POST", "/phone", { on }),
  localMcp: () => request<LocalMcpInfo>("GET", "/local-mcp"),
  localMcpSwitch: (action:"start"|"start-link"|"remember-link"|"stop") => request<LocalMcpInfo>("POST", "/local-mcp/"+action, {}),
  remote: () => request<RemoteInfo>("GET", "/remote"),
  remoteSetup: (tunnelId: string, key: string) => request<RemoteInfo>("POST", "/remote/setup", { tunnelId, key }),
  remoteStart: (hours: number) => request<RemoteInfo>("POST", "/remote/start", { hours }),
  remoteStop: () => request<RemoteInfo>("POST", "/remote/stop", {}),
  windowState: () => request<{ available: boolean; opacity?: number }>("GET", "/window"),
  setWindow: (opacity: number) => request<{ available: boolean; opacity: number }>("PUT", "/window", { opacity }),
  learningItem: (id: string) => request<LearningView>("GET", `/learning/${id}`),
  guideTokens: () => request<TokenReport>("GET", "/guide/tokens"),
  visuals: (learning: string) => request<VisualSummary[]>("GET", `/learning/${learning}/visuals`),
  visual: (learning: string, id: string) => request<Visual>("GET", `/learning/${learning}/visuals/${id}`),
  deleteVisual: (learning: string, id: string) => request<void>("DELETE", `/learning/${learning}/visuals/${id}`),
  learningMap: (id: string) => request<LearningMapView>("GET", `/learning/${id}/map`),
  addTopic: (learning: string, input: TopicInput) => request<TopicView>("POST", `/learning/${learning}/topics`, input),
  updateTopic: (learning: string, topic: string, patch: TopicPatch) =>
    request<TopicView>("PATCH", `/learning/${learning}/topics/${topic}`, patch),
  review: () => request<ReviewItem[]>("GET", "/review"),

  skills: () => request<DomainLevel[]>("GET", "/skills"),
  skill: (id: string) => request<SkillView>("GET", `/skills/${id}`),
  assessments: (skill?: string) =>
    request<Omit<Assessment, "body">[]>("GET", `/assessments${skill ? `?skill=${encodeURIComponent(skill)}` : ""}`),

  quizzes: () => request<QuizSummary[]>("GET", "/quizzes"),
  deleteQuiz: (id: string) => request<void>("DELETE", `/quizzes/${encodeURIComponent(id)}`),
  quiz: (id: string) => request<QuizPublic>("GET", `/quizzes/${id}`),
  submitQuiz: (id: string, answers: (number | number[] | string)[]) => request<QuizResult>("POST", `/quizzes/${id}/submit`, { answers }),

  notes: (type?: Note["type"]) => request<NoteSummary[]>("GET", `/notes${type ? `?type=${type}` : ""}`),
  deleteNote: (id: string) => request<void>("DELETE", `/notes/${encodeURIComponent(id)}`),
  note: (id: string) => request<NoteDetail>("GET", `/notes/${id}`),
  createNote: (input: NoteInput) => request<Note>("POST", "/notes", input),
  updateNote: (id: string, patch: NotePatch) => request<Note>("PATCH", `/notes/${id}`, patch),

  schedule: (from: string, to: string) =>
    request<{ from: string; to: string; items: ScheduleItem[] }>("GET", `/schedule?from=${from}&to=${to}`),
  event: (id: string) => request<ScheduleEvent>("GET", `/events/${id}`),
  addEvent: (input: EventInput) => request<ScheduleEvent>("POST", "/events", input),
  updateEvent: (id: string, patch: EventPatch) => request<ScheduleEvent>("PATCH", `/events/${id}`, patch),
  deleteEvent: (id: string) => request<void>("DELETE", `/events/${id}`),
  google: () => request<GoogleInfo>("GET", "/google"),
  googleSettings: (patch: GoogleSettingsPatch) => request<GoogleSettings>("PATCH", "/google/settings", patch),
  googleConnect: () => request<{ url: string }>("POST", "/google/connect", {}),
  googleSync: () => request<SyncResult>("POST", "/google/sync", {}),
  googleDisconnect: () => request<{ ok: true }>("POST", "/google/disconnect", {}),

  session: async () => {
    const result = await request<{ app: "tesseract"; ok: true; local: boolean; desktop?:{version:string;build:string} }>("GET", "/session", undefined, AbortSignal.timeout(4_000));
    if (result.app !== "tesseract" || result.ok !== true || typeof result.local !== "boolean") throw new Error("Unexpected host response");
    return result;
  },
  pair: (token: string) => request<{ ok: true }>("POST", "/pair", { token }),

  activity: () => request<ActivitySummary[]>("GET", "/activity"),
  undo: (id: string) => request<ActivitySummary>("POST", `/activity/${id}/undo`, {}),
};
