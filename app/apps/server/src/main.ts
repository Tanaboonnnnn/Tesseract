#!/usr/bin/env node
/**
 * node src/main.ts [--data <dir>] [--port 4320] [--lan] [--allow-host a,b] [--reset-token] [--idle-exit <min>] [--restore-preview]
 *
 * Default: listens on 127.0.0.1 only — nothing else on the network can reach it.
 * --lan:   also listens on this machine's network addresses (Wi-Fi, Tailscale) for your phone.
 *          Other devices must pair once with the access token printed at start.
 * --allow-host: extra Host names to answer to, e.g. a Tailscale name used with `tailscale serve`.
 * Env: PORT, BRAIN_DATA_DIR, BRAIN_GIT_COMMIT=1
 */
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { join, resolve } from "node:path";
import { serve } from "@hono/node-server";
import { Store } from "@tesseract/core";
import { googleService } from "@tesseract/gcal";
import { createApp } from "./app.ts";
import { windowControl } from "./window.ts";
import { remoteControl } from "./remote.ts";
import { phoneAddresses, phoneControl } from "./phone.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(name);

/** Token lives outside the repo and data folder, so it is never committed. */
function loadToken(reset: boolean): string {
  const dir = join(homedir(), ".tesseract");
  const file = join(dir, "token");
  if (!reset && existsSync(file)) {
    const saved = readFileSync(file, "utf8").trim();
    if (saved.length >= 32) return saved;
  }
  mkdirSync(dir, { recursive: true });
  const token = randomBytes(24).toString("base64url");
  writeFileSync(file, token + "\n", { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    /* Windows: ACLs of the user profile apply */
  }
  return token;
}

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i!.address);
}

const port = Number(arg("--port") ?? process.env.PORT ?? 4320);
const preview = flag("--restore-preview");
const dataDir = arg("--data");
if (preview && (!dataDir || dataDir.startsWith("--") || ["--lan", "--desktop", "--allow-host", "--reset-token"].some(flag))) {
  throw new Error("Restore preview requires explicit --data and loopback only");
}
const store = new Store({ agent: "web-ui", dataDir, gitCommit: !preview && process.env.BRAIN_GIT_COMMIT === "1" });

// Google Calendar: syncs at start and every 15 min while running (once connected).
const google = preview ? undefined : googleService(store);
google?.startAutoSync(15);

const extraHosts = (arg("--allow-host") ?? "").split(",").map((h) => h.trim()).filter(Boolean);
// Remote access (off by default): tunnel-client child process, stopped with the server.
const remote = preview ? undefined : remoteControl();
const windowCtl = preview ? undefined : windowControl();

/** LAN mode (phone & tablet). Starts from --lan; the desktop switch changes it in-process. */
const mode = { lan: flag("--lan"), addresses: [] as string[], token: undefined as string | undefined };
function setMode(lan: boolean, resetToken = false) {
  mode.lan = lan;
  mode.addresses = lan ? lanAddresses() : [];
  mode.token = lan ? loadToken(resetToken) : undefined;
}
setMode(mode.lan, flag("--reset-token"));

// Phone & tablet switch: only in the desktop app (the launcher also reads the saved choice at the next start).
const phone = flag("--desktop")
  ? phoneControl({
      state: () => ({ on: mode.lan, urls: mode.lan ? phoneAddresses(networkInterfaces()).map((a) => `http://${a}:${port}`) : [], token: mode.token }),
      // after the HTTP reply has gone out
      apply: (on) => setTimeout(() => relisten(on), 300),
    })
  : undefined;

function buildApp() {
  return createApp(store, {
    allowedHosts: [
      `localhost:${port}`,
      `127.0.0.1:${port}`,
      // Vite dev server proxies /api here.
      "localhost:5180",
      "127.0.0.1:5180",
      ...mode.addresses.map((a) => `${a}:${port}`),
      ...extraHosts,
    ],
    webDir: resolve(import.meta.dirname, "../../web/dist"),
    token: mode.token,
    google,
    window: windowCtl,
    remote,
    phone,
  });
}
let app = buildApp();
process.on("exit", () => remote?.dispose());
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => process.exit(0));

// --idle-exit <minutes>: quit after this long without requests (desktop launcher restarts it).
// An open app window pings /api/session every few minutes, so this only fires once it is closed.
const idleMinutes = Number(arg("--idle-exit") ?? 0);
let lastRequest = Date.now();
if (idleMinutes > 0) {
  setInterval(() => {
    // While remote access is on, ChatGPT needs this server even with the window closed.
    if (Date.now() - lastRequest > idleMinutes * 60_000 && !remote?.state().on) {
      console.log(`Idle for ${idleMinutes} min, exiting.`);
      process.exit(0);
    }
  }, 30_000).unref();
}
const fetch: typeof app.fetch = (req, ...rest) => {
  lastRequest = Date.now();
  return app.fetch(req, ...rest);
};

function listen() {
  const s = serve({ fetch, port, hostname: mode.lan ? "0.0.0.0" : "127.0.0.1" }, () => {
    console.log(`Tesseract → http://localhost:${port}`);
    console.log(`Data: ${store.dataDir}`);
    if (mode.lan) {
      console.log("\nOn your phone (same Wi-Fi or Tailscale):");
      for (const a of mode.addresses) console.log(`  http://${a}:${port}`);
      for (const h of extraHosts) console.log(`  https://${h}`);
      console.log(`\nAccess token (pair each device once): ${mode.token}`);
      console.log("Keep it private. New token: add --reset-token (paired devices must pair again).");
    }
  });
  return s as typeof s & { closeAllConnections?: () => void };
}
let server = listen();

/** Phone switch: rebuild the app for the new mode and listen again on the new address — no process restart. */
function relisten(lan: boolean) {
  setMode(lan);
  app = buildApp();
  const old = server;
  old.close(() => {
    server = listen();
    server.on("error", (e) => {
      // e.g. the LAN address can't be bound: fall back to this computer only, so the app keeps working
      console.error("Could not listen:", e);
      if (mode.lan) relisten(false);
    });
  });
  old.closeAllConnections?.();
}
