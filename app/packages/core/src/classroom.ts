/** Isolated classroom draft/revision store. Existing workspace files and legacy tools never write here. */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { BrainError } from "./errors.ts";
import { VisualSchema } from "./visuals.ts";

const id = z.string().max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const text = (max = 500) => z.string().trim().min(1).max(max);
const noEmbeddedContent = (s: string) => !/<\/?[a-z][^>]*>/i.test(s) && !/!\s*\[|\]\(\s*(javascript|data|file):/i.test(s);
const markdown = text(12_000).refine(noEmbeddedContent, "Use Markdown without HTML or embedded image links");
const source = z.strictObject({
  id, title: text(), url: z.url({ protocol: /^https$/ }), accessed_on: z.iso.date(),
  rights: z.enum(["reference-only", "owned", "licensed", "unverified"]), summary: text(1200),
});
const visual = z.unknown().transform((input, ctx) => {
  try {
    const required = (input ?? {}) as Record<string, unknown>;
    const parsed = VisualSchema.safeParse({ ...required, author: "classroom", created: "2026-01-01", updated: "2026-01-01" });
    if (!parsed.success || parsed.data.type === "html" ||
      (parsed.data.type === "lesson" && parsed.data.data.blocks.some((b) => b.kind === "html" || b.kind === "visual" || (b.kind === "text" && !noEmbeddedContent(b.md))))) {
      ctx.addIssue({ code: "custom", message: "Use a valid typed visual without HTML, embedded images, or cross-workspace components" });
      return z.NEVER;
    }
    return parsed.data;
  } catch {
    ctx.addIssue({ code: "custom", message: "Invalid visual data" });
    return z.NEVER;
  }
});
const block = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text"), markdown }),
  z.strictObject({ type: z.literal("visual"), visual, fallback: text(2000) }),
]);
const question = z.discriminatedUnion("type", [
  z.strictObject({ id, type: z.literal("explain"), prompt: text(1200), rubric: z.array(text()).min(1).max(8), model_answer: text(3000) }),
  z.strictObject({ id, type: z.literal("multi"), prompt: text(1200), choices: z.array(text()).min(3).max(8), correct: z.array(z.number().int().nonnegative()).min(2).max(8), explanation: text(3000) }),
]);
const lab = z.strictObject({
  platform: z.enum(["windows", "linux", "both"]), environment: z.enum(["offline", "online"]), prerequisites: z.array(text()).max(10),
  steps: z.array(text(1500)).min(1).max(16), expected: text(1500), cleanup: text(1500).optional(),
});
export const ClassroomBundleSchema = z.strictObject({
  schema_version: z.literal(1), course_id: id, title: text(120), language: z.enum(["th", "en"]),
  sources: z.array(source).min(1).max(48),
  lessons: z.array(z.strictObject({
    id, title: text(120), objective: text(1000), source_ids: z.array(id).min(1).max(16),
    blocks: z.array(block).min(1).max(24), questions: z.array(question).max(30).default([]), labs: z.array(lab).max(8).default([]),
  })).min(1).max(24),
}).superRefine((bundle, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  const sourceIds = new Set(bundle.sources.map((s) => s.id));
  if (sourceIds.size !== bundle.sources.length) issue(["sources"], "Source IDs must be unique");
  if (new Set(bundle.lessons.map((l) => l.id)).size !== bundle.lessons.length) issue(["lessons"], "Lesson IDs must be unique");
  bundle.lessons.forEach((l, i) => {
    if (l.source_ids.some((s) => !sourceIds.has(s))) issue(["lessons", i, "source_ids"], "Unknown source ID");
    if (new Set(l.questions.map((q) => q.id)).size !== l.questions.length) issue(["lessons", i, "questions"], "Question IDs must be unique within a lesson");
    l.questions.forEach((q, qi) => {
      if (q.type === "multi" && (new Set(q.correct).size !== q.correct.length || q.correct.some((v) => v >= q.choices.length))) {
        issue(["lessons", i, "questions", qi, "correct"], "Use distinct zero-based choice indexes");
      }
    });
  });
});
export type ClassroomBundle = z.output<typeof ClassroomBundleSchema>;
export const ClassroomSubmitSchema = z.strictObject({
  request_id: z.string().min(6).max(96).regex(/^[a-zA-Z0-9_-]+$/),
  base_revision: z.uuid().optional(),
  bundle: z.unknown(),
});
export type ClassroomIssue = { code: string; path: string; message: string };
type Receipt = { ok: true; status: "staged"; course_id: string; revision_id: string } | { ok: false; issues: ClassroomIssue[] };
type RevisionSummary = { revision_id: string; course_id: string; title: string; created_at: string; published: boolean };
type RevisionRow = RevisionSummary & { body: string; sequence: number };
type AttemptRow = { attempt_id: string; revision_id: string; lesson_id: string; question_id: string; answer: string; score: number | null; created_at: string };

