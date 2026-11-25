import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { remoteControl } from "../src/remote.ts";

const KEY = "sk-test-secret-key-do-not-log";

function fakeChild() {
  const c = new EventEmitter() as EventEmitter & { pid: number; exitCode: number | null; kill: () => void; killed: boolean; stdout: EventEmitter; stderr: EventEmitter };
  c.stdout = new EventEmitter();
  c.stderr = new EventEmitter();
  c.pid = 0; // 0 = skip setPriority
  c.exitCode = null;
  c.killed = false;
  c.kill = () => {
    c.killed = true;
    c.exitCode = 0;
  };
  return c;
}

function setup(complete = true) {
  const dir = mkdtempSync(join(tmpdir(), "brain-remote-"));
  if (complete) {
    mkdirSync(join(dir, "bin"));
    writeFileSync(join(dir, "bin", "tunnel-client-runtime.exe"), "");
    writeFileSync(join(dir, "openai-tunnel-key"), `${KEY}\n`);
    writeFileSync(join(dir, "tunnel.json"), JSON.stringify({ tunnel_id: "tun_123" }));
  }
  const calls: { cmd: string; args: string[]; env: NodeJS.ProcessEnv }[] = [];
  const children: ReturnType<typeof fakeChild>[] = [];
  const remote = remoteControl({
    dir,
    appDir: "C:/app",
    now: () => Date.UTC(2026, 10, 25, 12),
    spawn: (cmd, args, { env }) => {
      calls.push({ cmd, args, env });
      const c = fakeChild();
      children.push(c);
      return c as never;
    },
  });
  return { dir, remote, calls, children };
}

afterEach(() => vi.useRealTimers());

describe("remote access runner", () => {
  it("is off by default and reports missing setup without starting anything", () => {
    const { remote, calls } = setup(false);
    expect(remote.state()).toEqual({ on: false, until: null, setup: { binary: false, key: false, tunnel: false }, error: null });
    expect(remote.start(1).on).toBe(false);
    expect(remote.state().error).toMatch(/Setup is not finished/);
    expect(calls).toHaveLength(0);
  });

  it("starts tunnel-client with the remote profile; the key is passed as a file reference only", () => {
    const { remote, calls, dir } = setup();
    const s = remote.start(8);
    expect(s).toMatchObject({ on: true, until: "2026-11-25T20:00:00.000Z", setup: { binary: true, key: true, tunnel: true }, error: null });
    const { cmd, args, env } = calls[0]!;
    expect(cmd).toMatch(/tunnel-client-runtime\.exe$/);
    expect(args.slice(0, 3)).toEqual(["run", "--control-plane.tunnel-id", "tun_123"]);
    expect(args).toContain(`file:${join(dir, "openai-tunnel-key").replaceAll("\\", "/")}`);
    expect(args).toContain("127.0.0.1:0");
    const mcp = args[args.indexOf("--mcp.command") + 1]!;
    expect(mcp).toMatch(/^command="[^"\\]+" "C:\/app\/apps\/mcp\/src\/main\.ts" --agent remote-chatgpt --profile remote$/);
    expect(args.join(" ")).not.toContain(KEY);
    expect(env.CONTROL_PLANE_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(JSON.stringify(remote.state())).not.toContain(KEY);
  });

  it("stops by itself when the time is up, and on stop()", () => {
    vi.useFakeTimers();
    const { remote, children } = setup();
    remote.start(1);
    vi.advanceTimersByTime(3_600_000);
    expect(remote.state().on).toBe(false);
    expect(children[0]!.killed).toBe(true);

    remote.start(1);
    expect(remote.stop().on).toBe(false);
    expect(children[1]!.killed).toBe(true);
  });

  it("turns known tunnel-client errors into a readable message", () => {
    const { remote, children } = setup();
    remote.start(1);
    children[0]!.stdout.emit("data", "WARN poll failed error=\"unexpected status 401: invalid_api_key: Incorrect API key provided: sk-proj-****abcd\"");
    expect(remote.state()).toMatchObject({ on: true, error: expect.stringMatching(/rejected the tunnel key \(401\)/) });
  });

  it("reports when the process dies on its own", () => {
    const { remote, children } = setup();
    remote.start(1);
    children[0]!.emit("exit", 1);
    expect(remote.state()).toMatchObject({ on: false, error: expect.stringMatching(/exit code 1/) });
  });

  it("accepts only 1, 8 or 24 hours and honours an args override", () => {
    const { remote, dir, calls } = setup();
    expect(() => remote.start(3)).toThrow(/1, 8, 24/);
    writeFileSync(join(dir, "tunnel.json"), JSON.stringify({ tunnel_id: "tun_123", args: ["run", "--profile", "brain"] }));
    remote.start(1);
    expect(calls[0]!.args).toEqual(["run", "--profile", "brain"]);
    expect(readFileSync(join(dir, "tunnel.json"), "utf8")).not.toContain(KEY);
  });
});
