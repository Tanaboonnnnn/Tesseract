/** MCP round-trips for in-memory or real local stdio transport. No cloud tunnel or real data. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { performance } from "node:perf_hooks";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Store } from "@tesseract/core";
import { createServer, type ServerOptions } from "./server.ts";

const data = mkdtempSync(join(tmpdir(), "tesseract-bench-"));
const n = 35;
const viaStdio = process.argv.includes("--stdio");
const stats = (a: number[]) => { const v = [...a].sort((x,y) => x-y); return { p50_ms: Number(v[Math.floor(v.length * .5)]!.toFixed(3)), p95_ms: Number(v[Math.floor(v.length * .95)]!.toFixed(3)) }; };
async function run(profile: ServerOptions["profile"], f: (call: Client["callTool"]) => Promise<unknown>) {
  const client = new Client({ name: "benchmark", version: "1" });
  const startConnect = performance.now();
  const server = viaStdio ? null : createServer(new Store({ dataDir: data, agent: "benchmark" }), { profile });
  if (server) {
    const [a,b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
  } else {
    await client.connect(new StdioClientTransport({
      command: process.execPath, args: [join(import.meta.dirname, "main.ts"), "--data", data, "--profile", profile ?? "local", "--agent", "benchmark"],
      stderr: "pipe",
    }));
  }
  const connect_ms = Number((performance.now() - startConnect).toFixed(3));
  try {
    const start = performance.now(), tools = (await client.listTools()).tools;
    const listing_ms = performance.now() - start;
    const measured = [];
    for (let i=0; i<n+5; i++) {
      const s = performance.now(); await f(client.callTool.bind(client)); if(i>=5) measured.push(performance.now()-s);
    }
    return { profile, connect_ms, tool_count: tools.length, listing_bytes: Buffer.byteLength(JSON.stringify(tools)), listing_ms: Number(listing_ms.toFixed(3)), calls: n, ...stats(measured) };
  } finally { await client.close(); await server?.close(); }
}
try {
  const bundle = {
    schema_version: 1, course_id: "synthetic-test-only", title: "Synthetic", language: "en",
    sources: [{ id: "ref", title: "Test", url: "https://example.com/test", accessed_on: "2026-01-01", rights: "reference-only", summary: "Test only." }],
    lessons: [{ id: "one", title: "Test", objective: "Test round trip", source_ids: ["ref"], blocks: [{ type: "text", markdown: "Placeholder" }] }],
  };
  const remote = await run("remote", async (call) => {
    if ((await call({ name: "list_learning" })).isError) throw new Error("Legacy benchmarking call failed");
  });
  let previous: string | undefined;
  let i = 0;
  const classroom = await run("classroom", async (call) => {
    const r = await call({ name: "submit_course_draft", arguments: { request_id: "bench_" + (++i), base_revision: previous, bundle } });
    const v = JSON.parse((r.content as { text: string }[])[0]!.text);
    if (r.isError || !v.ok) throw new Error("Draft benchmarking call failed");
    previous = v.revision_id;
  });
  const receipt = await run("classroom", async (call) => {
    const r = await call({ name: "get_draft_status", arguments: { request_id: "bench_1" } });
    if (r.isError || JSON.parse((r.content as { text: string }[])[0]!.text).status !== "staged") throw new Error("Receipt benchmark failed");
  });
  console.log(JSON.stringify({ measurement: viaStdio ? "local_stdio_transport" : "local_in_memory_transport", remote_empty_learning: remote, classroom_stage: classroom, classroom_receipt: receipt }, null, 2));
} finally { rmSync(data, { recursive: true, force: true }); }
