/** First run: prepare empty data and bundled skill taxonomy. Never seed lessons or modify existing data. */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { DATA_FOLDERS } from "../packages/core/src/config.ts";

const root = resolve(import.meta.dirname, "../..");
const dataFlag = process.argv.indexOf("--data");
const explicit = dataFlag < 0 ? undefined : process.argv[dataFlag + 1];
if (dataFlag >= 0 && !explicit) throw new Error("--data requires a directory");
const data = resolve(explicit ?? process.env.BRAIN_DATA_DIR ?? resolve(root, "data"));
if (existsSync(data)) {
  console.log("Data directory already exists; left untouched.");
} else {
  mkdirSync(data, { recursive: true, mode: 0o700 });
  for (const folder of DATA_FOLDERS) mkdirSync(resolve(data, folder));
  copyFileSync(resolve(root, "app/fixtures/sample-data/skills/taxonomy.yaml"), resolve(data, "skills/taxonomy.yaml"));
  console.log("Initialized an empty workspace.");
}