const MAX_REQUEST_BYTES = 256 * 1024;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const canonical = (value: unknown): string => JSON.stringify(value, (_key, v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b, "en"))) : v);
const fail = (code: string, path: string, message: string): Receipt => ({ ok: false, issues: [{ code, path, message }] });
const now = () => new Date().toISOString();

export class ClassroomStore {
  private readonly path: string;
  constructor(dataDir: string) { this.path = join(dataDir, ".classroom", "classroom.sqlite"); }

  private use<T>(write: boolean, empty: T, fn: (db: DatabaseSync) => T): T {
    if (!write && !existsSync(this.path)) return empty;
    if (write) mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const db = new DatabaseSync(this.path, { readOnly: !write });
    try {
      db.exec("PRAGMA busy_timeout = 2000");
      if (write) {
        db.exec("BEGIN IMMEDIATE");
        db.exec(`
          CREATE TABLE IF NOT EXISTS revisions (
            sequence INTEGER PRIMARY KEY, revision_id TEXT NOT NULL UNIQUE, course_id TEXT NOT NULL,
            title TEXT NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL,
            request_id TEXT NOT NULL UNIQUE, payload_hash TEXT NOT NULL);
          CREATE INDEX IF NOT EXISTS revisions_course ON revisions(course_id, sequence);
          CREATE TABLE IF NOT EXISTS published (course_id TEXT PRIMARY KEY, revision_id TEXT NOT NULL REFERENCES revisions(revision_id));
          CREATE TABLE IF NOT EXISTS history (revision_id TEXT PRIMARY KEY REFERENCES revisions(revision_id));
          CREATE TABLE IF NOT EXISTS attempts (
            attempt_id TEXT PRIMARY KEY, revision_id TEXT NOT NULL REFERENCES revisions(revision_id),
            lesson_id TEXT NOT NULL, question_id TEXT NOT NULL, question_hash TEXT NOT NULL,
            answer TEXT NOT NULL, score INTEGER, created_at TEXT NOT NULL);
          CREATE INDEX IF NOT EXISTS attempts_revision ON attempts(revision_id, created_at);
          CREATE TABLE IF NOT EXISTS journal (at TEXT NOT NULL, action TEXT NOT NULL, revision_id TEXT NOT NULL);
        `);
      }
      const result = fn(db);
      if (write) db.exec("COMMIT");
      return result;
    } finally { db.close(); } // closing rolls back any unfinished transaction
  }

