import { z } from "zod";
import { ISO_PACKS, getIsoPack, getIsoPart } from "./iso-catalog.ts";
import type { Vec } from "./iso-catalog.ts";

export const ISO_BYTES = 64_000;
const LIMIT = {objects:12,labeled:8,connections:24,waypoints:6,steps:8,changes:3,label:24,caption:120} as const;
const Id = z.string().max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const V = z.tuple([z.number(),z.number(),z.number()]);
const State = z.enum(["idle","active","fault","off"]);
const End = z.strictObject({object:Id,anchor:Id});
const step = z.strictObject({
  text:z.string().trim().min(1).max(600),
  highlight:z.array(Id).max(LIMIT.objects+LIMIT.connections).default([]),
  states:z.record(Id,State).optional(),
  cutaway:Id.nullable().optional(),
});
export type IsoState = z.output<typeof State>;
export const IsoInputShape = z.strictObject({
  type:z.literal("iso"), id:Id.optional(), title:z.string().trim().min(1).max(100),
  topic:Id.nullable().optional(), step_mode:z.enum(["highlight","build"]).default("highlight"),
  data:z.strictObject({
    pack:Id, theme_hint:z.enum(["light","dark","auto"]).default("auto"),
    objects:z.array(z.strictObject({
      id:Id, component:Id, at:V, size:V.optional(), label:z.string().trim().min(1).max(160).optional(), state:State.default("idle"),
    })).min(1).max(LIMIT.objects),
    connections:z.array(z.strictObject({
      id:Id, kind:z.enum(["wire","flow"]), from:End, to:End, via:z.array(V).max(LIMIT.waypoints).optional(),
    })).max(LIMIT.connections).default([]),
  }),
  steps:z.array(step).min(2).max(LIMIT.steps),
});
export type IsoInput=z.input<typeof IsoInputShape>;
type Iso=z.output<typeof IsoInputShape>;
type Obj=Iso["data"]["objects"][number];
type Conn=Iso["data"]["connections"][number];
export type IsoIssue={rule:string;path:string;message:string;fix:string};
type Report=(rule:string,path:string,message:string,fix:string)=>void;
type Bounds=[number,number,number,number];
export type IsoFrame={visible:string[];highlight:string[];states:Readonly<Record<string,IsoState>>;cutaway:string|null;changes:number};
const ord=(a:string,b:string)=>a<b?-1:a>b?1:0;
const count=(s:string)=>Array.from(s).length;
const half=(n:number)=>Number.isInteger(n*2);
const plain=(s:string)=>!/[<>\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(s)&&!/(?:https?:\/\/|(?:javascript|data):|!\[)/iu.test(s);
const spatial=(p:Vec)=>p[0]>=-16&&p[0]<=16&&p[1]>=-16&&p[1]<=16&&p[2]>=0&&p[2]<=12;
const add=(a:Vec,b:Vec):Vec=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const ZERO:Vec=[0,0,0];

function fitsPayload(value:unknown) {
  let budget=1600, units=0;
  const walk=(x:unknown,depth:number):boolean=>{
    if(--budget<0||depth>14)return false;
    if(typeof x==="string"){units+=x.length;return units<=ISO_BYTES;}
    if(x===null||typeof x==="boolean"||typeof x==="number"||x===undefined)return true;
    if(typeof x!=="object")return false;
    if(!Array.isArray(x)&&Object.getPrototypeOf(x)!==Object.prototype&&Object.getPrototypeOf(x)!==null)return false;
    for(const key in x){
      if(!Object.hasOwn(x,key))continue;
      units+=key.length;
      if(units>ISO_BYTES||!walk((x as Record<string,unknown>)[key],depth+1))return false;
    }
    return true;
  };
  try {return walk(value,0)&&new TextEncoder().encode(JSON.stringify(value)).byteLength<=ISO_BYTES;}
  catch{return false;}
}
const stateAt=(states:Map<string,IsoState>)=>Object.fromEntries([...states].sort(([a],[b])=>ord(a,b)));
const symmetric=(a:ReadonlySet<string>,b:ReadonlySet<string>)=>[...a].filter(v=>!b.has(v)).length+[...b].filter(v=>!a.has(v)).length;

function framesOf(value:Iso):IsoFrame[]{
  const {objects,connections}=value.data;
  const states=new Map(objects.map(o=>[o.id,o.state]));
  const all=[...objects.map(o=>o.id),...connections.map(c=>c.id)].sort(ord);
  const inBuild=new Set(value.steps.flatMap(s=>s.highlight));
  const revealed=new Set<string>();
  let lastHighlight=new Set<string>(), cutaway:string|null=null;
  return value.steps.map(s=>{
    const highlight=new Set(s.highlight);
    let changes=symmetric(highlight,lastHighlight);
    for(const id of highlight)revealed.add(id);
    for(const [id,next] of Object.entries(s.states??{})){
      if(states.has(id)&&states.get(id)!==next){changes++;states.set(id,next);}
    }
    if(s.cutaway!==undefined&&s.cutaway!==cutaway){
      changes+=(cutaway?1:0)+(s.cutaway?1:0);
      cutaway=s.cutaway;
    }
    const visible=all.filter(id=>value.step_mode!=="build"||!inBuild.has(id)||revealed.has(id));
    const visibleSet=new Set(visible);
    for(const c of connections)if(!visibleSet.has(c.from.object)||!visibleSet.has(c.to.object))visibleSet.delete(c.id);
    lastHighlight=highlight;
    return {visible:visible.filter(id=>visibleSet.has(id)),highlight:[...highlight].sort(ord),states:stateAt(states),cutaway,changes};
  });
}
export const resolveIsoFrames=(value:Iso):IsoFrame[]=>framesOf(value);

function checkGrid(p:Vec,path:string,report:Report){
  if(!p.every(half))report("grid-aligned",path,"Use half-unit coordinates.","Round each value to a whole number or a multiple of 0.5.");
}
function checkMargin(p:Vec,path:string,report:Report,size=false){
  if(size?p.some(n=>n<.5||n>8):!spatial(p)){
    report("margin",path,"This value is outside the supported drawing area.",size?"Use dimensions from 0.5 through 8 units.":"Keep X and Y between -16 and 16, and Z between 0 and 12.");
  }
}
function shortLabel(s:string,path:string,report:Report){
  if(count(s)>LIMIT.label||/[.!?。！？]$/u.test(s))
    report("label-length",path,"An object label must be a short noun, not a sentence.","Use a noun phrase of at most 24 characters, e.g. “Server A”; move explanations into the caption.");
  if(!plain(s))report("text-only",path,"Object labels are plain text.","Remove markup, URLs and hidden control characters.");
}
function shortCaption(s:string,path:string,report:Report){
  if(count(s)>LIMIT.caption||/[\r\n]/u.test(s))report("caption-length",path,"A caption must fit on one source line of at most 120 characters.","Shorten the caption to a single sentence or phrase within 120 characters.");
  if(!plain(s))report("text-only",path,"Captions are plain text.","Remove markup, URLs and hidden control characters.");
}
const overlaps=(a:Vec,as:Vec,b:Vec,bs:Vec)=>a.every((x,i)=>x<b[i]!+bs[i]!&&x+as[i]!>b[i]!);
function checkOverlap(a:Obj,size:Vec,b:Obj,bSize:Vec,path:string,report:Report) {
  if(overlaps(a.at,size,b.at,bSize))report("no-overlap",path,"Solid overlaps "+b.id+".","Move a solid by half-grid units until their volumes no longer intersect; touching faces is allowed.");
}
function checkMaxObjects(objects:Obj[],report:Report) {
  if(objects.filter(o=>o.label).length>LIMIT.labeled)
    report("max-objects","data.objects","More than eight objects are labeled.","Keep the eight labels that teach the idea, or split this into two scenes.");
}
function checkComponent(pack:string,o:Obj,path:string,report:Report) {
  if(!getIsoPart(pack,o.component))report("known-component",path,"Component does not belong to this pack.","Choose a component listed for this pack by visual_formats.");
}
function checkObjects(value:Iso,report:Report){
  const {objects,connections,pack}=value.data;
  const byId=new Map<string,Obj>(), ids=new Set<string>();
  const addId=(id:string,path:string)=>{
    if(ids.has(id))report("unique-id",path,"An element ID is repeated.","Give each object and connection a distinct kebab-case ID.");
    ids.add(id);
  };
  checkMaxObjects(objects,report);
  objects.forEach((o,i)=>{
    const path="data.objects."+i;
    addId(o.id,path+".id"); byId.set(o.id,o);
    checkComponent(pack,o,path+".component",report);
    checkGrid(o.at,path+".at",report); checkMargin(o.at,path+".at",report);
    if(o.size){checkGrid(o.size,path+".size",report);checkMargin(o.size,path+".size",report,true);}
    if(o.label)shortLabel(o.label,path+".label",report);
    const size=o.size??getIsoPart(pack,o.component)?.size;
    if(!size)return;
    if(!spatial(add(o.at,size)))report("margin",path+".at","Part extends outside the safe drawing area.","Move the part toward the center or choose a smaller allowed size.");
    for(const p of objects.slice(0,i)){
      const psize=p.size??getIsoPart(pack,p.component)?.size;
      if(psize)checkOverlap(o,size,p,psize,path+".at",report);
    }
  });
  connections.forEach((c,i)=>addId(c.id,"data.connections."+i+".id"));
  return {byId,ids};
}
function portsAndPath(value:Iso,c:Conn,i:number,byId:Map<string,Obj>,report:Report){
  const base="data.connections."+i, pack=getIsoPack(value.data.pack);
  if(pack&&!pack.connections.includes(c.kind))report("pack-connection",base+".kind","This connection kind is not supported by the pack.","Use "+pack.connections.join(" or ")+" in this pack.");
  const route=[c.from,c.to].map((end,n)=>{
    const o=byId.get(end.object);
    const part=o&&getIsoPart(value.data.pack,o.component);
    const p=part?.anchors&&Object.hasOwn(part.anchors,end.anchor)?part.anchors[end.anchor]:undefined;
    if(!o||!part||!p){
      report("anchors-exist",base+(n?".to":".from"),"Endpoint does not resolve to a named anchor.","Choose an existing object ID and a named anchor listed for its component.");
      return null;
    }
    const size=o.size??part.size;
    return {point:add(o.at,[size[0]*p.offset[0],size[1]*p.offset[1],size[2]*p.offset[2]]),role:p.role};
  });
  const [from,to]=route;
  c.via?.forEach((p,k)=>{
    checkGrid(p,base+".via."+k,report);checkMargin(p,base+".via."+k,report);
  });
  if(!from||!to)return null;
  if(c.from.object===c.to.object||(c.kind==="flow"&&pack?.directional&&(from.role!=="out"||to.role!=="in")))
    report("pack-connection",base,"A flow must connect valid ports on distinct parts.","For network flow connect an out port to an in port on a different object; avoid self-connections.");
  const points=[from.point,...(c.via??[]),to.point];
  if(points.some((p,k)=>k>0&&p.every((v,d)=>v===points[k-1]![d])))report("distinct-route-points",base+".via","Two consecutive route points coincide.","Drop the repeated waypoint or select a noncoincident anchor.");
  return points;
}
function checkStepRefs(value:Iso,s:Iso["steps"][number],f:IsoFrame,refs:ReturnType<typeof checkObjects>,path:string,report:Report){
  const {byId,ids}=refs,seen=new Set<string>();
  s.highlight.forEach((id,j)=>{
    if(!ids.has(id)||seen.has(id))report("step-refs",path+".highlight."+j,"Missing or duplicate highlight target.","List each existing object or connection ID at most once.");
    seen.add(id);
  });
  for(const id of Object.keys(s.states??{}))if(!byId.has(id)||!f.visible.includes(id))
    report("step-refs",path+".states."+id,"State target must be a visible object.","Target an existing visible object or reveal it in this step before changing its state.");
  if(s.cutaway){
    const o=byId.get(s.cutaway);
    if(!o||!f.visible.includes(s.cutaway))report("step-refs",path+".cutaway","Cutaway target must be a visible object.","Target a visible object ID from the selected pack.");
    else if(!getIsoPart(value.data.pack,o.component)?.cutaway)report("cutaway-supported",path+".cutaway","This component has no authored cutaway.","Choose a component marked cutaway in this pack, or omit cutaway.");
  }
  if(s.highlight.some(id=>ids.has(id)&&!f.visible.includes(id)))report("step-refs",path+".highlight","A highlighted connection is not visible yet.","Reveal both endpoint objects first, then highlight the connection.");
}
function checkChanges(f:IsoFrame,path:string,report:Report){
  if(f.changes>LIMIT.changes)report("max-changes-per-step",path,"More than three changes from the preceding frame.","Split focus, state or cutaway changes into more steps; unchanged values do not count.");
}
function checkAccent(f:IsoFrame,flows:ReadonlySet<string>,path:string,report:Report){
  const active=new Set([...f.visible.filter(id=>Object.hasOwn(f.states,id)&&f.states[id]==="active"),...f.highlight.filter(id=>flows.has(id)&&f.visible.includes(id))]);
  if(active.size>1)report("single-accent",path,"More than one active accent target is visible.","Set the previous object to idle or highlight only one active flow; fault red is a separate semantic status.");
}
function checkFaults(value:Iso,frames:IsoFrame[],report:Report){
  const faults=(states:Readonly<Record<string,IsoState>>)=>Object.entries(states).filter(([,state])=>state==="fault").map(([id])=>id);
  let previous=faults(Object.fromEntries(value.data.objects.map(o=>[o.id,o.state]))), introduced=previous.length;
  if(introduced>1)report("max-one-fault-step","data.objects","More than one initial fault.","Start with at most one faulty object.");
  frames.forEach((f,i)=>{
    const next=faults(f.states);
    introduced+=next.filter(id=>!previous.includes(id)).length;
    if(introduced>1||next.length>1)report("max-one-fault-step","steps."+i,"The scene introduces more than one fault.","Use one initial fault or introduce one fault in one step, then show its consequences.");
    previous=next;
  });
}
function checkSteps(value:Iso,refs:ReturnType<typeof checkObjects>,frames:IsoFrame[],report:Report){
  const flows=new Set(value.data.connections.filter(c=>c.kind==="flow").map(c=>c.id));
  value.steps.forEach((s,i)=>{
    const path="steps."+i,f=frames[i]!;
    shortCaption(s.text,path+".text",report);
    checkStepRefs(value,s,f,refs,path,report);
    checkChanges(f,path,report);
    checkAccent(f,flows,path,report);
  });
  checkFaults(value,frames,report);
}
export const isoProject=(p:Vec)=>[(p[0]-p[1])*Math.sqrt(3)/2*40,(p[0]+p[1])*20-p[2]*40] as const;
function geometry(value:Iso,routes:Record<string,Vec[]>) {
  let l=Infinity,t=Infinity,r=-Infinity,b=-Infinity;
  const use=(x:number,y:number)=>{l=Math.min(x,l);t=Math.min(y,t);r=Math.max(r,x);b=Math.max(b,y);};
  for(const o of value.data.objects){
    const [w,d,h]=o.size??getIsoPart(value.data.pack,o.component)?.size??ZERO;
    for(const x of [0,w])for(const y of [0,d])for(const z of [0,h]){
      const [px,py]=isoProject(add(o.at,[x,y,z]));use(px-2,py-2);use(px+8,py+7);
    }
    if(o.label){
      const [x,y]=isoProject(add(o.at,[w/2,d/2,h]));
      const reserve=count(o.label)*8;
      use(x-reserve,y-46);use(x+reserve,y+4);
    }
  }
  for(const points of Object.values(routes))for(const p of points){
    const [x,y]=isoProject(p);use(x-24,y-24);use(x+24,y+24);
  }
  const dx=Math.max(12,(r-l)/8),dy=Math.max(12,(b-t)/8);
  const painted=value.data.objects.slice().sort((a,b)=>a.at.reduce((n,v)=>n+v,0)-b.at.reduce((n,v)=>n+v,0)||ord(a.id,b.id)).map(o=>o.id);
  return {routes,painted,contentBounds:[l,t,r,b] as Bounds,viewBox:[l-dx,t-dy,r-l+2*dx,b-t+2*dy] as Bounds};
}
export type ValidIso={ok:true;value:Iso;geometry:ReturnType<typeof geometry>};
type IsoResult=ValidIso|{ok:false;issues:IsoIssue[]};
export function validateIso(raw:unknown):IsoResult {
  if(!fitsPayload(raw))return {ok:false,issues:[{rule:"payload-size",path:"",message:"ISO exceeds the JSON byte or structure budget.",fix:"Send a bounded, plain JSON scene under 64,000 UTF-8 bytes; shorten or split it."}]};
  const parsed=IsoInputShape.safeParse(raw);
  if(!parsed.success)return {ok:false,issues:parsed.error.issues.slice(0,20).map(i=>{
    const path=i.path.join(".");
    if(i.code==="too_big"&&path==="data.objects")return {rule:"max-objects",path,message:i.message,fix:"Use at most 12 objects and label at most eight of them."};
    if(i.code==="too_big"&&path.endsWith(".label"))return {rule:"label-length",path,message:i.message,fix:"Write a noun phrase of at most 24 characters."};
    if(i.code==="too_big"&&path.endsWith(".text"))return {rule:"caption-length",path,message:i.message,fix:"Write one source line of at most 120 characters."};
    if((i.code==="too_big"||i.code==="too_small")&&path==="steps")return {rule:"step-count",path,message:i.message,fix:"Use between two and eight clear teaching steps."};
    return {rule:"shape",path,message:i.message,fix:"Use only the named fields and values shown in visual_formats; remove unexpected keys."};
  })};
  const v=parsed.data,issues:IsoIssue[]=[];
  const report:Report=(rule,path,message,fix)=>{if(issues.length<40)issues.push({rule,path,message,fix});};
  if(!plain(v.title))report("text-only","title","Scene titles are plain text.","Remove markup, URLs and hidden control characters.");
  if(!getIsoPack(v.data.pack))report("known-pack","data.pack","Unknown pack.","Choose network or physics; other packs are not installed.");
  const refs=checkObjects(v,report);
  const routes=Object.fromEntries(v.data.connections.flatMap((c,i)=>{
    const route=portsAndPath(v,c,i,refs.byId,report);
    return route?[[c.id,route] as const]:[];
  }));
  checkSteps(v,refs,framesOf(v),report);
  if(!fitsPayload(v))report("payload-size","","Normalized ISO data exceeds its storage budget.","Shorten labels or reduce objects and route points, then try again.");
  return issues.length?{ok:false,issues}:{ok:true,value:v,geometry:geometry(v,routes)};
}

const net=(end:"server"|"cache"):IsoInput=>({
  type:"iso",title:end==="server"?"A request through a load balancer":"A cache lookup",step_mode:"highlight",
  data:{pack:"network",objects:[
    {id:"client",component:"client",at:[0,1,0],label:"Client"},
    {id:"balancer",component:"load-balancer",at:[4,1,0],label:"Load balancer"},
    {id:"server",component:end,at:[8,1,0],label:end==="server"?"Server":"Cache"},
  ],connections:[
    {id:"inbound",kind:"flow",from:{object:"client",anchor:"out"},to:{object:"balancer",anchor:"in"}},
    {id:"outbound",kind:"flow",from:{object:"balancer",anchor:"out"},to:{object:"server",anchor:"in"}},
  ]},steps:[
    {text:"The client sends a request to the load balancer.",highlight:["inbound"]},
    {text:end==="server"?"The balancer forwards the request to a server.":"The balancer sends the lookup to the cache.",highlight:["outbound"]},
  ],
});
// The short example stays in visual_formats; the classroom preview uses the full teaching sequence.
function roundRobin():IsoInput{
  const intro=net("server");
  return {
    ...intro,title:"Round robin and a failed server",
    data:{...intro.data,objects:[
      ...intro.data.objects.map(o=>o.id==="server"?{...o,label:"Server A"}:o),
      {id:"server-b",component:"server",at:[8,5,0],label:"Server B"},
    ],connections:[
      ...(intro.data.connections??[]),
      {id:"to-b",kind:"flow",from:{object:"balancer",anchor:"out"},to:{object:"server-b",anchor:"in"},via:[[7,2,.5],[7,6.5,.5]]},
    ]},steps:[
      {text:"Request 1 reaches the load balancer. Both servers are healthy.",highlight:["inbound"]},
      {text:"Round robin starts with Server A.",highlight:["outbound"]},
      {text:"Request 2 reaches the same load balancer.",highlight:["inbound"]},
      {text:"The next turn goes to Server B.",highlight:["to-b"]},
      {text:"A later health check marks Server B unhealthy.",highlight:["server-b"],states:{"server-b":"fault"}},
      {text:"Request 3 arrives while Server B is out of rotation.",highlight:["inbound"]},
      {text:"Server A receives request 3. Only healthy servers get traffic.",highlight:["outbound"]},
    ],
  };
}
const physics=(part:"switch"|"breaker"):IsoInput=>({
  type:"iso",title:part==="switch"?"A switch in a simple circuit":"A breaker interrupts a circuit",
  data:{pack:"physics",objects:[
    {id:"source",component:"battery",at:[0,0,0],label:"Battery"},
    {id:"control",component:part,at:[4,0,0],label:part==="switch"?"Switch":"Breaker",state:part==="switch"?"off":"idle"},
    {id:"load",component:"lamp",at:[8,0,0],label:"Lamp",state:part==="switch"?"off":"idle"},
  ],connections:[
    {id:"lead-a",kind:"wire",from:{object:"source",anchor:"b"},to:{object:"control",anchor:"a"}},
    {id:"lead-b",kind:"wire",from:{object:"control",anchor:"b"},to:{object:"load",anchor:"a"}},
    {id:"return",kind:"wire",from:{object:"load",anchor:"b"},to:{object:"source",anchor:"a"},via:[[9.5,1,0],[9.5,3.5,0],[0,3.5,0],[0,.5,0]]},
  ]},steps:part==="switch" ? [
    {text:"With the switch open, the circuit is incomplete.",highlight:["control"]},
    {text:"Closing the switch completes the path and lights the lamp.",highlight:["control"],states:{control:"idle",load:"active"}},
  ] : [
    {text:"The breaker allows current in its normal operating state.",highlight:["control"]},
    {text:"A fault appears at the load.",highlight:["load"],states:{load:"fault"}},
    {text:"The breaker opens to interrupt the circuit.",highlight:["control"],states:{control:"off"}},
  ],
});
const SHAPE={data:"{ pack, theme_hint?, objects, connections }",objects:"[{id, component, at:[x,y,z], size?:[w,d,h], label?, state?}]",
  connections:"[{id, kind, from:{object,anchor}, to:{object,anchor}, via?:[[x,y,z]]}]",
  steps:"[{text, highlight?, states?:{object_id:state}, cutaway?:object_id|null}]",step_mode:"highlight | build"};
const RULES=[
  "Data and text only. Positions, custom sizes and waypoints: multiples of 0.5. No overlaps between solid volumes.",
  "Use unique IDs and named anchors. Network flow goes out to in; physics uses wire.",
  "Use 2–8 steps of up to 120 characters, up to eight labels of 24 characters, and at most three effective changes per step.",
  "State persists between steps. Omit cutaway to keep it, or use null to close it. Use one active accent target and introduce at most one fault.",
  "Avoid projected overlap: spread key parts across both grid axes, leave room for short labels, and route around unrelated solids. Give the renderer at least one clear view; split a crowded scene.",
  "Show one meaningful event per step: cause, handoff, or outcome. Use plain-language captions that still explain the change without animation; do not add empty beats to stretch playback.",
];
type Format={type:"iso";availability:"ready";packs:string[];shape?:typeof SHAPE;rules?:string[];components?:unknown[];connections?:readonly string[];example?:IsoInput;examples?:IsoInput[];issue?:IsoIssue;next?:string};
export function isoFormat(pack?:string):Format{
  const root={type:"iso",availability:"ready",packs:Object.keys(ISO_PACKS)} as const;
  if(!pack)return {...root,next:"Request visual_formats with type iso and pack network or physics. Then send a checked scene to save_visual."};
  const manifest=getIsoPack(pack);
  if(!manifest)return {...root,issue:{rule:"known-pack",path:"pack",message:"Unknown ISO pack.",fix:"Request network or physics. Other packs are not installed."}};
  const examples=pack==="network"?[roundRobin(),net("cache")]:[physics("switch"),physics("breaker")];
  const example=pack==="network"?net("server"):examples[0]!;
  return {...root,shape:{...SHAPE},rules:[...RULES],components:Object.entries(manifest.components).map(([component,p])=>({
    component,size:[...p.size],anchors:Object.fromEntries(Object.entries(p.anchors).map(([id,a])=>[id,a.role])),...(p.cutaway?{cutaway:true}:{}),
  })),connections:[...manifest.connections],example,examples};
}
