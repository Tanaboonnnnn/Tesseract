import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ClassroomStore, Store } from "@tesseract/core";
import { expect, it } from "vitest";
import { createServer, REMOTE_TOOLS, type ServerOptions } from "../src/server.ts";

const FIXTURES = resolve(import.meta.dirname, "../../../fixtures/sample-data");
const AUTHORING_TOOLS = ["classroom_format", "validate_course_visual", "submit_course_draft", "get_draft_receipt", "get_draft_status"];
const LOCAL_ONLY = [
  "upsert_goal", "create_project", "update_project", "delete_task", "create_roadmap", "create_course", "update_learning",
  "delete_visual", "adjust_skill_level", "record_assessment", "list_inbox", "read_inbox", "update_note", "set_project_map",
  "update_map_node", "delete_event", "sync_calendar", "undo_change",
];
const profiles: {name:string; options:ServerOptions; expected:string[]}[] = [
  {name:"default stdio registration", options:{}, expected:[...REMOTE_TOOLS.filter(n=>!AUTHORING_TOOLS.includes(n)),...LOCAL_ONLY]},
  {name:"local", options:{profile:"local"}, expected:[...REMOTE_TOOLS,...LOCAL_ONLY]},
  {name:"Classroom-first local", options:{profile:"local",classroomFirst:true}, expected:[...REMOTE_TOOLS,...LOCAL_ONLY.filter(n=>n!=="create_roadmap"&&n!=="create_course")]},
  {name:"remote", options:{profile:"remote"}, expected:[...REMOTE_TOOLS]},
  {name:"Classroom isolation", options:{profile:"classroom"}, expected:AUTHORING_TOOLS},
];

