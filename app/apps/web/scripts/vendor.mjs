// Copy the libraries that sandboxed HTML visuals may use into public/vendor (served offline by the app).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const out = join(import.meta.dirname, "..", "public", "vendor");
mkdirSync(out, { recursive: true });
const files = {
  "chart.umd.js": "chart.js/dist/chart.umd.min.js",
  "d3.min.js": "d3/dist/d3.min.js",
  "plotly-basic.min.js": "plotly.js-basic-dist-min/plotly-basic.min.js",
};
// workspaces hoist dependencies to app/node_modules; fall back to a local node_modules
const roots = [join(import.meta.dirname, "..", "..", "..", "node_modules"), join(import.meta.dirname, "..", "node_modules")];
for (const [name, mod] of Object.entries(files)) {
  const from = roots.map((r) => join(r, mod)).find((p) => existsSync(p));
  if (!from) throw new Error(`vendor: ${mod} not found (npm install)`);
  copyFileSync(from, join(out, name));
}
console.log(`vendor: ${Object.keys(files).join(", ")}`);
