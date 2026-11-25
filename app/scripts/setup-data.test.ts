import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const setup = fileURLToPath(new URL("./setup-data.ts", import.meta.url));
const root = fileURLToPath(new URL("../../", import.meta.url));
const make = (data: string) => spawnSync(process.execPath, [setup, "--data", data], { cwd: root, encoding: "utf8" });

test("new installations start with no learning or project content", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "tesseract-setup-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const data = join(dir, "data");
  const result = make(data);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(data, "learning")), true, "honor an isolated --data directory");
  assert.deepEqual(readdirSync(join(data, "learning")), []);
  assert.deepEqual(readdirSync(join(data, "projects")), []);
});

test("setup leaves an existing workspace untouched", (t) => {
  const data = mkdtempSync(join(tmpdir(), "tesseract-existing-"));
  t.after(() => rmSync(data, { recursive: true, force: true }));
  mkdirSync(join(data, "notes"));
  writeFileSync(join(data, "notes", "sentinel.md"), "keep");
  assert.equal(make(data).status, 0);
  assert.deepEqual(readdirSync(data), ["notes"]);
  assert.equal(readFileSync(join(data, "notes", "sentinel.md"), "utf8"), "keep");
});
