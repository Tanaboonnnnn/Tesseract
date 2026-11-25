import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

function setup(complete = true, vault = new Map<string, string>()) {
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
    vault: {
      save: (slot, secret) => void vault.set(slot, secret),
      read: (slot) => vault.get(slot) ?? null,
      remove: (slot) => void vault.delete(slot),
    },
    appDir: "C:/app",
    now: () => Date.UTC(2026, 10, 25, 12),
    spawn: (cmd, args, { env }) => {
      calls.push({ cmd, args, env });
      const c = fakeChild();
      children.push(c);
      return c as never;
    },
  });
  return { dir, remote, calls, children, vault };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

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

const TUNNEL_ID = "tunnel_" + "a".repeat(32);

describe("protected tunnel setup", () => {
  it("stores the key only in the injected vault and refuses an implicit legacy downgrade", () => {
    const { remote, vault, calls, dir } = setup(false);
    mkdirSync(join(dir, "bin"));
    writeFileSync(join(dir, "bin", "tunnel-client-runtime.exe"), "");
    const status = remote.configure({ tunnelId: TUNNEL_ID, key: KEY });
    expect(status.setup).toEqual({ binary: true, key: true, tunnel: true });
    expect(JSON.stringify(status)).not.toContain(KEY);
    expect(existsSync(join(dir, "openai-tunnel-key"))).toBe(false);
    expect(readFileSync(join(dir, "tunnel.json"), "utf8")).not.toContain(KEY);
    expect([...vault.values()]).toEqual([KEY]);
    expect(remote.start(1).on).toBe(true);
    expect(calls[0]!.args.join(" ")).not.toContain(KEY);
    expect(calls[0]!.args).toContain("env:TESSERACT_TUNNEL_RUNTIME_KEY");
    expect(calls[0]!.env.TESSERACT_TUNNEL_RUNTIME_KEY).toBe(KEY);
    expect(calls[0]!.args.join(" ")).toContain("delete%20process.env.TESSERACT_TUNNEL_RUNTIME_KEY");
    remote.stop();
    vault.clear();
    writeFileSync(join(dir, "openai-tunnel-key"), "stale-legacy-key");
    expect(remote.start(1).on).toBe(false);
    expect(remote.state().error).toMatch(/credential/i);
    expect(calls).toHaveLength(1);
  });

  it("does not rewrite a valid configuration for invalid inputs, active sessions or failed storage", () => {
    const { remote, dir, vault } = setup();
    const path = join(dir, "tunnel.json");
    const original = readFileSync(path, "utf8");
    expect(() => remote.configure({ tunnelId: "bad", key: KEY })).toThrow(/Tunnel ID/);
    expect(() => remote.configure({ tunnelId: TUNNEL_ID, key: "bad" })).toThrow(/runtime key/i);
    remote.start(1);
    expect(() => remote.configure({ tunnelId: TUNNEL_ID, key: KEY })).toThrow(/Disconnect/);
    remote.stop();
    expect(vault.size).toBe(0);
    expect(readFileSync(path, "utf8")).toBe(original);
    const locked = remoteControl({ dir, vault: { save: () => { throw new Error(KEY); }, read: () => null, remove() {} } });
    expect(() => locked.configure({ tunnelId: TUNNEL_ID, key: KEY })).toThrow(/credential/i);
    expect(readFileSync(path, "utf8")).toBe(original);
  });

  it("verifies only the loopback readiness endpoint and clears its marker on stop", async () => {
    vi.useFakeTimers();
    const { remote, calls } = setup();
    const request = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", request);
    remote.configure({ tunnelId: TUNNEL_ID, key: KEY });
    expect(remote.start(1).verified).toBe(false);
    const args = calls[0]!.args;
    const health = args[args.indexOf("--health.url-file") + 1]!;
    writeFileSync(health, "http://192.0.2.70:1234");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(request).not.toHaveBeenCalled();
    writeFileSync(health, "http://127.0.0.1:1234");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(request).toHaveBeenCalledWith("http://127.0.0.1:1234/readyz", expect.objectContaining({ redirect: "error" }));
    expect(remote.state().verified).toBe(true);
    expect(remote.stop().verified).toBe(false);
    expect(existsSync(health)).toBe(false);
  });

  it("does not persist raw child output and ignores late failures from a stopped child", () => {
    const { remote, children, dir } = setup();
    remote.configure({ tunnelId: TUNNEL_ID, key: KEY });
    remote.start(1);
    children[0]!.stderr.emit("data", "unknown failure " + KEY);
    children[0]!.stderr.emit("data", "status 403 " + KEY);
    const log = join(dir, "tunnel.log");
    if (existsSync(log)) expect(readFileSync(log, "utf8")).not.toContain(KEY);
    remote.stop();
    children[0]!.emit("error", new Error(KEY));
    expect(JSON.stringify(remote.state())).not.toContain(KEY);
  });
});
