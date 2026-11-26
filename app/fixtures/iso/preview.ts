// Synthetic-only isolated preview. Never point this at a workspace.
import { Store } from "../../packages/core/src/store.ts";
import { ClassroomStore } from "../../packages/core/src/classroom.ts";
import { isoFormat } from "../../packages/core/src/iso.ts";
const d=process.argv[2];
if(!d?.startsWith("/tmp/tess-iso-review."))throw Error("use isolated workspace");
const store=new Store({dataDir:d,agent:"iso-preview"});
const l=store.listLearning()[0];
const picks=["network","physics"].flatMap(pack=>isoFormat(pack).examples);
picks.forEach((visual,i)=>store.saveVisual(l.id,{...visual,id:"iso-demo-"+i}));
const source={id:"ref",title:"Illustration reference",url:"https://example.com",accessed_on:"2026-11-26",rights:"reference-only",summary:"Synthetic demonstration fixture"};
const lessons=picks.map((visual,i)=>({
 id:"lesson-"+(i+1),title:visual.title,objective:"Explain the concept one step at a time.",layout:"inline",source_ids:["ref"],
 blocks:[
  {type:"text",markdown:i===0?"Predict which server handles each request. Press Play to follow the route, then watch what changes when a health check removes a server from rotation.":i===1?"Follow the highlighted route. The box represents one request, not a count of requests.":"Read the state of each component, then step through the change."},
  {type:"visual",visual:{...visual,id:"iso-demo-"+i},fallback:visual.steps.map(s=>s.text).join(" ")},
 ]
}));
const c=new ClassroomStore(d);
const receipt=c.submit({request_id:"iso-review-synthetic",bundle:{schema_version:2,course_id:"iso-preview",title:"Isometric Illustration Preview",language:"en",sources:[source],lessons}});
if(!receipt.ok)throw Error(JSON.stringify(receipt));
c.publish(receipt.revision_id);
console.log(JSON.stringify({status:"synthetic-only",classroom:"/learning/classroom/iso-preview#lesson-1",standalone:"/learning/"+l.id+"/visuals/iso-demo-0",published_fixture:receipt.revision_id}));
