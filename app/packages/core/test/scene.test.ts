import { test } from "vitest";
import assert from "node:assert/strict";
import { SceneSchema } from "../src/scene.ts";
import { sampleScene } from "../src/scene-model.ts";

const raw = () => ({
  schema_version: 1, style: "minimal-technical", duration_ms: 2000,
  panels: [{ id:"fig", kind:"diagram", label:"Model" }, { id:"chart", kind:"plot", label:"Change", x_label:"Time (s)", y_label:"Value (cm)" }, { id:"math", kind:"inspect", label:"r = radius" }],
  entities: [{ id:"dot", panel:"fig", kind:"point", x:10, y:20, label:"Point" }, { id:"tick", panel:"chart", kind:"point", x:10, y:30, label:"Reading" }],
  beats: [{ id:"start", at_ms:0, label:"Start", text:"At rest" }, { id:"end", at_ms:1000, label:"End", text:"It moves" }],
  tracks: [{entity:"dot", property:"x", frames:[{at_ms:0,value:10},{at_ms:1000,value:50}]}, {entity:"tick", property:"x",frames:[{at_ms:0,value:10},{at_ms:1000,value:40}]}],
  controls: [{id:"input", label:"Position", min:0, max:100, initial:60, target:"tick", property:"y"}],
  bindings: [{id:"radius", panel:"math", term:"r", target_ids:["dot","tick"], explanation:"The radius, in centimetres."}],
});

test("one timeline samples two panels deterministically and input is clamped", () => {
  const s = SceneSchema.parse(raw());
  const mid = sampleScene(s, 500, {input: 130});
  assert.equal(mid.beat.id,"start");
  assert.equal(mid.entities[0]?.x,30);
  assert.equal(mid.entities[1]?.x,25);
  assert.equal(mid.entities[1]?.y,100);
  assert.equal(sampleScene(s,1500).beat.id,"end");
  assert.deepEqual(sampleScene(s,500,{input:130}),mid);
  assert.equal(sampleScene(s,NaN).timeMs,0);
  assert.equal(sampleScene(s,20000).timeMs,2000);
});

test("strict input refuses invalid references, time, duplicates and executable fields", () => {
  const b=raw();
  const invalid: unknown[] = [
    {...b, schema_version:2}, {...b, script:"not allowed"},
    {...b, panels:[{...b.panels[0], href:"https://example.com"}]},
    {...b, entities:[...b.entities,b.entities[0]]},
    {...b, entities:[{...b.entities[0],x:Infinity},b.entities[1]]},
    {...b, tracks:[{...b.tracks[0], entity:"missing"}]},
    {...b, tracks:[{...b.tracks[0], frames:[...b.tracks[0]!.frames].reverse()}]},
    {...b, tracks:[b.tracks[0],b.tracks[0]]},
    {...b, bindings:[{...b.bindings[0], target_ids:["missing"]}]},
    {...b, bindings:[{...b.bindings[0], panel:"fig"}]},
    {...b, controls:[{...b.controls[0],target:"dot",property:"x"}]},
    {...b, beats:[{...b.beats[0],at_ms:50},b.beats[1]]},
  ];
  for (const input of invalid) assert.equal(SceneSchema.safeParse(input).success,false);
});

test("inspect formulas bind only terms declared in that panel", () => {
  const scene = raw();
  const withFormula = (tex:string) => ({...scene,panels:scene.panels.map(p=>p.id==="math"?{...p,tex}:p)});
  assert.equal(SceneSchema.safeParse(withFormula(String.raw`x = \term{radius}{r}`)).success,true);
  assert.equal(SceneSchema.safeParse(withFormula(String.raw`x = \term{other}{r}`)).success,false);
  assert.equal(SceneSchema.safeParse(withFormula(String.raw`\href{https://example.com}{x}`)).success,false);
});