  submit(input: unknown): Receipt {
    let bytes: string;
    try { bytes = canonical(input); } catch { return fail("VALIDATION", "", "Send JSON data only"); }
    if (!bytes || Buffer.byteLength(bytes) > MAX_REQUEST_BYTES) return fail("VALIDATION", "", "Draft exceeds the 256 KiB limit");
    const header = ClassroomSubmitSchema.safeParse(input);
    if (!header.success) return { ok: false, issues: header.error.issues.map((i) => ({ code: "VALIDATION", path: i.path.join("."), message: i.message })) };
    const parsed = ClassroomBundleSchema.safeParse(header.data.bundle);
    if (!parsed.success) return { ok: false, issues: parsed.error.issues.slice(0, 20).map((i) => ({ code: "VALIDATION", path: ["bundle", ...i.path].join("."), message: i.message })) };
    const { request_id, base_revision } = header.data;
    const { course_id, title } = parsed.data;
    const digest = hash(bytes);
    const body = JSON.stringify(parsed.data);
    return this.use<Receipt>(true, fail("UNAVAILABLE", "", "Draft store unavailable"), (db) => {
      const prior = db.prepare("SELECT revision_id, course_id, payload_hash FROM revisions WHERE request_id = ?").get(request_id);
      if (prior) return prior.payload_hash === digest
        ? { ok: true, status: "staged", course_id: String(prior.course_id), revision_id: String(prior.revision_id) }
        : fail("REQUEST_CONFLICT", "request_id", "This ID already belongs to a different submission");
      const newest = db.prepare("SELECT revision_id FROM revisions WHERE course_id = ? ORDER BY sequence DESC LIMIT 1").get(course_id);
      if ((newest?.revision_id ?? undefined) !== base_revision) return fail("STALE_REVISION", "base_revision", "Supply the latest draft revision for this course");
      const revision_id = randomUUID(), created = now();
      db.prepare("INSERT INTO revisions (revision_id, course_id, title, created_at, body, request_id, payload_hash) VALUES (?,?,?,?,?,?,?)")
        .run(revision_id, course_id, title, created, body, request_id, digest);
      db.prepare("INSERT INTO journal VALUES (?, 'stage', ?)").run(created, revision_id);
      return { ok: true, status: "staged", course_id, revision_id };
    });
  }

  getReceipt(requestId: string) {
    return this.use<{ ok: true; status: "staged"; revision_id: string; course_id: string } | null>(false, null, (db) => {
      const row = db.prepare("SELECT revision_id, course_id FROM revisions WHERE request_id = ?").get(requestId);
      return row ? { ok: true, status: "staged", revision_id: String(row.revision_id), course_id: String(row.course_id) } : null;
    });
  }

  private summaries(onlyPublished: boolean): RevisionSummary[] {
    return this.use<RevisionSummary[]>(false, [], (db) => db.prepare(`
      SELECT r.revision_id, r.course_id, r.title, r.created_at,
             (p.revision_id IS NOT NULL) AS published
      FROM revisions r LEFT JOIN published p ON p.revision_id = r.revision_id
      ${onlyPublished ? "WHERE p.revision_id IS NOT NULL" : ""} ORDER BY r.sequence DESC
    `).all().map((r) => ({ ...r, published: Boolean(r.published) }) as RevisionSummary));
  }
  listDrafts() { return this.summaries(false); }
  listPublished() { return this.summaries(true); }

  private unpack(row: RevisionRow | undefined) {
    if (!row) return null;
    return { revision_id: row.revision_id, course_id: row.course_id, title: row.title, created_at: row.created_at, bundle: JSON.parse(row.body) as ClassroomBundle };
  }
  getRevision(revisionId: string) {
    return this.use<ReturnType<ClassroomStore["unpack"]>>(false, null, (db) =>
      this.unpack(db.prepare("SELECT * FROM revisions WHERE revision_id = ?").get(revisionId) as unknown as RevisionRow | undefined));
  }
  getPublished(courseId: string) {
    return this.use<ReturnType<ClassroomStore["unpack"]>>(false, null, (db) =>
      this.unpack(db.prepare("SELECT r.* FROM published p JOIN revisions r ON r.revision_id = p.revision_id WHERE p.course_id = ?").get(courseId) as unknown as RevisionRow | undefined));
  }

