import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Store } from "@tesseract/core";
import { afterEach, describe, expect, it } from "vitest";
import { startLocalHttp } from "../src/local-http.ts";

const token = randomBytes(32).toString("base64url");
const auth = { Authorization: "Bearer " + token };
const clients: Client[] = [];
const stop: (() => Promise<void>)[] = [];
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(stop.splice(0).map((close) => close()));
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function fixtureStore() {
  const dataDir = await mkdtemp(join(tmpdir(), "tesseract-mcp-local-http-"));
  directories.push(dataDir);
  return new Store({ dataDir, agent: "test-local-http" });
}

async function launch() {
  const result = await startLocalHttp(await fixtureStore(), { token });
  stop.push(result.close);
  return result;
}

const headers = { ...auth, "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
const body = JSON.stringify({
  id: 1, jsonrpc: "2.0", method: "initialize",
  params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "0" } },
});

describe("local Streamable HTTP MCP", () => {
  it("exposes a distinct loopback URL per listener and works with the SDK's MCP client", async () => {
    const a = await launch();
    const b = await launch();
    const url = new URL(a.url);
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.pathname).toMatch(/^\/mcp\/tesseract\/[a-f0-9]{32}$/);
    expect(a.instance).not.toBe(b.instance);
    expect(url.port).not.toBe(new URL(b.url).port);
    expect(a.url).not.toContain(token);
    const client = new Client({ name: "test", version: "0" });
    clients.push(client);
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: auth } }));
    const list = await client.listTools();
    expect(list.tools.map((tool) => tool.name)).toContain("list_published_courses");
    const result = await client.callTool({ name: "list_published_courses", arguments: {} });
    expect(result.isError).not.toBe(true);
    const call = async (name:string, args:Record<string,unknown>)=>{
      const result = await client.callTool({name,arguments:args});
      expect(result.isError).not.toBe(true);
      return JSON.parse((result.content as {text:string}[])[0]!.text);
    };
    const format = await call("classroom_format",{include_scene_schema:true});
    expect(await call("validate_course_visual",{scene:format.scene_example.data})).toMatchObject({ok:true});
    expect(await call("get_draft_status",{request_id:"check-no-scene-write"})).toMatchObject({status:"unknown"});
    expect(list.tools.map(t=>t.name)).not.toContain("publish_course");

  });

  it("routes teaching courses to Classroom without legacy creators in URL-only mode", async () => {
    const store = await fixtureStore();
    const link = await startLocalHttp(store, { token, authMode: "link" });
    stop.push(link.close);
    const normal = await launch();
    const noAuth = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
    const post = (url: string, extra = {}) => fetch(url, { method: "POST", headers: { ...noAuth, ...extra }, body });
    expect(new URL(link.url).hostname).toBe("127.0.0.1");
    expect((await post(link.url)).status).toBe(200);
    expect((await post(link.url.slice(0, -1) + (link.url.endsWith("A") ? "B" : "A"))).status).toBe(404);
    expect((await post(link.url + "?extra")).status).toBe(404);
    expect((await post(link.url, { Origin: new URL(link.url).origin })).status).toBe(403);
    const forgedHost = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(link.url, { method:"POST", headers: { ...noAuth, Host:"example.invalid" } }, res => {
        res.resume();
        resolve(res.statusCode);
      });
      req.once("error", reject);
      req.end(body);
    });
    expect(forgedHost).toBe(403);
    expect((await post(normal.url)).status).toBe(401);
    const web = new Client({name:"url-only",version:"1"});
    const standard = new Client({name:"standard",version:"1"});
    clients.push(web, standard);
    await web.connect(new StreamableHTTPClientTransport(new URL(link.url)));
    await standard.connect(new StreamableHTTPClientTransport(new URL(normal.url), { requestInit: { headers: auth } }));
    const names = (list: Awaited<ReturnType<Client["listTools"]>>) => list.tools.map(t=>t.name).sort();
    const legacy = ["create_course","create_roadmap"];
    const headerTools = names(await standard.listTools());
    expect(headerTools).toEqual(expect.arrayContaining(legacy));
    expect(names(await web.listTools())).toEqual(headerTools.filter(name=>!legacy.includes(name)));
    expect(web.getInstructions()).toMatch(/classroom_format.*submit_course_draft/s);
    for (const name of legacy) {
      const denied = await web.callTool({name,arguments:{id:"wrong-route",title:"Wrong route",phases:["unit"]}});
      expect(denied.isError).toBe(true);
    }
    const format = await web.callTool({name:"classroom_format",arguments:{}});
    expect(format.isError).not.toBe(true);
    const example=JSON.parse((format.content as {text:string}[])[0]!.text).example;
    const submit=(bundle:unknown)=>web.callTool({name:"submit_course_draft",arguments:{request_id:"url-only-classroom",bundle}});
    const draft=await submit(JSON.stringify(example));
    expect(draft.isError).not.toBe(true);
    expect(JSON.parse((draft.content as {text:string}[])[0]!.text)).toMatchObject({ok:true,status:"staged"});
    expect(await submit(example)).toEqual(draft);
    expect(store.listLearning()).toEqual([]);
    expect((await web.listTools()).tools.some(t=>t.name==="publish_course")).toBe(false);
    await web.close();
    await link.close();
    stop.shift();
    const fresh = await startLocalHttp(store, {token:randomBytes(32).toString("base64url"),authMode:"link",port:Number(new URL(link.url).port)});
    stop.push(fresh.close);
    expect(new URL(fresh.url).pathname).not.toBe(new URL(link.url).pathname);
    expect((await post(link.url)).status).toBe(404);
    expect((await post(fresh.url)).status).toBe(200);
  });

  it("rejects wrong route, missing/invalid credentials, browser origins, and bad hosts", async () => {
    const { url } = await launch();
    const forgedHost = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(url, { headers: { ...auth, Host: "untrusted.example" } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.once("error", reject);
      req.end();
    });
    expect(forgedHost).toBe(403);
    for (const origin of ["https://untrusted.example", new URL(url).origin, "null"]) {
      expect((await fetch(url, { headers: { ...auth, Origin: origin } })).status).toBe(403);
    }
    expect((await fetch(url)).status).toBe(401);
    const response = await fetch(url, { headers: { Authorization: "Bearer " + randomBytes(32).toString("base64url") } });
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain(token);
    expect((await fetch(url + "?wrong", { headers: auth })).status).toBe(404);
    expect((await fetch(url, { method: "GET", headers: { ...auth, Accept: "text/event-stream" } })).status).toBe(405);
    expect((await fetch(url, { method: "DELETE", headers: auth })).status).toBe(405);
  });

  it("bounds bodies and enforces the stateless single-message request shape", async () => {
    const { url } = await launch();
    const send = (body: BodyInit, extra = {}) => fetch(url, { method: "POST", headers: { ...headers, ...extra }, body });
    expect((await send("{")).status).toBe(400);
    expect((await send("[]")).status).toBe(400);
    expect((await send(body, { "Mcp-Session-Id": "no-session" })).status).toBe(400);
    expect((await send(body, { "Content-Type": "text/plain" })).status).toBe(415);
    expect((await send(" ".repeat(1024 * 1024 + 1))).status).toBe(413);
    const chunked = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(url, { method: "POST", headers }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.once("error", reject);
      req.write(Buffer.alloc(512 * 1024));
      req.end(Buffer.alloc(512 * 1024 + 1));
    });
    expect(chunked).toBe(413);
    expect((await send(body)).status).toBe(200);
  });

  it("refuses missing/short credentials before starting", async () => {
    const store = await fixtureStore();
    await expect(startLocalHttp(store, { token: "short" })).rejects.toThrow(/BRAIN_MCP_LOCAL_TOKEN/);
    await expect(startLocalHttp(store, { token, port: -1 })).rejects.toThrow(/--port/);
  });
});
