import { z } from "zod";

const id = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
const label = z.string().trim().min(1).max(100);
const description = z.string().trim().min(1).max(600);
const coordinate = z.number().finite().min(0).max(100);
const time = z.number().int().min(0).max(180_000);
const property = z.enum(["x", "y", "opacity"]);
const panel = z.discriminatedUnion("kind", [
  z.strictObject({ id, kind: z.literal("diagram"), label, projection: z.enum(["flat","isometric"]).optional() }),
  z.strictObject({ id, kind: z.literal("plot"), label, x_label: label, y_label: label }),
  z.strictObject({ id, kind: z.literal("inspect"), label, tex:z.string().min(1).max(400).optional() }),
]);
const entity = z.strictObject({
  id, panel: id, label,
  kind: z.enum(["point","circle","box","path","text"]),
  x: coordinate, y: coordinate,
  width: coordinate.optional(), height: coordinate.optional(),
  points: z.array(z.tuple([coordinate,coordinate])).min(2).max(100).optional(),
  tone: z.enum(["neutral","primary","secondary","caution"]).optional(),
  opacity: coordinate.optional(),
});
export const SceneSchema = z.strictObject({
  schema_version: z.literal(1), style: z.literal("minimal-technical"),
  duration_ms: time.min(1), loop: z.boolean().optional(),
  panels: z.array(panel).min(1).max(6),
  entities: z.array(entity).min(1).max(100),
  beats: z.array(z.strictObject({ id, at_ms: time, label, text: description, focus: z.array(id).max(12).optional() })).min(1).max(30),
  tracks: z.array(z.strictObject({
    entity: id, property,
    frames: z.array(z.strictObject({ at_ms: time, value: coordinate })).min(1).max(100),
  })).max(100).optional(),
  controls: z.array(z.strictObject({
    id, label, min: coordinate, max: coordinate, initial: coordinate, target: id, property,
  })).max(6).optional(),
  bindings: z.array(z.strictObject({
    id, panel: id, term: label, target_ids: z.array(id).min(1).max(12), explanation: description,
  })).max(24).optional(),
}).superRefine((s, ctx) => {
  const issue = (path: (string|number)[], message: string) => ctx.addIssue({code:"custom", path, message});
  if (new TextEncoder().encode(JSON.stringify(s)).byteLength > 256 * 1024) issue([], "Scene exceeds 256 KiB");
  for (const field of ["panels","entities","beats","controls","bindings"] as const) {
    const seen = new Set<string>();
    for (const [i, item] of (s[field] ?? []).entries()) {
      if (seen.has(item.id)) issue([field,i,"id"], "Duplicate ID");
      seen.add(item.id);
    }
  }
  const panels = new Map(s.panels.map(p => [p.id,p.kind]));
  const entities = new Set(s.entities.map(e => e.id));
  s.entities.forEach((e,i) => {
    const target = panels.get(e.panel);
    if (!target || target === "inspect") issue(["entities",i,"panel"], "Choose a diagram or plot panel");
    if (e.kind === "path" && !e.points) issue(["entities",i,"points"], "A path needs points");
  });
  const checkOrder = (current: number, previous: number|undefined, path: (string|number)[]) => {
    if (current > s.duration_ms || (previous !== undefined && current <= previous)) issue(path, "Times must strictly increase and stay within duration");
  };
  if (s.beats[0]!.at_ms !== 0) issue(["beats",0,"at_ms"], "Start the first beat at zero");
  s.beats.forEach((b,i) => {
    checkOrder(b.at_ms,s.beats[i-1]?.at_ms,["beats",i,"at_ms"]);
    if (b.focus?.some(target => !entities.has(target))) issue(["beats",i,"focus"], "Unknown focus target");
  });
  const destinations = new Set<string>();
  const checkTarget = (target:string, prop:string, path:(string|number)[]) => {
    if (!entities.has(target)) issue(path, "Unknown target");
    const key = target + ":" + prop;
    if (destinations.has(key)) issue(path, "Only one track or control may drive a property");
    destinations.add(key);
  };
  let total = 0;
  (s.tracks ?? []).forEach((t,i) => {
    checkTarget(t.entity,t.property,["tracks",i,"entity"]);
    total += t.frames.length;
    t.frames.forEach((f,j) => checkOrder(f.at_ms,t.frames[j-1]?.at_ms,["tracks",i,"frames",j,"at_ms"]));
  });
  if (total > 500) issue(["tracks"],"Use at most 500 keyframes");
  (s.controls ?? []).forEach((c,i) => {
    checkTarget(c.target,c.property,["controls",i,"target"]);
    if (c.min >= c.max || c.initial < c.min || c.initial > c.max) issue(["controls",i,"initial"], "Need min < max and initial within bounds");
  });
  s.panels.forEach((p,i)=>{
    if(p.kind!=="inspect" || !p.tex) return;
    const terms = new Set((s.bindings ?? []).filter(b=>b.panel===p.id).map(b=>b.id));
    const used = Array.from(p.tex.matchAll(/\\term\{([a-z][a-z0-9-]{0,39})\}\{/g),m=>m[1]!);
    if (/\\(?:href|url|html\w*|includegraphics|class|style|cssId|def|gdef|edef|newcommand|renewcommand|let|require)\b/i.test(p.tex) ||
        (p.tex.match(/\\term\b/g)?.length ?? 0)!==used.length || used.some(term=>!terms.has(term))) issue(["panels",i,"tex"],"Use math only, with declared inspect term IDs");
  });
  (s.bindings ?? []).forEach((b,i) => {
    if (panels.get(b.panel) !== "inspect") issue(["bindings",i,"panel"], "Choose an inspect panel");
    if (new Set(b.target_ids).size !== b.target_ids.length || b.target_ids.some(target => !entities.has(target))) issue(["bindings",i,"target_ids"], "Use distinct existing scene entity IDs");
  });
});
export type Scene = z.output<typeof SceneSchema>;
