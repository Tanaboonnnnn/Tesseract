#!/usr/bin/env node
/**
 * Entry point: `node src/main.ts --agent claude-code [--data <dir>] [--profile remote]`
 * Env: BRAIN_AGENT, BRAIN_DATA_DIR, BRAIN_GIT_COMMIT=1
 * stdout is the MCP protocol — log to stderr only.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Store } from "@brain/core";
import { googleService } from "@brain/gcal";
import { createServer } from "./server.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const agent = arg("--agent") ?? process.env.BRAIN_AGENT ?? "mcp";
const store = new Store({
  agent,
  dataDir: arg("--data"),
  gitCommit: process.env.BRAIN_GIT_COMMIT === "1",
});

const profile = arg("--profile") === "remote" ? "remote" : "local";
await createServer(store, { google: googleService(store), profile }).connect(new StdioServerTransport());
console.error(`panya MCP ready · agent=${agent} · profile=${profile} · data=${store.dataDir}`);
