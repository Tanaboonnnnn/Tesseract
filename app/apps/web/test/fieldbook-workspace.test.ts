import { describe, expect, it } from "vitest";
import { fieldbookPage } from "../src/lib/fieldbook-workspace.ts";
import { parsePlaybackRate, remainingAfterPlayback, wallTimeAtRate } from "../src/components/visuals/playback-rate.ts";

describe("Fieldbook workspace", () => {
  it("names the route groups without exposing IDs as labels", () => {
    expect(fieldbookPage("/")).toEqual({ title: "Home", section: "today", to: "/" });
    expect(fieldbookPage("/learning/classroom/cnsf-test")).toEqual({ title: "Learning", section: "library", to: "/learning" });
    expect(fieldbookPage("/skills")).toEqual({ title: "Skills", section: "progress", to: "/skills" });
    expect(fieldbookPage("/learning-other")).toEqual({ title: "Workspace", section: "workspace", to: "/" });
  });
});

describe("playback rate", () => {
  it("only accepts the supported device rates", () => {
    expect([null, "2", "1.5", "0.5", "4", "junk"].map(parsePlaybackRate)).toEqual([1, 2, 1.5, .5, 1, 1]);
  });
  it("preserves logical playhead progress when changing rate", () => {
    const left = remainingAfterPlayback(2400, 900, 1.5);
    expect(left).toBe(1050);
    expect(wallTimeAtRate(left, .5)).toBe(2100);
    expect(wallTimeAtRate(left, 2)).toBe(525);
    expect(remainingAfterPlayback(1000, 800, 2)).toBe(0);
  });
});