  private makeCurrent(revisionId: string, restore: boolean) {
    if (!existsSync(this.path)) throw new BrainError("NOT_FOUND", "Unknown revision");
    return this.use(true, { revision_id: revisionId }, (db) => {
      const row = db.prepare("SELECT course_id, sequence FROM revisions WHERE revision_id = ?").get(revisionId);
      if (!row) throw new BrainError("NOT_FOUND", "Unknown revision");
      if (restore) {
        if (!db.prepare("SELECT 1 FROM history WHERE revision_id = ?").get(revisionId)) throw new BrainError("RULE", "Only a previously published revision can be restored");
      } else {
        const latest = db.prepare("SELECT sequence FROM revisions WHERE course_id = ? ORDER BY sequence DESC LIMIT 1").get(String(row.course_id));
        if (latest?.sequence !== row.sequence) throw new BrainError("CONFLICT", "Review the latest draft before publishing");
      }
      db.prepare("INSERT OR IGNORE INTO history VALUES (?)").run(revisionId);
      db.prepare("INSERT INTO published VALUES (?,?) ON CONFLICT(course_id) DO UPDATE SET revision_id=excluded.revision_id").run(String(row.course_id), revisionId);
      db.prepare("INSERT INTO journal VALUES (?,?,?)").run(now(), restore ? "restore" : "publish", revisionId);
      return { revision_id: revisionId };
    });
  }
  publish(revisionId: string) { return this.makeCurrent(revisionId, false); }
  restore(revisionId: string) { return this.makeCurrent(revisionId, true); }

  recordAttempt(input: { attempt_id: string; revision_id: string; lesson_id: string; question_id: string; answer: string | number[] }) {
    const rev = this.getRevision(input.revision_id);
    const q = rev?.bundle.lessons.find((l) => l.id === input.lesson_id)?.questions.find((x) => x.id === input.question_id);
    if (!q) throw new BrainError("NOT_FOUND", "Unknown question");
    if (!/^[a-zA-Z0-9_-]{6,96}$/.test(input.attempt_id)) throw new BrainError("VALIDATION", "Invalid attempt ID");
    let score: number | null = null;
    let answer: string;
    if (q.type === "explain") {
      if (typeof input.answer !== "string" || !input.answer.trim() || input.answer.length > 4000) throw new BrainError("VALIDATION", "Enter a short explanation");
      answer = input.answer.trim();
    } else {
      if (!Array.isArray(input.answer) || !input.answer.length || input.answer.length > q.choices.length ||
        input.answer.some((x) => !Number.isInteger(x) || x < 0 || x >= q.choices.length)) throw new BrainError("VALIDATION", "Pick valid choice indexes");
      const picked = [...new Set(input.answer)].sort((a, b) => a - b);
      answer = JSON.stringify(picked);
      score = Number(picked.length === q.correct.length && q.correct.every((x) => picked.includes(x)));
    }
    return this.use(true, { score }, (db) => {
      if (!db.prepare("SELECT 1 FROM history WHERE revision_id = ?").get(input.revision_id))
        throw new BrainError("RULE", "Only published revisions accept attempts");
      const existing = db.prepare("SELECT revision_id, lesson_id, question_id, answer FROM attempts WHERE attempt_id = ?").get(input.attempt_id);
      if (existing && (existing.revision_id !== input.revision_id || existing.lesson_id !== input.lesson_id ||
        existing.question_id !== input.question_id || existing.answer !== answer)) throw new BrainError("CONFLICT", "Attempt ID belongs to another answer");
      if (!existing) db.prepare("INSERT INTO attempts VALUES (?,?,?,?,?,?,?,?)").run(input.attempt_id, input.revision_id, input.lesson_id, input.question_id, hash(canonical(q)), answer, score, now());
      return { score };
    });
  }
  listAttempts(revisionId: string) {
    return this.use<AttemptRow[]>(false, [], (db) => db.prepare("SELECT attempt_id, revision_id, lesson_id, question_id, answer, score, created_at FROM attempts WHERE revision_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 100").all(revisionId) as unknown as AttemptRow[]);
  }
}
