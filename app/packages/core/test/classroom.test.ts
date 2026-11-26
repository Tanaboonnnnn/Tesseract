import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { ClassroomStore } from "../src/classroom.ts";

const bundle = (title = "Synthetic fixture") => ({
  schema_version: 1, course_id: "synthetic-only", title, language: "th",
  sources: [{ id: "source-one", title: "Test reference", url: "https://example.com/reference", accessed_on: "2026-11-25", rights: "reference-only", summary: "Schema exercise; no materials are imported." }],
  lessons: [{ id: "lesson-one", title, objective: "Exercise test boundaries.", source_ids: ["source-one"], blocks: [{ type: "text", markdown: "Synthetic content for tests." }],
    questions: [{ id: "question-one", type: "explain", prompt: "Explain the result.", rubric: ["Names the cause"], model_answer: "Synthetic model answer." }] }],
});

let dir: string;
let store: ClassroomStore;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tesseract-classroom-"));
  store = new ClassroomStore(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

it("starts empty and reads do not create a persistent database", () => {
  expect(store.listPublished()).toEqual([]);
  expect(store.listDrafts()).toEqual([]);
  expect(existsSync(join(dir, ".classroom"))).toBe(false);
});

it("returns an existing receipt for exact retries, without inserting a second draft", () => {
  const first = store.submit({ request_id: "trial-01", bundle: bundle() });
  expect(first).toMatchObject({ ok: true, status: "staged" });
  expect(store.submit({ request_id: "trial-01", bundle: bundle() })).toEqual(first);
  expect(store.submit({ request_id: "trial-01", bundle: bundle("changed") })).toMatchObject({ ok: false, issues: [{ code: "REQUEST_CONFLICT" }] });
  expect(store.listDrafts()).toHaveLength(1);
  expect(store.listPublished()).toEqual([]);
});

it("rejects unsafe content and broken references without writing anything", () => {
  const unsafe = structuredClone(bundle());
  unsafe.lessons[0]!.blocks[0]!.markdown = "<script>alert(1)</script>";
  unsafe.lessons[0]!.source_ids = ["missing"];
  expect(store.submit({ request_id: "trial-bad", bundle: unsafe })).toMatchObject({ ok: false });
  expect(store.listDrafts()).toEqual([]);
  expect(existsSync(join(dir, ".classroom"))).toBe(false);
});

it("publishes and rolls back a revision, preserving attempts on the original", () => {
  const first = store.submit({ request_id: "trial-01", bundle: bundle() });
  if (!first.ok) throw new Error("first fixture failed");
  store.publish(first.revision_id);
  store.recordAttempt({ attempt_id: "attempt-01", revision_id: first.revision_id, lesson_id: "lesson-one", question_id: "question-one", answer: "My evidence" });
  const second = store.submit({ request_id: "trial-02", base_revision: first.revision_id, bundle: bundle("Updated synthetic fixture") });
  if (!second.ok) throw new Error("second fixture failed");
  expect(store.submit({ request_id: "trial-03", base_revision: first.revision_id, bundle: bundle("Stale write") })).toMatchObject({ ok: false, issues: [{ code: "STALE_REVISION" }] });
  store.publish(second.revision_id);
  expect(store.listPublished()[0]).toMatchObject({ revision_id: second.revision_id });
  expect(store.listAttempts(second.revision_id)).toEqual([]);
  expect(store.listAttempts(first.revision_id)[0]).toMatchObject({ answer: "My evidence", score: null });
  store.restore(first.revision_id);
  expect(store.getPublished("synthetic-only")?.bundle).toMatchObject(bundle());
});

it("accepts explicit inline layout without changing courses that omit it", () => {
  const original=bundle();
  const edited={...original,course_id:"inline-example",lessons:original.lessons.map(l=>({...l,layout:"inline"}))};
  const added=store.submit({request_id:"inline-layout",bundle:edited});
  if(!added.ok) throw new Error(JSON.stringify(added));
  store.publish(added.revision_id);
  expect(store.getPublished("inline-example")?.bundle.lessons[0]?.layout).toBe("inline");
  expect(store.submit({request_id:"classic-layout",bundle:original})).toMatchObject({ok:true});
});

it("keeps v1 unchanged across an ISO v2 publish/restore and rejects unsupported stored revisions without switching",async()=>{
  const {isoFormat}=await import("../src/iso.ts");
  const a=store.submit({request_id:"iso-v1-original",bundle:bundle()});
  if(!a.ok)throw new Error(JSON.stringify(a.issues));
  store.publish(a.revision_id);
  const original=store.getRevision(a.revision_id);
  store.recordAttempt({attempt_id:"iso-v1-attempt",revision_id:a.revision_id,lesson_id:"lesson-one",question_id:"question-one",answer:"Original answer"});
  const raw=bundle("New ISO lesson");
  const v2={...raw,schema_version:2,lessons:raw.lessons.map(l=>({...l,blocks:[...l.blocks,{
    type:"visual",visual:{...isoFormat("network").example,id:"route"},fallback:"The request goes to the server.",
  }]}))};
  const b=store.submit({request_id:"iso-v2-revision",base_revision:a.revision_id,bundle:v2});
  if(!b.ok)throw new Error(JSON.stringify(b.issues));
  store.publish(b.revision_id);
  expect(store.getPublished(v2.course_id)?.bundle.schema_version).toBe(2);
  expect(store.getRevision(a.revision_id)).toEqual(original);
  store.restore(a.revision_id);
  expect(store.getPublished(v2.course_id)).toEqual(original);
  expect(store.listAttempts(a.revision_id)).toHaveLength(1);
  expect(store.listAttempts(b.revision_id)).toHaveLength(0);

  const db=new DatabaseSync(join(dir,".classroom","classroom.sqlite"));
  try {db.prepare("UPDATE revisions SET body = ? WHERE revision_id = ?").run(JSON.stringify({...v2,schema_version:99}),b.revision_id);}
  finally {db.close();}
  expect(()=>store.getRevision(b.revision_id)).toThrow(/unsupported/i);
  expect(()=>store.restore(b.revision_id)).toThrow(/unsupported/i);
  expect(store.getPublished(v2.course_id)).toEqual(original);
});
