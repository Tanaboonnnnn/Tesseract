import { readFileSync } from "node:fs";
import { ClassroomStore } from "../../packages/core/src/classroom.ts";

const path = process.argv[2];
if (!path?.startsWith("/tmp/tess-motion-preview.")) throw new Error("Use an isolated temporary preview directory");
const store = new ClassroomStore(path);
const sources = [
  {id:"internet",title:"Internet Protocol",url:"https://www.rfc-editor.org/info/rfc791",accessed_on:"2026-11-25",rights:"reference-only",summary:"Reference for the IPv4 header and TTL."},
  {id:"threshold",title:"Threshold learning example",url:"https://developers.google.com/machine-learning/crash-course/classification/thresholding",accessed_on:"2026-11-25",rights:"reference-only",summary:"Background for a fixed sample and variable decision threshold."},
];
const lessons = [["network","One packet, two networks","internet","Explain which header fields change on a routed hop."],["classifier","A moveable decision boundary","threshold","Distinguish an input feature from the threshold."]].map(([file,title,ref,objective])=>({
  id:file,title,objective,source_ids:[ref],blocks:[{
    type:"visual",fallback:objective,visual:{id:file,title,type:"scene",data:JSON.parse(readFileSync(new URL(file+".json",import.meta.url),"utf8"))},
  }],
}));
const result=store.submit({request_id:"motion-preview-1",bundle:{schema_version:1,course_id:"universal-motion-fixture",title:"Universal Motion Preview",language:"en",sources,lessons}});
if(!result.ok) throw new Error(JSON.stringify(result));
store.publish(result.revision_id);
