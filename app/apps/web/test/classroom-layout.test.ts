import { expect, test } from "vitest";
import * as layout from "../src/lib/classroom-layout.ts";

test("topic labels hide only explicit day and chapter prefixes",()=>{
  expect(layout.classroomTitle("Day 01 · TCP / UDP")).toBe("TCP / UDP");
  expect(layout.classroomTitle("วันที่ 3: การส่งเฟรม")).toBe("การส่งเฟรม");
  expect(layout.classroomTitle("บทที่ 2 — หน่วยความจำ")).toBe("หน่วยความจำ");
  expect(layout.classroomTitle("Day 1 basics")).toBe("Day 1 basics");
  expect(layout.classroomTitle("Day 1:")).toBe("Day 1:");
});

test("desktop shows no more than four named chapters and always retains the selected one",()=>{
  expect(layout.chapterWindow(14,0)).toEqual([0,1,2,3]);
  expect(layout.chapterWindow(14,7)).toEqual([6,7,8,9]);
  expect(layout.chapterWindow(14,13)).toEqual([10,11,12,13]);
  expect(layout.chapterWindow(2,1)).toEqual([0,1]);
  expect(layout.chapterWindow(0,0)).toEqual([]);
});

test("outline points to real authored text sections, not standalone illustrations or fenced examples",()=>{
  const blocks=[
    {type:"text",markdown:"Course notes"},
    {type:"visual"},
    {type:"text",markdown:"```sh\n# Example command\n```\n### First concept"},
    {type:"text",markdown:"## Second concept ##\nNotes"},
  ];
  expect(layout.classroomOutline(blocks,"chapter-1")).toEqual([
    {id:"chapter-1-part-3",title:"First concept"},
    {id:"chapter-1-part-4",title:"Second concept"},
  ]);
});
