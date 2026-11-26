import { crc32, deflateRawSync } from "node:zlib";
import { expect,it } from "vitest";
import { readCoursePackage } from "../src/course-package.ts";
const course = Buffer.from(JSON.stringify({
  schema_version:1,course_id:"fixture",title:"Fixture",language:"en",
  sources:[{id:"ref",title:"Source",url:"https://example.org",accessed_on:"2026-11-25",rights:"reference-only",summary:"Test"}],
  lessons:[{id:"lesson",title:"Lesson",objective:"Test",source_ids:["ref"],blocks:[{type:"text",markdown:"Test"}]}],
}));
function zip(data: Buffer, path = "course.json", method=8) {
  const fname=Buffer.from(path), packed=method===8?deflateRawSync(data):data;
  const l=Buffer.alloc(30); l.writeUInt32LE(0x04034b50);l.writeUInt16LE(method,8);l.writeUInt32LE(crc32(data),14);
  l.writeUInt32LE(packed.length,18);l.writeUInt32LE(data.length,22);l.writeUInt16LE(fname.length,26);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(method,10);c.writeUInt32LE(crc32(data),16);
  c.writeUInt32LE(packed.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(fname.length,28);
  const e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50);e.writeUInt16LE(1,8);e.writeUInt16LE(1,10);
  e.writeUInt32LE(46+fname.length,12);e.writeUInt32LE(30+fname.length+packed.length,16);
  return Buffer.concat([l,fname,packed,c,fname,e]);
}
it("imports the identical manifest from JSON or a normal single-root ZIP",()=>{
  expect(readCoursePackage(zip(course),"zip")).toEqual(readCoursePackage(course,"json"));
  expect(readCoursePackage(zip(course,"course.json",0),"zip").course_id).toBe("fixture");
});
it("rejects invalid package member names, excessive output, CRC mismatch, and future manifests",()=>{
  expect(()=>readCoursePackage(zip(course,"parent/course.json"),"zip")).toThrow();
  expect(()=>readCoursePackage(zip(Buffer.alloc(256*1024+1)),"zip")).toThrow();
  const broken=zip(course,"course.json",0); broken[42]=0;
  expect(()=>readCoursePackage(broken,"zip")).toThrow();
  expect(()=>readCoursePackage(Buffer.from('{"schema_version":2}'),"json")).toThrow();
});

it("ISO pack import accepts explicit v2 in JSON and ZIP, not v1 or an unknown version", async()=>{
  const {isoFormat}=await import("../src/iso.ts");
  const raw=JSON.parse(course.toString("utf8"));
  raw.lessons[0].blocks.push({type:"visual",visual:{...isoFormat("physics").example,id:"switch"},fallback:"An open switch interrupts the circuit."});
  expect(()=>readCoursePackage(Buffer.from(JSON.stringify(raw)),"json")).toThrow(/ISO|v1/);
  raw.schema_version=2;
  const bytes=Buffer.from(JSON.stringify(raw));
  expect(readCoursePackage(bytes,"json")).toMatchObject({schema_version:2});
  expect(readCoursePackage(zip(bytes),"zip")).toEqual(readCoursePackage(bytes,"json"));
  raw.schema_version=3;
  expect(()=>readCoursePackage(Buffer.from(JSON.stringify(raw)),"json")).toThrow(/schema_version/);
});
