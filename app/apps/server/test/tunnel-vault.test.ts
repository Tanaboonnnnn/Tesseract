import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { desktopTunnelVault } from "../src/tunnel-vault.ts";

it.runIf(process.platform === "win32")("protects a synthetic key with CurrentUser DPAPI and reads it back from a new vault", () => {
  const dir = mkdtempSync(join(tmpdir(), "tesseract-dpapi-test-"));
  const slot = randomUUID();
  const synthetic = "sk-test-tesseract-dpapi-fixture-not-a-real-key";
  try {
    const first = desktopTunnelVault(dir);
    first.save(slot, synthetic);
    expect(readFileSync(join(dir, `tunnel-key-${slot}.dpapi`), "utf8")).not.toContain(synthetic);
    const reopened = desktopTunnelVault(dir);
    expect(reopened.read(slot)).toBe(synthetic);
    reopened.remove(slot);
    expect(reopened.read(slot)).toBeNull();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 20_000);
