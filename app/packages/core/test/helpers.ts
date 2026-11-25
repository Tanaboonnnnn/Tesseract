import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveDataDir, Store, type StoreOptions } from "../src/index.ts";

/** Fixed "today" for all tests: 2026-11-23 (local time). */
export const NOW = () => new Date(2026, 10, 23, 12, 0, 0);

/** Fresh temp copy of the sample data — tests never write to the real data folder. */
export function tempDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "brain-test-"));
  cpSync(resolveDataDir(), dir, { recursive: true });
  return dir;
}

export function makeStore(options: Partial<StoreOptions> = {}): Store {
  return new Store({ dataDir: tempDataDir(), agent: "test", now: NOW, ...options });
}
