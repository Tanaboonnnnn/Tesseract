/** Offline backup of recognized workspace records. No OS/config directories or integration state. */
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { DATA_FOLDERS } from "./config.ts";
import { parseFrontmatter, parseYaml } from "./files.ts";
import { AdjustmentListSchema, AssessmentSchema, EventListSchema, GoalSchema, LearningSchema, NoteSchema, ProjectMapSchema, ProjectSchema, QuizSchema, TaskListSchema, TaxonomySchema, TopicListSchema } from "./schemas.ts";
import { VisualSchema } from "./visuals.ts";

const LIMIT = 32 * 1024 * 1024;
const FILE_LIMIT = 10_000;
const WORKSPACE_FOLDERS = [...DATA_FOLDERS.filter((f) => !f.startsWith(".") && f !== "inbox"), "schedule"];
const PORTABLE = /^(?!.*(?:^|\/)(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|\/|$))[a-z0-9.-]+(?:\/[a-z0-9.-]+)*$/;
const slug = "[a-z0-9]+(?:-[a-z0-9]+)*";
const MANAGED: [RegExp, z.ZodType][] = [
  [new RegExp(`^goals/${slug}\\.md$`), GoalSchema],
  [new RegExp(`^projects/${slug}/project\\.md$`), ProjectSchema],
  [new RegExp(`^projects/${slug}/tasks\\.yaml$`), TaskListSchema],
  [new RegExp(`^projects/${slug}/map\\.yaml$`), ProjectMapSchema],
  [new RegExp(`^learning/${slug}/learning\\.md$`), LearningSchema],
  [new RegExp(`^learning/${slug}/topics\\.yaml$`), TopicListSchema],
  [new RegExp(`^learning/${slug}/visuals/${slug}\\.yaml$`), VisualSchema],
  [/^skills\/taxonomy\.yaml$/, TaxonomySchema],
  [/^skills\/adjustments\.yaml$/, AdjustmentListSchema],
  [new RegExp(`^assessments/${slug}\\.md$`), AssessmentSchema],
  [new RegExp(`^notes/${slug}\\.md$`), NoteSchema],
  [new RegExp(`^quizzes/${slug}\\.yaml$`), QuizSchema],
  [/^schedule\/events\.yaml$/, EventListSchema],
];
const schemaFor = (path: string) => path.length <= 240 && PORTABLE.test(path) && !path.split("/").some((p) => p === "." || p === "..")
  ? MANAGED.find(([match]) => match.test(path))?.[1] : undefined;
const Bundle = z.strictObject({
  format: z.literal("tesseract-workspace"),
  version: z.literal(1),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  files: z.array(z.strictObject({ path: z.string(), content: z.string() })).max(FILE_LIMIT),
});
type Entry = z.infer<typeof Bundle>["files"][number];
const digest = (files: Entry[]) => createHash("sha256").update(JSON.stringify(files)).digest("hex");

function validate(files: Entry[]) {
  const seen = new Set<string>();
  for (const { path, content } of files) {
    const schema = schemaFor(path);
    if (!schema || seen.has(path)) throw new Error("Backup contains a duplicate or unsupported workspace path");
    seen.add(path);
    try {
      schema.parse(path.endsWith(".md") ? parseFrontmatter(content).data : parseYaml(content));
    } catch {
      throw new Error(`Backup contains an invalid workspace record: ${path}`);
    }
  }
}

/** Reject links and special files; bound reads both before and after opening. */
function readBounded(path: string, limit: number): Buffer {
  if (!lstatSync(path).isFile()) throw new Error("Backup inputs must be regular files, not links");
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.nlink !== 1) throw new Error("Backup inputs must not be linked files");
    if (info.size > limit) throw new Error("Backup exceeds the 32 MiB limit");
    const bytes = Buffer.alloc(info.size);
    let n = 0;
    while (n < bytes.length) {
      const count = readSync(fd, bytes, n, bytes.length - n, null);
      if (!count) break;
      n += count;
    }
    if (n !== info.size || readSync(fd, Buffer.alloc(1), 0, 1, null) !== 0 || fstatSync(fd).mtimeMs !== info.mtimeMs) {
      throw new Error("A backup input changed while being read. Stop the app and MCP, then retry.");
    }
    return bytes;
  } finally { closeSync(fd); }
}

function gather(root: string): Entry[] {
  if (!lstatSync(root).isDirectory()) throw new Error("Source should be a workspace directory, not a link");
  const entries: Entry[] = [];
  let remaining = LIMIT;
  function walk(parts: string[], depth: number) {
    const absolute = join(root, ...parts);
    let children;
    try {
      if (!lstatSync(absolute).isDirectory()) throw new Error("Workspace folders cannot be links or regular files");
      children = readdirSync(absolute, { withFileTypes: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT" && depth === 0) return;
      throw e;
    }
    for (const child of children) {
      const path = [...parts, child.name].join("/");
      if (depth === 0 && /^(projects|learning)$/.test(parts[0]!) && new RegExp(`^${slug}$`).test(child.name) && (child.isDirectory() || child.isSymbolicLink())) {
        walk([...parts, child.name], 1);
      } else if (parts[0] === "learning" && depth === 1 && child.name === "visuals") {
        walk([...parts, child.name], 2);
      } else if (schemaFor(path)) {
        if (entries.length >= FILE_LIMIT) throw new Error("Backup exceeds the 10,000-file limit");
        const bytes = readBounded(join(root, path), remaining);
        remaining -= bytes.length;
        const content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
        entries.push({ path, content });
      } else if (MANAGED.some(([re]) => re.test(path))) {
        throw new Error("Workspace has a path not supported across operating systems");
      }
    }
  }
  for (const folder of WORKSPACE_FOLDERS) walk([folder], 0);
  return entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

export function exportWorkspace(source: string, at: string): { files: number } {
  const files = gather(resolve(source));
  validate(files);
  const checksum = digest(files);
  const text = JSON.stringify({ format: "tesseract-workspace", version: 1, checksum, files }) + "\n";
  if (Buffer.byteLength(text) > LIMIT) throw new Error("Backup exceeds the 32 MiB limit");
  if (digest(gather(resolve(source))) !== checksum) throw new Error("Workspace changed during export. Stop the app and MCP, then retry.");
  const path = resolve(at);
  const fd = openSync(path, "wx", 0o600);
  try {
    try { writeFileSync(fd, text, "utf8"); fsyncSync(fd); }
    finally { closeSync(fd); }
  } catch (e) { rmSync(path, { force: true }); throw e; }
  return { files: files.length };
}

export function restoreWorkspace(archive: string, destination: string): { files: number } {
  const bundle = Bundle.safeParse(JSON.parse(readBounded(resolve(archive), LIMIT).toString("utf8")));
  if (!bundle.success) throw new Error("Invalid or unsupported Tesseract backup format");
  const { files, checksum } = bundle.data;
  if (digest(files) !== checksum) throw new Error("Backup checksum does not match");
  validate(files);
  const dest = resolve(destination);
  // Exclusive mkdir: never overwrite even an existing empty workspace.
  mkdirSync(dest, { mode: 0o700 });
  try {
    for (const folder of DATA_FOLDERS) mkdirSync(join(dest, folder), { mode: 0o700 });
    for (const { path, content } of files) {
      const file = join(dest, path);
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
      writeFileSync(file, content, { flag: "wx", mode: 0o600 });
    }
  } catch (e) { rmSync(dest, { recursive: true, force: true }); throw e; }
  return { files: files.length };
}
