import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("3D primitives share the same clock and bindings as other panels", () => {
  const b=raw();
  const depth = {...b, panels:b.panels.map(p=>p.id==="fig"?{id:p.id,kind:"mesh",label:p.label}:p),
    entities:b.entities.map(e=>e.id==="dot"?{...e,kind:"circle",width:30,z:20}:e),
    tracks:[...b.tracks,{entity:"dot",property:"z",frames:[{at_ms:0,value:20},{at_ms:1000,value:60}]}]};
  assert.equal(sampleScene(SceneSchema.parse(depth),500).entities[0]?.z,40);
  const unsafe={...depth,entities:depth.entities.map(e=>e.id==="dot"?{...e,asset:"https://example.com/geometry"}:e)};
  assert.equal(SceneSchema.safeParse(unsafe).success,false);
  const wrong={...depth,tracks:depth.tracks.map(t=>t.property==="z"?{...t,entity:"tick"}:t)};
  assert.equal(SceneSchema.safeParse(wrong).success,false);
});

test("opt-in visual easing and step changes are deterministic; linear remains the default", () => {
  const b=raw();
  const s=SceneSchema.parse({...b,tracks:b.tracks.map((track,i)=>({...track,easing:i===0?"ease-in-out":"step"}))});
  assert.equal(sampleScene(s,250).entities[0]?.x,16.25);
  assert.equal(sampleScene(s,250).entities[1]?.x,10);
  assert.equal(sampleScene(s,1000).entities[1]?.x,40);
  assert.equal(sampleScene(SceneSchema.parse(b),250).entities[0]?.x,20);
});

const loadFixture = (name: string) => SceneSchema.parse(JSON.parse(
  readFileSync(new URL(`../../../fixtures/motion/${name}.json`, import.meta.url), "utf8"),
));

test("the load balancer dot follows its rendered route and never travels backwards while visible", () => {
  const scene=loadFixture("load-balancer");
  for (const [i, server] of ["a","b","c"].entries()) {
    const points=[[9,53],...scene.entities.find(e=>e.id===`route-${server}`)!.points!];
    const at=(ms:number)=>sampleScene(scene, i*2500+ms).entities.find(e=>e.id==="request")!;
    for(let t=0;t<2130;t+=25) {
      const point=at(t);
      assert.ok(point.opacity>0);
      assert.ok(at(t+1).x>=point.x);
      assert.ok(points.slice(1).some(([x,y],j)=>{
        const [a,b]=points[j]!;
        const u=(point.x-a!)/(x!-a!);
        return u>=-1e-5 && u<=1+1e-5 && Math.abs(point.y-(b!+(y!-b!)*u))<1e-4;
      }),`off drawn route ${server} at ${t} ms`);
    }
    assert.equal(at(2130).x,88);
    assert.equal(at(2400).opacity,0);
  }
});

test("the 3D example's marker moves in depth while the sphere stays fixed", () => {
  const scene=loadFixture("sphere");
  const at=(ms:number,id:string)=>sampleScene(scene,ms).entities.find(e=>e.id===id)!;
  assert.equal(at(3200,"marker").z,52);
  assert.equal(at(5600,"marker").z,90);
  assert.equal(at(8000,"marker").z,52);
  assert.deepEqual(at(3200,"sphere"),at(5600,"sphere"));
});
