/**
 * Remote access (SPEC §7, Phase 8a): runs OpenAI's tunnel-client so ChatGPT (web/phone) can reach the
 * least-privilege "remote" MCP profile on this PC. Outbound-only: no port is opened, no public URL exists.
 *
 * Off by default; turned on for a limited time and stops by itself. Everything it needs lives in ~/.panya:
 *   bin/tunnel-client-runtime.exe   the official binary (downloaded once, checksum-verified, outside the repo)
 *   openai-tunnel-key         restricted Platform key (Tunnels: Read + Use); tunnel-client reads it from the file
 *   tunnel.json               { "tunnel_id": "...", "args"?: [...] }  (args = override if the CLI flags change)
 * The key is never read into this process's output, returned by the API, logged, or put on the command line.
 */
import { type ChildProcess, spawn as nodeSpawn } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
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
}

export interface RemoteControl {
  state(): RemoteState;
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
}

const defaultSpawn: Spawn = (cmd, args, { env }) => nodeSpawn(cmd, args, { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });

/** tunnel-client's "command=..." value is split like a POSIX shell: backslashes would be eaten. */
const fwd = (p: string) => p.replaceAll("\\", "/");

/** Known failures in tunnel-client's log, turned into something the card can show. */
const PROBLEMS: [RegExp, string][] = [
  [/status 401|invalid_api_key/, "OpenAI rejected the tunnel key (401). Check ~/.panya/openai-tunnel-key."],
  [/status 403/, "The key has no access to this tunnel (403). It needs Tunnels: Read + Use."],
  [/status 404/, "Tunnel not found (404). Check the tunnel ID in ~/.panya/tunnel.json."],
  [/invalid tunnel ID/, "The tunnel ID looks wrong (it starts with tunnel_)."],
];

export function remoteControl(options: RemoteOptions = {}): RemoteControl {
  const dir = options.dir ?? join(homedir(), ".panya");
  const appDir = options.appDir ?? resolve(import.meta.dirname, "../../..");
  const spawn = options.spawn ?? defaultSpawn;
  const now = options.now ?? Date.now;
  let child: ChildProcess | null = null;
  let until: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let error: string | null = null;

  const binary = () => {
    const bin = join(dir, "bin");
    if (!existsSync(bin)) return null;
    const name = readdirSync(bin).find((f) => /^tunnel-client(-runtime)?(\.exe)?$/i.test(f));
    return name ? join(bin, name) : null;
  };
  const keyFile = join(dir, "openai-tunnel-key");
  const key = () => {
    try {
      return readFileSync(keyFile, "utf8").trim() || null;
    } catch {
      return null;
    }
  };
  const tunnel = (): { tunnel_id: string; args?: string[] } | null => {
    try {
      const t = JSON.parse(readFileSync(join(dir, "tunnel.json"), "utf8"));
      return typeof t?.tunnel_id === "string" && t.tunnel_id ? t : null;
    } catch {
      return null;
    }
  };

  const state = (): RemoteState => ({
    on: child !== null,
    until: child && until ? new Date(until).toISOString() : null,
    setup: { binary: binary() !== null, key: key() !== null, tunnel: tunnel() !== null },
    error,
  });

  const stop = (): RemoteState => {
    clearTimeout(timer);
    const c = child;
    child = null;
    until = null;
    if (c && c.exitCode === null) c.kill();
    return state();
  };

  return {
    state,
    stop,
    start(hours) {
      if (!REMOTE_HOURS.includes(hours as (typeof REMOTE_HOURS)[number])) throw new Error(`hours must be one of ${REMOTE_HOURS.join(", ")}`);
      const bin = binary();
      const k = key();
      const t = tunnel();
      if (!bin || !k || !t) {
        error = "Setup is not finished (see the checklist).";
        return state();
      }
      stop();
      error = null;
      // The MCP server the tunnel starts: this repo's server, least-privilege profile, its own agent name.
      const mcp = `"${fwd(process.execPath)}" "${fwd(join(appDir, "apps", "mcp", "src", "main.ts"))}" --agent remote-chatgpt --profile remote`;
      const args = t.args ?? [
        "run",
        "--control-plane.tunnel-id", t.tunnel_id,
        "--control-plane.api-key", `file:${fwd(keyFile)}`,
        "--mcp.command", `command=${mcp}`,
        // default health port is 8080 (often taken): use a random loopback port instead
        "--health.listen-addr", "127.0.0.1:0",
      ];
      const logFile = join(dir, "tunnel.log");
      {
        // No key in the environment: tunnel-client reads it from the file reference above.
        const env = { ...process.env };
        delete env.CONTROL_PLANE_API_KEY;
        delete env.OPENAI_API_KEY;
        const c = spawn(bin, args, { env });
        const onOutput = (chunk: Buffer | string) => {
          const text = chunk.toString();
          try {
            appendFileSync(logFile, text);
          } catch {
            /* log is best effort */
          }
          for (const [re, msg] of PROBLEMS) if (re.test(text)) error = msg;
        };
        c.stdout?.on("data", onOutput);
        c.stderr?.on("data", onOutput);
        child = c;
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
          error ??= `tunnel-client stopped (exit code ${code ?? "?"}). See ~/.panya/tunnel.log`;
        });
      }
      until = now() + hours * 3_600_000;
      timer = setTimeout(stop, hours * 3_600_000);
      return state();
    },
    dispose: () => void stop(),
  };
}
