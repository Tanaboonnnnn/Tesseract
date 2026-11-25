import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { phoneAddresses, phoneControl } from "../src/phone.ts";

const v4 = (address: string) => ({ address, family: "IPv4", internal: false });

describe("phoneAddresses", () => {
  it("keeps reachable addresses, Wi-Fi first, Tailscale after; drops link-local and virtual adapters", () => {
    expect(
      phoneAddresses({
        Tailscale: [v4("169.254.83.107")],
        "Ethernet 2": [v4("192.168.56.1")],
        "Wi-Fi": [v4("192.168.1.23")],
        "vEthernet (WSL (Hyper-V firewall))": [v4("172.27.32.1")],
        Loopback: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
      }),
    ).toEqual(["192.168.1.23"]);
    expect(phoneAddresses({ Tailscale: [v4("100.101.5.9")], Ethernet: [v4("10.0.0.7")], "Wi-Fi": [v4("192.168.1.23")] })).toEqual([
      "192.168.1.23",
      "10.0.0.7",
      "100.101.5.9",
    ]);
  });
});

describe("phoneControl", () => {
  it("saves the choice and applies it in place only when it changes (no restart)", () => {
    const file = join(mkdtempSync(join(tmpdir(), "sbh-phone-")), "desktop.json");
    writeFileSync(file, JSON.stringify({ other: 1 }));
    const state = { on: false, urls: [] as string[], token: undefined as string | undefined };
    const applied: boolean[] = [];
    const p = phoneControl({ state: () => state, apply: (on) => void applied.push(on), settingsFile: file });

    p.set(false); // already off
    expect(applied).toEqual([]);
    p.set(true);
    expect(applied).toEqual([true]);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ other: 1, lan: true });

    // live state: the getters follow the server's current mode
    Object.assign(state, { on: true, urls: ["http://192.168.1.23:4310"], token: "t".repeat(32) });
    expect([p.on, p.urls, p.token]).toEqual([true, ["http://192.168.1.23:4310"], "t".repeat(32)]);
  });
});
