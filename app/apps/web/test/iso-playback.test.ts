import { expect, test } from "vitest";
import * as motion from "../src/components/visuals/iso-motion.ts";

const c = (id:string, from:string, to:string, kind="flow") => ({id, kind, from:{object:from}, to:{object:to}});
const paths = [c("in", "a", "switch"), c("out", "switch", "b"), c("branch", "switch", "c"), c("wire", "b", "c", "wire")];
const steps = ["in", "switch", "switch", "out", "switch", "branch", "wire"].map(id=>({highlight:[id]}));

test("holds the arriving packet through explanation beats and carries it into the next connected flow",()=>{
  expect(motion.isoFlowBeat(paths,steps,1)).toEqual({moving:[],parked:["in"]});
  expect(motion.isoFlowBeat(paths,steps,2)).toEqual({moving:[],parked:["in"]});
  expect(motion.isoFlowBeat(paths,steps,3)).toEqual({moving:[{id:"out",after:"in"}],parked:[]});
});

test("does not simulate a jump, a reverse trip or movement along an ordinary wire",()=>{
  expect(motion.isoFlowBeat(paths,steps,-1)).toEqual({moving:[],parked:[]});
  expect(motion.isoFlowBeat(paths,steps,4)).toEqual({moving:[],parked:[]});
  expect(motion.isoFlowBeat(paths,steps,5)).toEqual({moving:[{id:"branch"}],parked:[]});
  expect(motion.isoFlowBeat(paths,steps,6)).toEqual({moving:[],parked:[]});
});

test("does not infer where a packet came from when multiple paths converge",()=>{
  const branches=[...paths,c("in2","c","switch")];
  const beats=[{highlight:["in","in2"]},{highlight:["switch"]},{highlight:["out"]}];
  expect(motion.isoFlowBeat(branches,beats,1)).toEqual({moving:[],parked:["in","in2"]});
  expect(motion.isoFlowBeat(branches,beats,2)).toEqual({moving:[{id:"out"}],parked:[]});
});

test("uses most of a travel beat for motion and gives transfer beats a shorter hold",()=>{
  const travel=motion.isoBeatTime(motion.isoFlowBeat(paths,steps,0));
  const handoff=motion.isoBeatTime(motion.isoFlowBeat(paths,steps,1));
  expect(travel.duration-travel.travel).toBeLessThanOrEqual(450);
  expect(travel.travel).toBeGreaterThan(950);
  expect(handoff.duration).toBeLessThan(travel.duration);
});
