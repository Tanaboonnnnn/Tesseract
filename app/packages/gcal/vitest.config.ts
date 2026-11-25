import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Tests read a fixed copy of the sample data, never the user's real data/ folder.
export default defineConfig({
  test: { env: { BRAIN_DATA_DIR: resolve(import.meta.dirname, "../../fixtures/sample-data") } },
});
