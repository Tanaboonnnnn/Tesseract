import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DATA_FOLDERS, resolveDataDir } from "../src/index.ts";

describe("resolveDataDir", () => {
  it("finds the repo data directory by default", () => {
    const dir = resolveDataDir();
    for (const folder of DATA_FOLDERS) {
      expect(existsSync(join(dir, folder)), `missing ${folder}/`).toBe(true);
    }
  });

  it("throws on a missing directory", () => {
    expect(() => resolveDataDir("./does-not-exist")).toThrow(/not found/);
  });
});
