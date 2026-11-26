import { describe, expect, test } from "vitest";
import { validateIso, resolveIsoFrames, isoFormat } from "../src/iso.ts";
import type { IsoInput } from "../src/iso.ts";

const scene = (pack = "network"): IsoInput => structuredClone(isoFormat(pack).example!);
const problem = (mutate: (s: IsoInput) => void, rule: string) => {
  const input = scene();
  mutate(input);
  const out = validateIso(input);
  expect(out.ok).toBe(false);
  if (out.ok) throw new Error("Invalid example passed");
  expect(out.issues).toEqual(expect.arrayContaining([expect.objectContaining({
    rule, path: expect.any(String), message: expect.any(String), fix: expect.any(String),
  })]));
  expect(out.issues.find(i => i.rule === rule)?.fix.length).toBeGreaterThan(10);
};

describe("iso authoring contract", () => {
  test.each(["network","physics"])("%s examples use the same core validator", pack => {
    const guide = isoFormat(pack);
    expect(guide.components?.length).toBeGreaterThanOrEqual(6);
    expect(guide.examples?.length).toBe(2);
    for (const input of guide.examples ?? []) expect(validateIso(input)).toMatchObject({ok:true});
    expect(guide.availability).toBe("preview-only");
  });
  test("pack metadata is opt-in", () => {
    const guide = isoFormat();
    expect(guide.packs).toEqual(["network","physics"]);
    expect(guide.components).toBeUndefined();
  });
  test("unknown pack has a useful fix", () => {
    expect(isoFormat("biology")).toMatchObject({issue:{rule:"known-pack",path:"pack",fix:expect.any(String)}});
    problem(s => {s.data.pack="biology";},"known-pack");
  });
  test.each([
    ["known-component", (s: IsoInput) => {s.data.objects[0]!.component="lamp";}],
    ["grid-aligned", (s: IsoInput) => {s.data.objects[0]!.at[0]=.25;}],
    ["grid-aligned", (s: IsoInput) => {s.data.objects[0]!.size=[1,1,.25];}],
    ["no-overlap", (s: IsoInput) => {s.data.objects[1]!.at=[...s.data.objects[0]!.at];}],
    ["max-objects", (s: IsoInput) => {s.data.objects=Array.from({length:9},(_,i)=>({...s.data.objects[0]!,id:"obj-"+i,label:"One"}));}],
    ["max-changes-per-step", (s: IsoInput) => {s.steps[1]!.states={client:"off",balancer:"fault",server:"off"};s.steps[1]!.highlight=["outbound"]; }],
    ["anchors-exist", (s: IsoInput) => {s.data.connections![0]!.from.anchor="invalid";}],
    ["label-length", (s: IsoInput) => {s.data.objects[0]!.label="Too long: ".repeat(5);}],
    ["label-length", (s: IsoInput) => {s.data.objects[0]!.label="This is a sentence."; }],
    ["caption-length", (s: IsoInput) => {s.steps[0]!.text="x".repeat(121);}],
    ["margin", (s: IsoInput) => {s.data.objects[0]!.at[0]=200;}],
    ["step-refs", (s: IsoInput) => {s.steps[0]!.highlight=["missing"];}],
    ["single-accent", (s: IsoInput) => {s.steps[0]!.highlight=["inbound","outbound"];}],
    ["max-one-fault-step", (s: IsoInput) => {s.steps[0]!.states={client:"fault",server:"fault"};}],
    ["unique-id", (s: IsoInput) => {s.data.connections![0]!.id=s.data.objects[0]!.id;}],
    ["pack-connection", (s: IsoInput) => {s.data.connections![0]!.from.object="balancer";s.data.connections![0]!.from.anchor="in";}],
    ["cutaway-supported", (s: IsoInput) => {s.steps[0]!.cutaway="client";}],
  ] as const)("%s returns a path and concrete fix", (rule,mutate) => problem(mutate,rule));
  test("strict data refuses injected SVG/HTML/colors and huge UTF-8 before interpretation", () => {
    problem(s => {Object.assign(s.data.objects[0]!, {fill:"#abc", svg:"<svg/>"});},"shape");
    problem(s => {s.steps[0]!.text="<img src=outside>";},"text-only");
    problem(s => {s.title="ก".repeat(23000);},"payload-size");
  });
  test("build mode and backwards indexing are deterministic", () => {
    const s=scene(); s.step_mode="build";
    const result=validateIso(s);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const direct=resolveIsoFrames(result.value);
    expect(direct[0]!.visible).not.toContain("outbound");
    expect(direct[1]!.visible).toContain("outbound");
    for (const target of [1,0,1,0]) expect(resolveIsoFrames(result.value)[target]).toEqual(direct[target]);
  });
  test("a state patch does not reset in a later step; a repeated no-op is free",()=>{
    const s=scene(); s.steps[0]!.states={client:"off"}; s.steps[1]!.states={client:"off"};
    const r=validateIso(s); expect(r.ok).toBe(true);
    if(r.ok) expect(resolveIsoFrames(r.value).map(f=>f.states.client)).toEqual(["off","off"]);
  });
  test("derived viewBox reserves 10% per side and works for both packs", () => {
    for(const pack of ["network","physics"]){
      const r=validateIso(scene(pack));
      expect(r.ok).toBe(true);
      if(!r.ok) continue;
      const [x,y,w,h]=r.geometry.viewBox, [left,top,right,bottom]=r.geometry.contentBounds;
      expect((left-x)/w).toBeGreaterThanOrEqual(.0999);
      expect((top-y)/h).toBeGreaterThanOrEqual(.0999);
      expect((x+w-right)/w).toBeGreaterThanOrEqual(.0999);
      expect((y+h-bottom)/h).toBeGreaterThanOrEqual(.0999);
    }
  });
});
