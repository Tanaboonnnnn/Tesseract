#!/usr/bin/env node
/**
 * Entry point: `node src/main.ts --agent claude-code [--data <dir>] [--profile local|remote|classroom]`
 * Env: BRAIN_AGENT, BRAIN_DATA_DIR, BRAIN_GIT_COMMIT=1
 * stdout is the MCP protocol — log to stderr only.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Store } from "@tesseract/core";
import { googleService } from "@tesseract/gcal";
import { createServer } from "./server.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const agent = arg("--agent") ?? process.env.BRAIN_AGENT ?? "mcp";
const dataDir = arg("--data");
const profile = arg("--profile") ?? "local";
if (profile !== "local" && profile !== "remote" && profile !== "classroom") throw new Error("Unknown MCP profile");
if (profile === "classroom" && !dataDir) throw new Error("Classroom testing requires an explicit isolated --data directory");
const store = new Store({
  agent,
  dataDir,
  gitCommit: process.env.BRAIN_GIT_COMMIT === "1",
});

await createServer(store, { google: googleService(store), profile }).connect(new StdioServerTransport());
console.error(`tesseract MCP ready · agent=${agent} · profile=${profile} · data=${store.dataDir}`);
