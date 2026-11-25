import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

type Chunk = { file: string; isEntry?: boolean; imports?: string[]; css?: string[] };
function count(dir: string) {
  const manifest = JSON.parse(readFileSync(join(dir, ".vite/manifest.json"), "utf8")) as Record<string, Chunk>;
  const chunks = new Set<string>(), js = new Set<string>(), css = new Set<string>();
  const visit = (key: string) => {
    if (chunks.has(key)) return;
    chunks.add(key);
    const c = manifest[key];
    if (!c) throw new Error("Missing manifest chunk: " + key);
    if (c.file.endsWith(".js")) js.add(c.file);
    c.css?.forEach((x) => css.add(x));
    c.imports?.forEach(visit);
  };
  Object.entries(manifest).filter(([,v]) => v.isEntry).forEach(([k]) => visit(k));
  if (!js.size) throw new Error("No app entry in Vite manifest");
  const size = (files: Set<string>) => [...files].reduce((sum, f) => {
    const file = readFileSync(join(dir, f)); sum.raw += file.length; sum.gzip += gzipSync(file).length; return sum;
  }, { raw: 0, gzip: 0 });
  return { js: size(js), css: size(css), initialJsChunks: js.size };
}
const dirs = process.argv.slice(2);
if (!dirs.length) throw new Error("Pass one or more Vite dist directories");
console.log(JSON.stringify(dirs.map((dir) => ({ directory: dir, ...count(resolve(dir)) })), null, 2));
