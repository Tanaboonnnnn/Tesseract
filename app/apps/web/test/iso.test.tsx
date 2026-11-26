import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ISO_PACKS } from "../../../packages/core/src/iso-catalog.ts";
import { isoFormat, validateIso } from "../../../packages/core/src/iso.ts";
import { IsoArt, drawKeys, isoViewPlan } from "../src/components/visuals/IsoArt.tsx";
import { routeMotion } from "../src/components/visuals/iso-motion.ts";

describe("ISO artwork",()=>{
  test("both packs produce deterministic SVG and use only scoped tokens",()=>{
    for(const pack of Object.keys(ISO_PACKS)){
      expect(drawKeys(pack)).toEqual(Object.keys(ISO_PACKS[pack]!.components).sort());
      for(const sample of isoFormat(pack).examples ?? []){
        const checked=validateIso(sample);
        if(!checked.ok)throw new Error(JSON.stringify(checked.issues));
        const render=()=>renderToStaticMarkup(createElement(IsoArt,{checked,step:0,playing:false}));
        const base=render();
        expect(base).toContain("<svg");
        expect(base).toContain('class="iso-edge"');
        expect(base).not.toMatch(/<image|<foreignObject|<linearGradient|<script|https?:\/\//i);
        for(let i=0;i<20;i++) expect(render()).toBe(base);
      }
    }
  });
  test("light and dark use identical scene geometry and drawing code has no hex",()=>{
    const base=isoFormat("network").example!;
    const render=(theme_hint:"light"|"dark")=>{
      const checked=validateIso({...base,data:{...base.data,theme_hint}});
      if(!checked.ok)throw new Error(JSON.stringify(checked.issues));
      return renderToStaticMarkup(createElement(IsoArt,{checked,step:1,playing:false}));
    };
    expect(render("dark").replaceAll('data-iso-theme="dark"','data-iso-theme="light"')).toBe(render("light"));
    for(const f of ["IsoArt.tsx","iso-motion.ts","iso-scene.css","iso-parts.tsx"]){
      const code=readFileSync(new URL("../src/components/visuals/"+f,import.meta.url),"utf8");
      expect(code).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });
  test("route motion follows each polyline corner and changes transforms only",()=>{
    const frames=routeMotion([[0,0],[100,0],[100,20]]);
    expect(frames).toHaveLength(3);
    expect(frames[1]).toMatchObject({offset:100/120,transform:"translate(100px, 0px)"});
    expect(frames[2]?.transform).toBe("translate(100px, 20px)");
    for(const frame of frames)expect(Object.keys(frame).sort()).toEqual(["offset","transform"]);
  });
});

test("snapshots every authored component in all four states and checks actual cutaway geometry",async()=>{
  const {createHash}=await import("node:crypto");
  const {drawPart}=await import("../src/components/visuals/iso-parts.tsx");
  const checks:Record<string,string>={};
  for(const [pack,manifest] of Object.entries(ISO_PACKS)){
    for(const [component,p] of Object.entries(manifest.components)){
      for(const state of ["idle","active","fault","off"] as const){
        const markup=renderToStaticMarkup(createElement("svg",null,drawPart(pack,component,{at:[0,0,0],size:p.size,state})));
        expect(markup).toContain('class="iso-edge"');
        checks[pack+"/"+component+"/"+state]=createHash("sha256").update(markup).digest("hex").slice(0,16);
      }
      if(p.cutaway){
        const out=renderToStaticMarkup(createElement("svg",null,drawPart(pack,component,{at:[0,0,0],size:p.size,state:"idle",cutaway:true})));
        expect(out).toContain('data-cut-body=""');
        expect(out).toContain('data-cutaway-part=""');
      }
    }
  }
  expect(checks).toMatchSnapshot();
});

test("keeps a square fixed ground and identical framing across circuit steps",()=>{
  const checked=validateIso(isoFormat("physics").example);
  if(!checked.ok)throw new Error(JSON.stringify(checked.issues));
  const frame=(step:number)=>renderToStaticMarkup(createElement(IsoArt,{checked,step,playing:false}));
  expect(frame(0).match(/viewBox="[^"]+"/)?.[0]).toBe(frame(1).match(/viewBox="[^"]+"/)?.[0]);
  expect(frame(0).match(/data-iso-ground="[0-9]+"/)?.[0]).toBe(frame(1).match(/data-iso-ground="[0-9]+"/)?.[0]);
  expect(frame(0)).toContain('class="iso-ground"');
});

test("four camera positions turn the board and its routes without changing course state",()=>{
  const checked=validateIso(isoFormat("network").examples![0]);
  if(!checked.ok)throw new Error(JSON.stringify(checked.issues));
  const plan=isoViewPlan(checked);
  expect(plan.views[plan.home]?.layout.score).toBe(Math.min(...plan.views.map(v=>v.layout.score)));
  expect(renderToStaticMarkup(createElement(IsoArt,{checked,step:3,playing:false}))).toContain(`data-iso-view="${plan.home}"`);
  const views=([0,1,2,3] as const).map(turn=>renderToStaticMarkup(createElement(IsoArt,{checked,step:3,playing:false,turn})));
  const routes=views.map(svg=>svg.match(/data-id="to-b"[^>]*points="([^"]+)"/)?.[1]);
  expect(routes.every(Boolean)).toBe(true);
  expect(new Set(routes).size).toBe(4);
  for(const view of views){
    expect(view).toContain('data-active="true"');
    expect(view).toContain("Server B");
    expect(view).toContain('data-iso-packet="to-b"');
  }
});

test("keeps the callouts within reach of the components in the load balancer scene",()=>{
  const checked=validateIso(isoFormat("network").examples![0]);
  if(!checked.ok)throw new Error(JSON.stringify(checked.issues));
  const svg=renderToStaticMarkup(createElement(IsoArt,{checked,step:4,playing:false,turn:3}));
  const leaders=[...svg.matchAll(/<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)" class="iso-leader"/g)];
  expect(leaders).toHaveLength(4);
  expect(Math.max(...leaders.map(([,x,y,a,b])=>Math.hypot(+x!-+a!,+y!-+b!)))).toBeLessThan(110);
});

test("the compact view has a readable numbered key with the same labels and status",()=>{
  const result=validateIso(isoFormat("network").examples![0]);
  if(!result.ok)throw new Error(JSON.stringify(result.issues));
  const svg=renderToStaticMarkup(createElement(IsoArt,{checked:result,step:4,playing:false}));
  expect(svg).toContain('aria-label="Illustration key"');
  expect([...svg.matchAll(/data-iso-pin="([0-9]+)"/g)].map(m=>m[1])).toEqual(["1","2","3","4"]);
  expect(svg).toMatch(/<span>Server B<\/span><span class="iso-key-status">Fault<\/span>/);
});
