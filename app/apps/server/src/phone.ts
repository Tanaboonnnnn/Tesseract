/**
 * Phone & tablet access for the desktop app (SPEC §7). LAN mode itself is the existing `--lan` (pairing token,
 * docs/MOBILE.md); this only makes it a switch: the choice is saved in ~/.panya/desktop.json, read by
 * scripts/launch.ps1 at the next start, and applied right away by re-listening in-process (no restart).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface PhoneControl {
  /** LAN mode is on in this running server. */
  readonly on: boolean;
  /** Addresses to open on the phone (http://ip:port). */
  readonly urls: string[];
  /** Pairing token (only ever returned to this machine). */
  readonly token?: string;
  /** Save the choice and apply it (the server switches its listening address shortly after replying). */
  set(on: boolean): void;
}

const SETTINGS = join(homedir(), ".panya", "desktop.json");

/**
 * Addresses a phone can actually reach, best first: real Wi-Fi/Ethernet, then Tailscale (100.64.0.0/10).
 * Skips link-local (169.254.*, e.g. a disconnected adapter) and virtual adapters (WSL/Hyper-V, VirtualBox, VMware).
 */
export function phoneAddresses(ifaces: Record<string, { address: string; family: string | number; internal: boolean }[] | undefined>): string[] {
  const VIRTUAL = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|Loopback|Bluetooth/i;
  const found: { address: string; rank: number }[] = [];
  for (const [name, list] of Object.entries(ifaces)) {
    for (const i of list ?? []) {
      if ((i.family !== "IPv4" && i.family !== 4) || i.internal) continue;
      const ip = i.address;
      if (ip.startsWith("169.254.") || ip.startsWith("192.168.56.") || VIRTUAL.test(name)) continue;
      const tailscale = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip);
      found.push({ address: ip, rank: tailscale ? 1 : /wi-?fi|wlan|wireless/i.test(name) ? 0 : 0.5 });
    }
  }
  return found.sort((x, y) => x.rank - y.rank).map((f) => f.address);
}

export function readDesktopSettings(file = SETTINGS): { lan?: boolean } {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

/**
 * The switch. The server applies it in-process (it re-listens on the new address within a second), so nothing
 * restarts: the app window keeps working and Remote access stays on. The choice is also saved for the next start.
 */
export function phoneControl(opts: { state: () => { on: boolean; urls: string[]; token?: string }; apply: (on: boolean) => void; settingsFile?: string }): PhoneControl {
  const file = opts.settingsFile ?? SETTINGS;
  return {
    get on() {
      return opts.state().on;
    },
    get urls() {
      return opts.state().urls;
    },
    get token() {
      return opts.state().token;
    },
    set(on) {
      mkdirSync(join(file, ".."), { recursive: true });
      writeFileSync(file, JSON.stringify({ ...readDesktopSettings(file), lan: on }, null, 2));
      if (on !== opts.state().on) opts.apply(on);
    },
  };
}
