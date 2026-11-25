import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";

it("rejects restore preview without an explicit directory and with LAN/desktop options", () => {
  const data = mkdtempSync(join(tmpdir(), "tesseract-preview-test-"));
  const main = resolve(import.meta.dirname, "../src/main.ts");
  try {
    for (const args of [[], ["--data", data, "--lan"], ["--data", data, "--desktop"], ["--data", data, "--allow-host", "example.com"]]) {
      const r = spawnSync(process.execPath, [main, "--restore-preview", "--port", "0", ...args], {
        encoding: "utf8", timeout: 2_000, env: { ...process.env, BRAIN_DATA_DIR: data, HOME: data, USERPROFILE: data },
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/Restore preview requires explicit --data and loopback only/);
    }
  } finally { rmSync(data, { recursive: true, force: true }); }
});
