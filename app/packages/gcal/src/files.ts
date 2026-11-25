/**
 * Local, private files for Google Calendar — outside the repo and data folder (never committed):
 *   ~/.panya/google-client.json   OAuth client downloaded from Google Cloud (Desktop app)
 *   ~/.panya/google-token.json    access + refresh token
 *   ~/.panya/google-sync.json     sync cursor and what was pushed (machine-local cache)
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_DIR = join(homedir(), ".panya");

export function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export function writeJson(path: string, data: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, path);
  try {
    chmodSync(path, 0o600);
  } catch {
    /* Windows: user profile ACLs apply */
  }
}

export function removeFile(path: string): void {
  rmSync(path, { force: true });
}

export interface GooglePaths {
  client: string;
  token: string;
  state: string;
}

export function googlePaths(dir = DEFAULT_DIR): GooglePaths {
  return {
    client: join(dir, "google-client.json"),
    token: join(dir, "google-token.json"),
    state: join(dir, "google-sync.json"),
  };
}
