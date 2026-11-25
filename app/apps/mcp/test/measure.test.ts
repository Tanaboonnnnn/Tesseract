import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveDataDir, Store } from "@tesseract/core";
import { describe, expect, it } from "vitest";
import { measureTokens } from "../src/measure.ts";

describe("measureTokens", () => {
  it("measures the tool list and real read calls without writing anything", async () => {
    const dir = mkdtempSync(join(tmpdir(), "brain-measure-"));
    cpSync(resolveDataDir(), dir, { recursive: true });
    const store = new Store({ dataDir: dir, agent: "test", now: () => new Date(2026, 10, 23, 12) });
    const before = store.listActivity().length;

    const r = await measureTokens(store);

    expect(r.chars_per_token).toBe(4);
    expect(r.session.tools).toBeGreaterThan(40);
    expect(r.session.tool_list).toBeGreaterThan(1000);
    expect(r.session.biggest).toHaveLength(5);
    expect(r.calls.map((c) => c.tool)).toContain("get_overview");
    expect(r.calls.every((c) => c.tokens > 0)).toBe(true);
    expect(r.compare?.raw_files).toBeGreaterThan(0);
    expect(store.listActivity().length).toBe(before); // read-only
  });
});