// Explicit success scenarios and exact coverage mean a new registration cannot silently go uncalled.
// Real MCP handlers and filesystem/SQLite stores are used. No live provider, network, or user data.
it.each(profiles)("$name successfully exercises every listed tool on temporary data", async ({name, options, expected}) => {
  const dir=mkdtempSync(join(tmpdir(),"tesseract-mcp-contract-"));
  const client=new Client({name:"tool-contract",version:"1"});
  let syncCalls=0;
  try {
    cpSync(FIXTURES,dir,{recursive:true});
    writeFileSync(join(dir,"inbox","smoke.md"),"Temporary inbox fixture.");
    const store=new Store({dataDir:dir,agent:"tool-contract",now:()=>new Date("2026-11-23T12:00:00.000Z")});
    const owner=new ClassroomStore(dir);
    const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
    await createServer(store,{
      ...options,
      // Only the provider adapter is replaced. The MCP handler and disconnected path have separate tests.
      google:{
        status:()=>({client:true,connected:true,calendar_id:"fixture",last_sync:null,last_error:null}),
        external:async()=>[],
        sync:async()=>{syncCalls++;return {calendar_id:"fixture",pulled:0,pushed:1,removed:0,last_sync:"2026-11-23"};},
      },
    }).connect(serverTransport);
    await client.connect(clientTransport);
    const listed=(await client.listTools()).tools;
    const listedNames=new Set(listed.map(t=>t.name));
    expect([...listedNames].sort()).toEqual([...expected].sort());
    expect(listedNames.size).toBe(listed.length);
    for(const t of listed){
      expect(t.description, t.name).toBeTruthy();
      expect(t.inputSchema.type, t.name).toBe("object");
    }
    const called=new Set<string>();
    const call=async (tool:string,args:Record<string,unknown>={})=>{
      expect(listedNames.has(tool),tool).toBe(true);
      const response=await client.callTool({name:tool,arguments:args});
      expect(response.isError===true,tool+": "+JSON.stringify(response.content)).toBe(false);
      const content=response.content as {type:string;text:string}[];
      expect(content[0]?.type,tool).toBe("text");
      const payload=JSON.parse(content[0]!.text);
      expect(payload?.ok===false,tool+": "+content[0]!.text).toBe(false);
      called.add(tool);
      return payload;
    };

    const courseDbFixture = {
      schema_version:1, course_id:"mcp-contract", title:"Course contract", language:"en",
      sources:[{id:"fixture",title:"Fixture",url:"https://example.com/reference",accessed_on:"2026-11-23",
        rights:"reference-only",summary:"Synthetic reference for contract tests."}],
      lessons:[{id:"intro",title:"Intro",objective:"Read an example.",source_ids:["fixture"],
        blocks:[{type:"text",markdown:"An example."}]}],
    };
    let course={course_id:courseDbFixture.course_id, lesson_id:"intro", revision_id:""};

    if (listedNames.has("classroom_format")) {
      const f=await call("classroom_format",{include_schema:true,include_scene_schema:true});
      expect(f.authoring_rules).toMatchObject({min_learn_visuals:1,min_check_questions:1});
      expect(await call("validate_course_visual",{scene:f.scene_example.data})).toMatchObject({ok:true});
      const request_id="contract-draft";
      const receipt=await call("submit_course_draft",{request_id,bundle:f.example});
      expect(receipt).toMatchObject({ok:true,status:"staged"});
      expect(await call("get_draft_receipt",{request_id})).toEqual(receipt);
      expect(await call("get_draft_status",{request_id})).toMatchObject({status:"staged",receipt});
      expect(owner.listPublished()).toEqual([]);
      course={course_id:receipt.course_id,lesson_id:f.example.lessons[0].id,revision_id:receipt.revision_id};
    }
    if (options.profile !== "classroom") {
      if (!course.revision_id){
        const imported=owner.submit({request_id:"contract-import",bundle:courseDbFixture});
        if(!imported.ok)throw new Error(JSON.stringify(imported));
        course.revision_id=imported.revision_id;
      }
      // Simulate the local owner action on the isolated fixture, not an MCP publish tool.
      owner.publish(course.revision_id);
      const pinned={course_id:course.course_id,revision_id:course.revision_id};
      expect(await call("list_published_courses")).toContainEqual(expect.objectContaining(pinned));
      expect(await call("get_published_course",pinned)).toMatchObject(pinned);
      expect(await call("get_course_lesson",{...pinned,lesson_id:course.lesson_id})).toHaveProperty("entries");
      await call("get_course_visuals",{...pinned,lesson_id:course.lesson_id});
      expect(await call("get_course_revision_anchor",{course_id:course.course_id})).toMatchObject({base_revision:course.revision_id,pending_draft:false});
      expect((await call("get_course_activity",{course_id:course.course_id})).events).toEqual([expect.objectContaining({action:"publish"})]);
      expect((await call("get_overview")).classroom).toMatchObject({published_count:1});
      expect(await call("search",{query:"Kubernetes"})).toHaveProperty("hits");

      await call("list_goals");
      if(listedNames.has("upsert_goal")){
        expect(await call("upsert_goal",{id:"smoke-goal",title:"Smoke goal"})).toMatchObject({id:"smoke-goal"});
      }
      const project="weather-app";
      expect(await call("list_projects")).toContainEqual(expect.objectContaining({id:project}));
      expect(await call("get_project",{id:project})).toMatchObject({id:project});
      if(listedNames.has("create_project")){
        expect(await call("create_project",{id:"smoke-project",title:"Smoke project"})).toMatchObject({id:"smoke-project"});
        expect(await call("update_project",{id:"smoke-project",title:"Revised project"})).toMatchObject({title:"Revised project"});
      }
      const task=await call("add_task",{project,title:"Smoke task"});
      expect(await call("update_task",{project,task:task.id,status:"done"})).toMatchObject({status:"done"});
      if(listedNames.has("delete_task")) await call("delete_task",{project,task:task.id});
      await call("get_project_map",{project});
      const map={lanes:["core"],nodes:[{id:"source",label:"Source",lane:"core"}]};
      if(listedNames.has("set_project_map")){
        await call("set_project_map",{project,...map});
        await call("update_map_node",{project,node:"source",label:"Revised source"});
      } else {
        store.setProjectMap(project,map);
      }
      expect(await call("set_map_focus",{project,node:"source"})).toMatchObject({focus:"source"});

      if(listedNames.has("create_roadmap")) await call("create_roadmap",{id:"smoke-roadmap",title:"Smoke roadmap",phases:["learn"]});
      if(listedNames.has("create_course")) await call("create_course",{id:"smoke-course",title:"Smoke course",phases:["learn"]});
      const learning="kubernetes";
      expect(await call("list_learning")).toContainEqual(expect.objectContaining({id:learning}));
      await call("get_learning",{id:learning});
      if(listedNames.has("update_learning")) await call("update_learning",{id:learning,title:"Kubernetes test"});
      expect(await call("add_topic",{learning,topic:{id:"smoke-topic",title:"Smoke topic",skills:["kubernetes-ops"]}})).toMatchObject({id:"smoke-topic"});
      expect(await call("update_topic",{learning,topic:"smoke-topic",status:"learning"})).toMatchObject({status:"learning"});
      const visual={...(await call("visual_formats",{type:"chart"})).example,id:"smoke-visual"};
      await call("save_visual",{learning,topic:"smoke-topic",...visual});
      expect(await call("get_visuals",{learning,id:visual.id})).toMatchObject({id:visual.id});
      if(listedNames.has("delete_visual")) await call("delete_visual",{learning,id:visual.id});
      await call("get_review_queue");

      await call("get_skill_profile",{domain:"systems"});
      if(listedNames.has("adjust_skill_level")) await call("adjust_skill_level",{skill:"kubernetes-ops",delta:-1,reason:"Synthetic fixture evidence"});
      const topic_ref="learning/kubernetes#smoke-topic";
      await call("generate_quiz_context",{topic_ref});
      const quiz=await call("create_quiz",{title:"Smoke quiz",skills:{"kubernetes-ops":1},difficulty:"easy",topic_refs:[topic_ref],
        questions:[{q:"Default Kubernetes workload?",choices:["Pod","Volume"],answer:0}]});
      expect(await call("list_quizzes")).toContainEqual(expect.objectContaining({id:quiz.id}));
      if(listedNames.has("record_assessment")) await call("record_assessment",{title:"Smoke assessment",source:"ai-quiz",
        skills:{"kubernetes-ops":1},score:80,difficulty:"easy",topic_refs:[topic_ref]});
      await call("list_assessments",{skill:"kubernetes-ops"});
      if(listedNames.has("list_inbox")){
        expect(await call("list_inbox")).toContainEqual(expect.objectContaining({name:"smoke.md"}));
        expect(await call("read_inbox",{name:"smoke.md"})).toMatchObject({content:"Temporary inbox fixture."});
      }

      const note={id:"smoke-note",title:"Smoke note",body:"Fixture only."};
      await call("create_note",note);
      expect(await call("get_note",{id:note.id})).toMatchObject(note);
      expect(await call("list_notes")).toContainEqual(expect.objectContaining({id:note.id}));
      if(listedNames.has("update_note")) expect(await call("update_note",{id:note.id,title:"Revised note"})).toMatchObject({title:"Revised note"});

      const date="2026-11-30", title="Smoke event";
      const event=await call("add_event",{title,date});
      expect(await call("get_schedule",{from:date,to:"2026-12-01"})).toContainEqual(expect.objectContaining({title}));
      expect(await call("update_event",{id:event.id,title:"Revised event"})).toMatchObject({title:"Revised event"});
      if(listedNames.has("sync_calendar")) expect(await call("sync_calendar")).toMatchObject({pushed:1});
      if(listedNames.has("delete_event")) await call("delete_event",{id:event.id});
      const activity=await call("get_activity",{limit:1});
      if(listedNames.has("undo_change")){
        await call("undo_change",{id:activity[0].id});
        expect(store.listEvents()).toContainEqual(expect.objectContaining({id:event.id}));
      }
    }

    expect(syncCalls).toBe(listedNames.has("sync_calendar")?1:0);
    expect([...called].sort(),name+" tools with an asserted successful call").toEqual([...listedNames].sort());
    for (const forbidden of ["publish_course","delete_note","delete_quiz",
      ...(options.profile==="remote"||options.profile==="classroom"?["delete_task","undo_change"]:[])]){
      expect(listedNames.has(forbidden),forbidden).toBe(false);
      const result=await client.callTool({name:forbidden,arguments:{}});
      expect(result.isError,forbidden).toBe(true);
    }
  } finally {
    try { await client.close(); }
    finally { rmSync(dir,{recursive:true,force:true}); }
  }
});

