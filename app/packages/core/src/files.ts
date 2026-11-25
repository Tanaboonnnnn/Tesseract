/** Low-level file helpers: atomic writes, frontmatter, YAML. */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import YAML from "yaml";

export function readText(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

/** Write via temp file + rename so readers never see half a file. `null` deletes. */
export function writeAtomic(path: string, content: string | null): void {
  if (content === null) {
    rmSync(path, { force: true });
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, path);
}

export function listFiles(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(ext))
    .map((e) => (ext ? e.name.slice(0, -ext.length) : e.name))
    .sort();
}

/** All files under a folder, as paths relative to it (forward slashes). */
export function listTree(dir: string, prefix = ""): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listTree(join(dir, e.name), `${prefix}${e.name}/`) : e.isFile() ? [`${prefix}${e.name}`] : [],
  );
}

/** Remove a folder only if no files are left in it (empty subfolders are fine). */
export function removeIfEmpty(dir: string): void {
  if (existsSync(dir) && listTree(dir).length === 0) rmSync(dir, { recursive: true, force: true });
}

export function listSubdirsWith(dir: string, marker: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, marker)))
    .map((e) => e.name)
    .sort();
}

export function fileInfo(path: string): { size: number; modified: Date } {
  const s = statSync(path);
  return { size: s.size, modified: s.mtime };
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/;

export function parseFrontmatter(text: string): { data: unknown; body: string } {
  const m = FRONTMATTER.exec(text);
  if (!m) throw new Error("missing YAML frontmatter (--- ... ---)");
  return { data: YAML.parse(m[1]!) ?? {}, body: (m[2] ?? "").trim() };
}

export function toMarkdown(data: object, body: string): string {
  return `---\n${YAML.stringify(data).trimEnd()}\n---\n${body.trim()}\n`;
}

export const parseYaml = (text: string): unknown => YAML.parse(text);
export const toYaml = (data: unknown): string => YAML.stringify(data);
