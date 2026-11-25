import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Top-level folders inside the data directory (see SPEC.md §3). */
export const DATA_FOLDERS = [
  "goals",
  "projects",
  "learning",
  "skills",
  "assessments",
  "notes",
  "quizzes",
  "inbox",
  ".activity",
] as const;

const here = dirname(fileURLToPath(import.meta.url));
/** Repo-relative default: <repo>/data */
const DEFAULT_DATA_DIR = resolve(here, "../../../../data");

/**
 * Resolve the data directory.
 * Priority: explicit argument > BRAIN_DATA_DIR env var > <repo>/data.
 */
export function resolveDataDir(explicit?: string): string {
  const dir = resolve(explicit ?? process.env.BRAIN_DATA_DIR ?? DEFAULT_DATA_DIR);
  if (!existsSync(dir)) {
    throw new Error(`Data directory not found: ${dir}`);
  }
  return dir;
}
