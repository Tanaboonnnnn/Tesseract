/**
 * Desktop window opacity (Windows only): runs scripts/window-opacity.ps1 against the app window and saves the
 * value in ~/.panya/window.json, which the launcher applies every time the window opens.
 * The blending itself is done by the Windows compositor: no memory or CPU cost after the call.
 */
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const MIN_WINDOW_OPACITY = 50;

export interface WindowControl {
  get(): number;
  set(percent: number): Promise<number>;
}

const SETTINGS = join(homedir(), ".panya", "window.json");

export function windowControl(): WindowControl | undefined {
  const script = resolve(import.meta.dirname, "../../../scripts/window-opacity.ps1");
  if (process.platform !== "win32" || !existsSync(script)) return undefined;
  return {
    get() {
      try {
        const v = Number(JSON.parse(readFileSync(SETTINGS, "utf8")).opacity);
        return Number.isFinite(v) ? v : 100;
      } catch {
        return 100;
      }
    },
    set(percent) {
      const p = Math.round(Math.max(MIN_WINDOW_OPACITY, Math.min(100, percent)));
      return new Promise((done, fail) =>
        execFile(
          "powershell.exe",
          ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "-Percent", String(p), "-Save"],
          { windowsHide: true, timeout: 20_000 },
          (err) => (err ? fail(err) : done(p)),
        ),
      );
    },
  };
}