it.each([
  { label: "local", options: { profile: "local" }, published: true },
  { label: "local URL-only", options: { profile: "local", classroomFirst: true }, published: true },
  { label: "remote", options: { profile: "remote" }, published: true },
  { label: "classroom", options: { profile: "classroom" }, published: false },
] satisfies { label: string; options: ServerOptions; published: boolean }[])(
  "$label presents the three-step course authoring path before read and helper tools",
  async ({ options, published }) => {
    const dir = mkdtempSync(join(tmpdir(), "tesseract-mcp-workflow-"));
    const client = new Client({ name: "workflow-test", version: "1" });
    try {
      const [a, b] = InMemoryTransport.createLinkedPair();
      await createServer(new Store({ dataDir: dir, agent: "workflow-test" }), options).connect(a);
      await client.connect(b);
      const tools = (await client.listTools()).tools;
      const path = ["classroom_format", "submit_course_draft", "get_draft_status"];
      expect(tools.slice(0, 3).map(t => t.name)).toEqual(path);
      const instructions = client.getInstructions()!;
      expect(instructions).toMatch(/Course authoring:.*classroom_format.*submit_course_draft.*get_draft_status/);
      const res = await client.callTool({ name: "classroom_format", arguments: {} });
      expect(res.isError).not.toBe(true);
      expect(JSON.parse((res.content as { text: string }[])[0]!.text).authoring_workflow.map((step: { tool: string }) => step.tool)).toEqual(path);
      const publishedTools = ["list_published_courses","get_published_course","get_course_lesson","get_course_visuals","get_course_revision_anchor","get_course_activity"];
      expect(tools.filter(t => publishedTools.includes(t.name)).map(t => t.name)).toEqual(published ? publishedTools : []);
      if (published) {
        expect(tools.slice(-publishedTools.length).map(t => t.name)).toEqual(publishedTools);
        expect(instructions).toMatch(/Published course reading:.*not.*draft/i);
      }
    } finally {
      try { await client.close(); }
      finally { rmSync(dir, { recursive: true, force: true }); }
    }
  },
);
