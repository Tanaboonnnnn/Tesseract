/**
 * Token cost, measured for real: runs this MCP server in memory, lists the tools and calls a few read-only
 * tools on the user's data, then counts what an AI client would receive. Used by the Guide page.
 * Estimate: tokens ≈ characters ÷ 4 (typical for English/JSON; exact counts vary by model).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Store } from "@tesseract/core";
import { createServer } from "./server.ts";

export const CHARS_PER_TOKEN = 4;
const tokens = (chars: number) => Math.round(chars / CHARS_PER_TOKEN);

export interface TokenReport {
  chars_per_token: number;
  /** Paid once per session: the tool list + server instructions. */
  session: { tools: number; tool_list: number; instructions: number; biggest: { name: string; tokens: number }[] };
  /** Typical read calls on the user's data. */
  calls: { tool: string; args: Record<string, string>; tokens: number }[];
  /** Same project: files on disk vs what get_project sends. */
  compare: { project: string; raw_files: number; tool_answer: number } | null;
}

export async function measureTokens(store: Store): Promise<TokenReport> {
  const server = createServer(store);
  const client = new Client({ name: "guide-measure", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  try {
    const { tools } = await client.listTools();
    const size = (x: unknown) => JSON.stringify(x).length;
    const biggest = tools
      .map((t) => ({ name: t.name, tokens: tokens(size(t)) }))
      .sort((x, y) => y.tokens - x.tokens)
      .slice(0, 5);

    // Pick real ids so the numbers reflect this user's data. Read-only tools only.
    const projects = store.listProjects();
    const mapped = projects.find((p) => store.getProjectMap(p.id)) ?? projects[0];
    const learning = store.listLearning().sort((x, y) => y.topics.length - x.topics.length)[0];
    const plan: [string, Record<string, string>][] = [
      ["get_overview", {}],
      ["list_projects", {}],
      ...(mapped ? ([["get_project", { id: mapped.id }], ["get_project_map", { project: mapped.id }]] as [string, Record<string, string>][]) : []),
      ["list_learning", {}],
      ["visual_formats", {type:"iso",pack:"network"}],
      ...(learning ? ([["get_learning", { id: learning.id }]] as [string, Record<string, string>][]) : []),
      ["get_review_queue", {}],
      ["get_schedule", {}],
    ];
    const calls = [];
    let projectAnswer = 0;
    for (const [tool, args] of plan) {
      const res = await client.callTool({ name: tool, arguments: args });
      const text = (res.content as { type: string; text?: string }[]).map((c) => c.text ?? "").join("");
      calls.push({ tool, args, tokens: tokens(text.length) });
      if (tool === "get_project") projectAnswer = tokens(text.length);
    }

    let compare: TokenReport["compare"] = null;
    if (mapped) {
      const dir = join(store.dataDir, "projects", mapped.id);
      const raw = ["project.md", "tasks.yaml"].reduce((n, f) => {
        try {
          return n + readFileSync(join(dir, f), "utf8").length;
        } catch {
          return n;
        }
      }, 0);
      compare = { project: mapped.id, raw_files: tokens(raw), tool_answer: projectAnswer };
    }

    return {
      chars_per_token: CHARS_PER_TOKEN,
      session: { tools: tools.length, tool_list: tokens(size(tools)), instructions: tokens((client.getInstructions() ?? "").length), biggest },
      calls,
      compare,
    };
  } finally {
    await client.close();
    await server.close();
  }
}
