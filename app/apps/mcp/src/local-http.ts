#!/usr/bin/env node
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Store } from "@tesseract/core";
import { googleService } from "@tesseract/gcal";
import { createServer } from "./server.ts";

const HOST = "127.0.0.1";
const MAX_BODY_BYTES = 1024 * 1024;
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

function reject(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "close",
    ...(status === 401 ? { "WWW-Authenticate": 'Bearer realm="Tesseract Local MCP"' } : {}),
    ...(status === 405 ? { Allow: "POST" } : {}),
  });
  response.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message } }));
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

async function readJson(request: IncomingMessage, response: ServerResponse): Promise<{ value: unknown } | undefined> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] ?? "")) {
    reject(response, 415, "Content-Type must be application/json");
    return;
  }
  if (Number(request.headers["content-length"]) > MAX_BODY_BYTES) {
    reject(response, 413, "Request body too large");
    return;
  }
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > MAX_BODY_BYTES) {
      reject(response, 413, "Request body too large");
      return;
    }
    chunks.push(bytes);
  }
  try {
    const json = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, length));
    return { value: JSON.parse(json) as unknown };
  } catch {
    reject(response, 400, "Invalid UTF-8 JSON");
  }
}

export async function startLocalHttp(store: Store, options: { token: string; port?: number; authMode?: "header" | "link" }) {
  if (!TOKEN_FORMAT.test(options.token)) {
    throw new Error("Set BRAIN_MCP_LOCAL_TOKEN to 32 random bytes encoded as unpadded base64url.");
  }
  const port = options.port ?? 0;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new Error("--port must be an integer between 0 and 65535.");
  }
  const expectedToken = digest(options.token);
  // A routing identity, not a credential: safe to show in setup output.
  const instance = randomBytes(16).toString("hex");
  const endpoint = "/mcp/tesseract/" + instance;
  const linkMode = options.authMode === "link";
  const linkPrefix = "/mcp/tesseract/link/";
  let expectedHost = "";
  const google = googleService(store);
  const http = createHttpServer({
    maxHeaderSize: 8 * 1024,
    requestTimeout: 15_000,
    headersTimeout: 10_000,
    keepAliveTimeout: 2_000,
  }, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    void (async () => {
      if (req.socket.remoteAddress !== HOST || req.headersDistinct.host?.length !== 1 || req.headers.host !== expectedHost) {
        return reject(res, 403, "Invalid loopback host");
      }
      // Native clients do not send Origin. No browser origin is authorized.
      if (req.headersDistinct.origin) return reject(res, 403, "Browser origins are not authorized");
      if (linkMode) {
        const secret = req.url?.startsWith(linkPrefix) ? req.url.slice(linkPrefix.length) : "";
        if (!TOKEN_FORMAT.test(secret) || !timingSafeEqual(expectedToken, digest(secret))) {
          return reject(res, 404, "Unknown endpoint");
        }
      } else {
        if (req.url !== endpoint) return reject(res, 404, "Unknown endpoint");
        const auth = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(req.headers.authorization ?? "")?.[1];
        if (req.headersDistinct.authorization?.length !== 1 || !auth || !timingSafeEqual(expectedToken, digest(auth))) {
          return reject(res, 401, "Missing or invalid bearer credential");
        }
      }
      // This endpoint has no long-lived server stream or resumable sessions.
      if (req.method !== "POST") return reject(res, 405, "Use POST for stateless MCP");
      if (req.headersDistinct["mcp-session-id"]) return reject(res, 400, "This endpoint does not use MCP sessions");
      const body = await readJson(req, res);
      if (!body || res.destroyed) return;
      if (Array.isArray(body.value)) return reject(res, 400, "MCP expects one JSON-RPC message per request");
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      const mcp = createServer(store, { google, profile: "local", classroomFirst: linkMode });
      res.once("close", () => { void mcp.close().catch(() => {}); });
      await mcp.connect(transport);
      await transport.handleRequest(req, res, body.value);
    })().catch(() => {
      // SDK/tool exceptions may include request or local-data details.
      if (!res.headersSent && !res.destroyed) reject(res, 500, "Local MCP request failed");
      else if (!res.writableEnded) res.destroy();
    });
  });
  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen({ host: HOST, port, exclusive: true }, () => {
      http.off("error", reject);
      const address = http.address();
      if (!address || typeof address === "string") return reject(new Error("Local MCP was not bound to a TCP port."));
      expectedHost = HOST + ":" + address.port;
      resolve();
    });
  });
  return {
    instance,
    url: "http://" + expectedHost + (linkMode ? linkPrefix + options.token : endpoint),
    close: () => new Promise<void>((resolve, reject) => {
      http.close((error) => error ? reject(error) : resolve());
      http.closeAllConnections();
    }),
  };
}

// The desktop bundle inlines this module; its entry point must not run this CLI.
if (process.argv[1] && basename(process.argv[1]) === "local-http.ts" && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { data: { type: "string" }, port: { type: "string" }, agent: { type: "string" } } });
    const token = process.env.BRAIN_MCP_LOCAL_TOKEN ?? "";
    if (!TOKEN_FORMAT.test(token)) throw new Error("Missing valid BRAIN_MCP_LOCAL_TOKEN.");
    const local = await startLocalHttp(new Store({
      dataDir: values.data,
      agent: values.agent ?? process.env.BRAIN_AGENT ?? "mcp-local-http",
      gitCommit: process.env.BRAIN_GIT_COMMIT === "1",
    }), {
      token,
      port: values.port === undefined ? undefined : Number(values.port),
    });
    console.log("Tesseract local MCP ready: " + local.url);
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.once(signal, () => { void local.close().catch(() => { process.exitCode = 1; }); });
    }
  } catch {
    // Never echo supplied arguments or credentials from startup errors.
    console.error("Could not start local MCP. Check BRAIN_MCP_LOCAL_TOKEN, --data and --port (0–65535).");
    process.exitCode = 1;
  }
}
