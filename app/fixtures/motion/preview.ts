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
const lessonText = {
  setup: [
    "### เว็บเดียว แต่มี 3 เครื่อง ไหนจะรับงาน?",
    "",
    "สมมติเราดูแลเว็บลงทะเบียนเรียน ช่วงเปิดลงทะเบียน นักศึกษากดเข้าเว็บพร้อมกัน แต่ทุกคนรู้จักแค่ URL เดียว ถ้าคำขอทั้งหมดไป Server B อีกสองเครื่องที่ว่างก็ช่วยอะไรไม่ได้",
    "",
    "**Load balancer** เป็นประตูหน้าที่รับ request แล้วเลือก backend ให้ มองภาพนี้เป็นสามส่วน: Client ส่งคำขอ, balancer ตัดสินใจ, server รับงานไปตอบ",
    "",
    "### ลองทำนายก่อนกดเล่น",
    "",
    "มี A, B, C ที่พร้อมใช้ทั้งหมด และเราเริ่มที่ A ถ้าคำขอแรกไป A แล้ว คำขอที่ 2, 3 และ 4 ควรไปเครื่องไหน? กดเล่น แล้วตามกล่องคำขอจากผู้ใช้ ผ่านตัวกระจายงาน ไปถึงเครื่องปลายทาง แล้วกดขั้น “C ไม่พร้อม” เพื่อดูว่ารอบถัดไปเปลี่ยนอย่างไร",
  ].join("\n"),
  explanation: [
    "### เฉลย: A → B → C → A",
    "",
    "นี่คือ **round robin**: วนไปยังเครื่องถัดไปในรายการ backend ที่พร้อมใช้งาน กล่องสีส้มแทนคำขอ เส้นประแสดงเส้นทางที่เลือกในขั้นนั้น ภาพนี้ติดตามเฉพาะขาไปเพื่อให้เห็นการเลือกเครื่องชัด ๆ",
    "",
    "### จำนวนคำขอเท่ากัน ไม่ได้แปลว่างานเท่ากัน",
    "",
    "สมมติ A ได้งานอัปโหลดที่ค้าง 10 วินาที ส่วน B กับ C ได้งานเปิดหน้าเว็บที่จบใน 100 มิลลิวินาที ทั้งสามเครื่องได้อย่างละหนึ่ง request แต่ A ยังยุ่งอยู่ นี่คือเหตุผลที่บางระบบเลือก **least connections** เพื่อให้เครื่องที่มีการเชื่อมต่อค้างน้อยกว่ารับงานใหม่ วิธีนี้ก็ไม่ได้วัด CPU โดยตรงเหมือนกัน",
    "",
    "### ลองเอง: ถ้า B ไม่พร้อม?",
    "",
    "สมมติ health check ตัด B ออกจากรายชื่อเครื่องที่พร้อมแล้ว และรอบใหม่เริ่มที่ A คำขอ 4 รายการถัดไปจะไปไหน? เขียนลำดับก่อนเปิดแท็บทบทวน ฉากด้านบนทำให้ C ไม่พร้อม ลองใช้หลักเดียวกันทำนายอีกแบบเมื่อเป็น B",
    "",
    "**จำให้ขึ้นใจ:** Health check ช่วยตัดสินว่า *เครื่องไหนมีสิทธิ์รับงาน* ส่วน round robin ตัดสินว่า *ให้ใครรับ request ถัดไป*",
  ].join("\n"),
};
const lessons = [["network","One packet, two networks","internet","Explain which header fields change on a routed hop."],["classifier","A moveable decision boundary","threshold","Distinguish an input feature from the threshold."],["spring","A spring’s linear response","geometry","Relate applied force and spring extension within the linear range."],["lift-iso","ลิฟต์ยกของ","geometry","อธิบายว่าทำไมกล่องและแท่นขยับขึ้นเท่ากัน"],["sphere","ระยะในสามมิติ: จุดขยับ หรือเราเปลี่ยนมุมมอง?","geometry","แยกการเปลี่ยนมุมกล้องออกจากการเปลี่ยนตำแหน่งของวัตถุ"],["load-balancer","Load Balancing: หนึ่ง URL หลายเซิร์ฟเวอร์","round-robin","ทำนายเส้นทางของ request และอธิบายข้อจำกัดของ round robin ได้"]].map(([file,title,ref,objective])=>({
  id:file,title,objective,source_ids:[ref],
  ...(file==="load-balancer"?{questions:[{id:"skip-unhealthy",type:"explain",prompt:"ถ้า health check เอา Server B ออกจากรายการ แล้วเริ่มรอบใหม่ที่ A, request 1–4 ไปไหน และเพราะอะไร?",rubric:["เรียง A → C → A → C","อธิบายว่า B ไม่อยู่ในกลุ่ม backend ที่พร้อมรับงาน"],model_answer:"A → C → A → C เพราะกลุ่ม backend ที่พร้อมเหลือ A กับ C เท่านั้น จากนั้น round robin วนตามลำดับในกลุ่มนี้"}]}:{}),
  blocks:[
    ...(file==="load-balancer"?[{type:"text",markdown:lessonText.setup}]:file==="lift-iso"?[{type:"text",markdown:"### ทำไมของไม่หลุดจากแท่น?\n\nก่อนกดยก กล่องวางสัมผัสกับแท่น กดขั้นถัดไปแล้วเทียบสองระดับ สิ่งที่เปลี่ยนคือความสูงของทั้งคู่ ไม่ใช่ระยะห่างระหว่างกล่องกับแท่น"}]:file==="sphere"?[{type:"text",markdown:"### การเปลี่ยนมุมมอง ไม่ใช่การเปลี่ยนตำแหน่ง\n\nเรากำลังวัดระยะจากศูนย์กลางทรงกลมถึงจุดด้านนอก ให้ r เป็นรัศมี และ d เป็นระยะถึงจุดวัด เมื่อ d มากกว่า r จุดวัดอยู่นอกทรงกลม\n\n**ลองทำนาย:** ถ้าเราหยุดเวลาไว้แล้วหมุนภาพ ระยะ d จะเปลี่ยนไหม? ต่อมาให้กดเล่น แล้วดูว่าจุดเล็กเคลื่อนอย่างไรเมื่อกล้องไม่ขยับ"}]:[]),{
    type:"visual",fallback:file==="load-balancer"?"คำขอไป A → B → C เมื่อ C ไม่พร้อม ระบบข้ามไปยัง A":file==="sphere"?"การหมุนกล้องไม่เปลี่ยนตำแหน่งจริง ขณะกดเล่น จุดวัดเคลื่อนจริงในแนวลึก ส่วนทรงกลมไม่ขยับ":objective,visual:{id:file,title:file==="load-balancer"?"ตามเส้นทางคำขอ":title,type:"scene",data:JSON.parse(readFileSync(new URL((file==="load-balancer"?"load-balancer-iso":file)+".json",import.meta.url),"utf8"))},
  },...(file==="load-balancer"?[{type:"text",markdown:lessonText.explanation}]:file==="sphere"?[{type:"text",markdown:"### สิ่งที่ควรเห็น\n\nตอนหมุนกล้อง จุดบนจออาจดูใกล้หรือไกล แต่ตำแหน่งในฉากไม่เปลี่ยน ต่างจากตอนกดเล่นที่จุดวัดเคลื่อนจริงและ d เปลี่ยน ส่วน r คงเดิม\n\n**สรุป:** อย่าใช้ระยะที่เห็นบนจอ 2 มิติมาแทนระยะจริงในสามมิติ"}]:[])],
}));
const result=store.submit({request_id:"motion-preview-1",bundle:{schema_version:1,course_id:"universal-motion-fixture",title:"Universal Motion Preview",language:"th",sources,lessons}});
if(!result.ok) throw new Error(JSON.stringify(result));
store.publish(result.revision_id);
