import { readFileSync } from "node:fs";
import { ClassroomStore } from "../../packages/core/src/classroom.ts";

const path = process.argv[2];
if (!path?.startsWith("/tmp/tess-motion-preview.")) throw new Error("Use an isolated temporary preview directory");
const store = new ClassroomStore(path);
const sources = [
  {id:"internet",title:"Internet Protocol",url:"https://www.rfc-editor.org/info/rfc791",accessed_on:"2026-11-25",rights:"reference-only",summary:"Reference for the IPv4 header and TTL."},
  {id:"threshold",title:"Threshold learning example",url:"https://developers.google.com/machine-learning/crash-course/classification/thresholding",accessed_on:"2026-11-25",rights:"reference-only",summary:"Background for a fixed sample and variable decision threshold."},
];
sources.push({id:"geometry",title:"Self-authored geometry illustration",url:"https://www.mathopenref.com/sphere.html",accessed_on:"2026-11-26",rights:"reference-only",summary:"Definitions only. All illustration data are synthetic."});
sources.push({id:"round-robin",title:"NGINX load balancing guide",url:"https://nginx.org/en/docs/http/load_balancing.html",accessed_on:"2026-11-26",rights:"reference-only",summary:"Reference for the default round-robin routing policy."});
const lessons = [["network","One packet, two networks","internet","Explain which header fields change on a routed hop."],["classifier","A moveable decision boundary","threshold","Distinguish an input feature from the threshold."],["spring","A spring’s linear response","geometry","Relate applied force and spring extension within the linear range."],["sphere","Orbit an educational sphere","geometry","Separate a viewpoint change from an object moving."],["load-balancer","How a load balancer hands out requests","round-robin","Follow three requests through a round-robin load balancer."]].map(([file,title,ref,objective])=>({
  id:file,title,objective,source_ids:[ref],blocks:[
    ...(file==="load-balancer"?[{type:"text",markdown:"### What should happen to the next request?\n\nImagine one client opening a page three times. We have three healthy servers. A round-robin load balancer walks through the server list in order. Watch where each request goes below."}]:[]),{
    type:"visual",fallback:objective,visual:{id:file,title,type:"scene",data:JSON.parse(readFileSync(new URL(file+".json",import.meta.url),"utf8"))},
  },...(file==="load-balancer"?[{type:"text",markdown:"### What the animation shows\n\nThe order was **A → B → C**, then back to A. Round robin distributes requests across the servers, but it does not choose the server with the most free CPU. Equal request counts do not guarantee equal work."}]:[])],
}));
const result=store.submit({request_id:"motion-preview-1",bundle:{schema_version:1,course_id:"universal-motion-fixture",title:"Universal Motion Preview",language:"en",sources,lessons}});
if(!result.ok) throw new Error(JSON.stringify(result));
store.publish(result.revision_id);
