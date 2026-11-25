/**
 * Remote access (SPEC §7, Phase 8a): runs OpenAI's tunnel-client so ChatGPT (web/phone) can reach the
 * least-privilege "remote" MCP profile on this PC. Outbound-only: no port is opened, no public URL exists.
 *
 * Off by default; turned on for a limited time and stops by itself. Everything it needs lives in ~/.tesseract:
 *   bin/tunnel-client-runtime.exe   the official binary (downloaded once, checksum-verified, outside the repo)
 *   OS credential store      restricted Platform key (Tunnels: Read + Use); old manual key files remain supported
 *   tunnel.json               { "tunnel_id": "...", "args"?: [...] }  (args = override if the CLI flags change)
 * The key is never returned by the API, logged, or put on the command line.
 */
import { type ChildProcess, spawn as nodeSpawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { BrainError } from "@tesseract/core";
import { desktopTunnelVault, type TunnelVault } from "./tunnel-vault.ts";
import { homedir, constants as osConstants, setPriority } from "node:os";
import { join, resolve } from "node:path";

export const REMOTE_HOURS = [1, 8, 24] as const;

export interface RemoteState {
  on: boolean;
  /** ISO time it turns itself off. */
  until: string | null;
  setup: { binary: boolean; key: boolean; tunnel: boolean };
  /** Last problem (process exited, missing setup). Never contains the key. */
  error: string | null;
  verified?: boolean;
  protectedKey?: boolean;
}

export interface RemoteControl {
  state(): RemoteState;
  configure(input: { tunnelId: unknown; key: unknown }): RemoteState;
  start(hours: number): RemoteState;
  stop(): RemoteState;
  dispose(): void;
}

type Spawn = (cmd: string, args: string[], opts: { env: NodeJS.ProcessEnv }) => ChildProcess;

export interface RemoteOptions {
  dir?: string;
  appDir?: string;
  spawn?: Spawn;
  now?: () => number;
  vault?: TunnelVault;
}

const defaultSpawn: Spawn = (cmd, args, { env }) => nodeSpawn(cmd, args, { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });

/** tunnel-client's "command=..." value is split like a POSIX shell: backslashes would be eaten. */
const fwd = (p: string) => p.replaceAll("\\", "/");

/** Known failures in tunnel-client's log, turned into something the card can show. */
const PROBLEMS: [RegExp, string][] = [
  [/status 401|invalid_api_key/, "OpenAI rejected the tunnel key (401). Check the saved runtime key."],
  [/status 403/, "The key has no access to this tunnel (403). It needs Tunnels: Read + Use."],
  [/status 404/, "Tunnel not found (404). Check the saved Tunnel ID."],
  [/invalid tunnel ID/, "The tunnel ID looks wrong (it starts with tunnel_)."],
];

export function remoteControl(options: RemoteOptions = {}): RemoteControl {
  const dir = options.dir ?? join(homedir(), ".tesseract");
  const appDir = options.appDir ?? resolve(import.meta.dirname, "../../..");
  const spawn = options.spawn ?? defaultSpawn;
  const now = options.now ?? Date.now;
  const vault = options.vault ?? desktopTunnelVault(dir);
  const configPath = join(dir, "tunnel.json");
  const keyFile = join(dir, "openai-tunnel-key");
  const envKey = "TESSERACT_TUNNEL_RUNTIME_KEY";
  const slotPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  const tunnelPattern = /^tunnel_(?:(?:[a-z0-9]{4})?_)?[a-z0-9]{32}$/;
  const keyPattern = /^sk-[A-Za-z0-9_-]{17,509}$/;
  let child: ChildProcess | null = null;
  let until: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let error: string | null = null;
  let verified = false;
  let healthDir: string | undefined;
  let healthTimer: ReturnType<typeof setTimeout> | undefined;
  const clearHealth = () => {
    verified = false;
    clearTimeout(healthTimer);
    if (healthDir) {
      try { rmSync(healthDir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
    healthDir = undefined;
  };
  const checkHealth = async (source: ChildProcess, path: string) => {
    if (child !== source) return;
    let ready = false;
    try {
      const raw = readFileSync(path, "utf8").trim();
      const port = /^http:\/\/127\.0\.0\.1:(\d{1,5})\/?$/.exec(raw)?.[1];
      if (port && Number(port) > 0 && Number(port) <= 65535) {
        const res = await fetch(`http://127.0.0.1:${port}/readyz`, { redirect: "error", signal: AbortSignal.timeout(1_000) });
        ready = res.ok;
        await res.body?.cancel();
      }
    } catch { /* still starting, unavailable, or local probe rejected */ }
    if (child !== source) return;
    verified = ready;
    if (ready) error = null;
    healthTimer = setTimeout(() => void checkHealth(source, path), ready ? 5_000 : 1_000);
    healthTimer.unref();
  };

  const binary = () => {
    const bin = join(dir, "bin");
    if (!existsSync(bin)) return null;
    const name = readdirSync(bin).find((f) => /^tunnel-client(-runtime)?(\.exe)?$/i.test(f));
    return name ? join(bin, name) : null;
  };
  const legacyKey = () => {
    try {
      return readFileSync(keyFile, "utf8").trim() || null;
    } catch {
      return null;
    }
  };
  const tunnel = (): { tunnel_id: string; args?: string[]; key_slot?: string } | null => {
    try {
      const t = JSON.parse(readFileSync(configPath, "utf8"));
      return typeof t?.tunnel_id === "string" && t.tunnel_id ? t : null;
    } catch {
      return null;
    }
  };

  const state = (): RemoteState => {
    const config = tunnel();
    const protectedKey = config?.key_slot !== undefined;
    return {
      on: child !== null,
      until: child && until ? new Date(until).toISOString() : null,
      setup: { binary: binary() !== null, key: protectedKey ? slotPattern.test(config!.key_slot ?? "") : legacyKey() !== null, tunnel: config !== null },
      error,
      ...(protectedKey ? { protectedKey: true, verified } : {}),
    };
  };

  const stop = (): RemoteState => {
    clearTimeout(timer);
    clearHealth();
    const c = child;
    child = null;
    until = null;
    if (c && c.exitCode === null) c.kill();
    return state();
  };

  return {
    state,
    stop,
    configure(input) {
      if (child) throw new BrainError("CONFLICT", "Disconnect before updating the setup.");
      const id = typeof input.tunnelId === "string" ? input.tunnelId.trim() : "";
      const secret = typeof input.key === "string" ? input.key.trim() : "";
      if (!tunnelPattern.test(id)) throw new BrainError("VALIDATION", "Enter the complete Tunnel ID from OpenAI.");
      if (!keyPattern.test(secret)) throw new BrainError("VALIDATION", "Enter a restricted OpenAI runtime key.");
      const previous = tunnel()?.key_slot;
      const slot = randomUUID();
      const tmp = join(dir, `tunnel-config-${slot}.tmp`);
      try {
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        vault.save(slot, secret);
        writeFileSync(tmp, JSON.stringify({ tunnel_id: id, key_slot: slot }) + "\n", { flag: "wx", mode: 0o600 });
        renameSync(tmp, configPath);
      } catch {
        try { rmSync(tmp, { force: true }); } catch { /* best effort */ }
        try { vault.remove(slot); } catch { /* best effort */ }
        throw new BrainError("RULE", "Could not save to the operating system credential store. Unlock or enable it and try again.");
      }
      if (previous && slotPattern.test(previous)) {
        try { vault.remove(previous); } catch { /* do not discard the newly committed setup */ }
      }
      error = null;
      return state();
    },
    start(hours) {
      if (!REMOTE_HOURS.includes(hours as (typeof REMOTE_HOURS)[number])) throw new Error(`hours must be one of ${REMOTE_HOURS.join(", ")}`);
      const bin = binary();
      const t = tunnel();
      const protectedKey = t?.key_slot !== undefined;
      if (!bin || !t || (!protectedKey && !legacyKey())) {
        error = "Setup is not finished (see the checklist).";
        return state();
      }
      let secret: string | null = null;
      if (protectedKey) {
        try {
          if (slotPattern.test(t.key_slot ?? "")) secret = vault.read(t.key_slot!);
        } catch { /* never include a credential-store error in API responses */ }
        if (!secret || !keyPattern.test(secret)) {
          error = "Cannot open the saved runtime credential. Unlock the credential store or save the key again.";
          return state();
        }
      }
      stop();
      error = null;
      // The MCP server the tunnel starts: this repo's server, least-privilege profile, its own agent name.
      const cleanup = protectedKey ? ` --import data:text/javascript,delete%20process.env.${envKey}` : "";
      const mcp = `"${fwd(process.execPath)}"${cleanup} "${fwd(join(appDir, "apps", "mcp", "src", "main.ts"))}" --agent remote-chatgpt --profile remote`;
      let healthPath: string | undefined;
      if (protectedKey) {
        try {
          healthDir = mkdtempSync(join(dir, "tunnel-health-"));
          healthPath = join(healthDir, "url");
        } catch {
          error = "Could not prepare the local Tunnel status check.";
          return state();
        }
      }
      const args = (!protectedKey ? t.args : undefined) ?? [
        "run",
        "--control-plane.tunnel-id", t.tunnel_id,
        "--control-plane.api-key", protectedKey ? `env:${envKey}` : `file:${fwd(keyFile)}`,
        "--mcp.command", `command=${mcp}`,
        "--health.listen-addr", "127.0.0.1:0",
        ...(healthPath ? ["--health.url-file", fwd(healthPath), "--control-plane.base-url", "https://api.openai.com"] : []),
      ];
      const logFile = join(dir, "tunnel.log");
      {
        const env = { ...process.env };
        delete env.CONTROL_PLANE_API_KEY;
        delete env.OPENAI_API_KEY;
        delete env[envKey];
        if (protectedKey && secret) {
          env[envKey] = secret;
          env.LOG_HTTP_RAW_UNSAFE = "false";
        }
        let c: ChildProcess;
        try {
          c = spawn(bin, args, { env });
        } catch {
          clearHealth();
          error = "Could not start tunnel-client. Check the official runtime installation.";
          return state();
        }
        const report = (message: string) => {
          if (error === message) return;
          error = message;
          try { appendFileSync(logFile, `${new Date(now()).toISOString()} ${message}\n`, { mode: 0o600 }); } catch { /* best effort */ }
        };
        const onOutput = (chunk: Buffer | string) => {
          if (child !== c) return;
          for (const [re, msg] of PROBLEMS) if (re.test(chunk.toString())) report(msg);
        };
        c.stdout?.on("data", onOutput);
        c.stderr?.on("data", onOutput);
        child = c;
        if (healthPath) void checkHealth(c, healthPath);
        c.on("error", () => {
          if (child !== c) return;
          stop();
          report("Could not start tunnel-client. Check the official runtime installation.");
        });
        try {
          if (c.pid) setPriority(c.pid, osConstants.priority.PRIORITY_BELOW_NORMAL);
        } catch {
          /* not fatal */
        }
        c.on("exit", (code) => {
          if (child !== c) return; // stopped on purpose
          child = null;
          until = null;
          clearTimeout(timer);
          clearHealth();
          if (!error) report(`tunnel-client stopped (exit code ${code ?? "?"}). Check the runtime installation.`);
        });
      }
      until = now() + hours * 3_600_000;
      timer = setTimeout(stop, hours * 3_600_000);
      return state();
    },
    dispose: () => void stop(),
  };
}
