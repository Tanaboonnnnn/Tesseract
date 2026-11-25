/**
 * First-run setup: creates <repo>/data from the sample data so the app has something to open.
 * Never touches an existing data folder. Usage: npm run setup
 */
import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const data = resolve(root, "data");
const sample = resolve(root, "app/fixtures/sample-data");

if (existsSync(data)) {
  console.log(`data/ already exists, left as is: ${data}`);
} else {
  cpSync(sample, data, { recursive: true });
  console.log(`Created ${data} from the sample data. Delete the sample projects and topics whenever you like.`);
}
