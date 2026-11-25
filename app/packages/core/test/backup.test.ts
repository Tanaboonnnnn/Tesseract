import { afterEach, describe, expect, it } from "vitest";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/index.ts";
import { exportWorkspace, restoreWorkspace } from "../src/backup.ts";

const roots: string[] = [];
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "tesseract-backup-test-"));
  roots.push(dir);
  const src = join(dir, "source");
  mkdirSync(src);
  const store = new Store({ dataDir: src, agent: "test" });
  store.createProject({ id: "demo", title: "Demo" });
  store.addTask("demo", { title: "Verify it", status: "done" });
  store.createNote({ id: "memo", title: "A Thai note", type: "note", body: "ทดสอบข้อความ" });
  return { dir, src, store, archive: join(dir, "archive.json"), dst: join(dir, "restored") };
}
afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("offline workspace recovery", () => {
  it("round-trips managed data into a clean workspace without collecting settings, inbox or test SQLite", () => {
    const { src, store, archive, dst } = setup();
    mkdirSync(join(src, "inbox"));
    mkdirSync(join(src, ".classroom"));
    mkdirSync(join(src, "schedule"));
    for (const f of ["inbox/private.txt", ".classroom/classroom.sqlite", "schedule/google.yaml", "openai-tunnel-key", "notes/.env"]) {
      writeFileSync(join(src, f), "SYNTHETIC-SECRET");
    }
    expect(exportWorkspace(src, archive).files).toBeGreaterThanOrEqual(3);
    expect(readFileSync(archive, "utf8")).not.toContain("SYNTHETIC-SECRET");
    restoreWorkspace(archive, dst);
    const restored = new Store({ dataDir: dst, agent: "test" });
    expect(restored.getProject("demo")).toEqual(store.getProject("demo"));
    expect(restored.getNote("memo")).toEqual(store.getNote("memo"));
    expect(restored.listActivity()).toEqual([]);
    expect(existsSync(join(dst, "schedule/google.yaml"))).toBe(false);
  });

  it("restores scores, assessment history and learning progress from a copied workspace", () => {
    const { src, store, archive, dst } = setup();
    cpSync(join(import.meta.dirname, "../../../fixtures/sample-data"), src, { recursive: true });
    const quiz = "2026-11-23-kubernetes-deployments";
    const result = store.submitQuiz(quiz, [1, 1, 0, 1]);
    expect(result.score).toBe(100);
    exportWorkspace(src, archive);
    restoreWorkspace(archive, dst);
    const restored = new Store({ dataDir: dst, agent: "test" });
    expect(restored.getQuiz(quiz)).toEqual(store.getQuiz(quiz));
    expect(restored.getAssessment(quiz)).toEqual(store.getAssessment(quiz));
    expect(restored.getLearning("kubernetes")).toEqual(store.getLearning("kubernetes"));
    expect(restored.validateAll()).toEqual([]);
  });

  it("does not overwrite an existing archive or destination", () => {
    const { src, archive, dst } = setup();
    exportWorkspace(src, archive);
    const before = readFileSync(archive);
    expect(() => exportWorkspace(src, archive)).toThrow();
    expect(readFileSync(archive)).toEqual(before);
    mkdirSync(dst);
    writeFileSync(join(dst, "keep"), "original");
    expect(() => restoreWorkspace(archive, dst)).toThrow();
    expect(readFileSync(join(dst, "keep"), "utf8")).toBe("original");
  });

  it("rejects a damaged archive before creating a destination", () => {
    const { src, archive, dst } = setup();
    exportWorkspace(src, archive);
    const doc = JSON.parse(readFileSync(archive, "utf8"));
    doc.files[0].content += "modified";
    writeFileSync(archive, JSON.stringify(doc));
    expect(() => restoreWorkspace(archive, dst)).toThrow(/checksum/i);
    expect(existsSync(dst)).toBe(false);
  });

  it.each(["../escape.md", "notes/../escape.md", "notes/CON.md", "notes/a\\b.md", "schedule/google.yaml"])(
    "rejects a forbidden path even with a matching checksum: %s",
    (path) => {
      const { archive, dst } = setup();
      const files = [{ path, content: "synthetic" }];
      const checksum = createHash("sha256").update(JSON.stringify(files)).digest("hex");
      writeFileSync(archive, JSON.stringify({ format: "tesseract-workspace", version: 1, checksum, files }));
      expect(() => restoreWorkspace(archive, dst)).toThrow(/path/i);
      expect(existsSync(dst)).toBe(false);
    },
  );

  it.skipIf(process.platform === "win32")("rejects a link in a managed workspace path instead of reading its target", () => {
    const { src, dir, archive } = setup();
    const outside = join(dir, "outside.md");
    writeFileSync(outside, "SYNTHETIC-SECRET");
    symlinkSync(outside, join(src, "notes", "unsafe.md"));
    expect(() => exportWorkspace(src, archive)).toThrow(/link/i);
    expect(existsSync(archive)).toBe(false);
  });
});
