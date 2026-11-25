import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface TunnelVault {
  save(slot: string, secret: string): void;
  read(slot: string): string | null;
  remove(slot: string): void;
}

const fail = () => new Error("The operating system credential store is unavailable. Unlock it and try again.");
const winScript = (encrypt: boolean) =>
  '$ErrorActionPreference="Stop"; Add-Type -AssemblyName System.Security; ' +
  '$value=[Console]::In.ReadToEnd(); $scope=[System.Security.Cryptography.DataProtectionScope]::CurrentUser; ' +
  (encrypt
    ? '$bytes=[Text.Encoding]::UTF8.GetBytes($value); [Console]::Out.Write([Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Protect($bytes,$null,$scope)))'
    : '$bytes=[Convert]::FromBase64String($value); [Console]::Out.Write([Text.Encoding]::UTF8.GetString([System.Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,$scope)))');

function run(command: string, args: string[], input?: string): string {
  const res = spawnSync(command, args, { input, encoding: "utf8", windowsHide: true, timeout: 4_000, maxBuffer: 16_384 });
  // Do not expose subprocess errors or stdout/stderr on failure; they may contain secret-bearing text.
  if (res.status !== 0 || res.error) throw fail();
  return res.stdout;
}

export function desktopTunnelVault(dir: string): TunnelVault {
  const platform = process.platform;
  const windows = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const ps = (encrypt: boolean, value: string) =>
    run(windows, ["-NoProfile", "-NonInteractive", "-Command", winScript(encrypt)], value);
  const attributes = (slot: string) => ["application", "tesseract", "purpose", "openai-tunnel", "slot", slot];
  const file = (slot: string) => join(dir, `tunnel-key-${slot}.dpapi`);

  return {
    save(slot, secret) {
      if (platform === "win32") {
        const encrypted = ps(true, secret);
        if (!encrypted || encrypted === secret) throw fail();
        writeFileSync(file(slot), encrypted, { flag: "wx", mode: 0o600 });
      } else if (platform === "linux") {
        run("/usr/bin/secret-tool", ["store", "--label=Tesseract OpenAI Tunnel", ...attributes(slot)], secret);
      } else {
        throw fail();
      }
    },
    read(slot) {
      try {
        if (platform === "win32") return ps(false, readFileSync(file(slot), "utf8")) || null;
        if (platform === "linux") return run("/usr/bin/secret-tool", ["lookup", ...attributes(slot)]).trim() || null;
      } catch {
        // Fail closed if unlocked storage is unavailable or no longer tied to this user.
      }
      return null;
    },
    remove(slot) {
      if (platform === "win32") rmSync(file(slot), { force: true });
      if (platform === "linux") run("/usr/bin/secret-tool", ["clear", ...attributes(slot)]);
    },
  };
}
