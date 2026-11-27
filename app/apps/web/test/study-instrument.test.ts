import { expect, test, vi } from "vitest";
import * as workspace from "../src/lib/fieldbook-workspace.ts";

test("Study Instrument groups all workspace routes and preserves active detail navigation", () => {
  const examples = [
    ["/", "desk", "/"], ["/schedule", "desk", "/schedule"], ["/projects/demo", "desk", "/projects"],
    ["/learning/classroom/course", "study", "/learning"], ["/skills", "study", "/skills"],
    ["/quizzes/take", "study", "/quizzes"], ["/notes/demo", "study", "/notes"],
    ["/learning/course/visuals/example", "study", "/learning"], ["/activity", "system", "/activity"],
    ["/guide", "system", "/guide"], ["/settings", "system", "/settings"], ["/unmatched", "desk", "/"],
  ] as const;
  for (const [path, mode, route] of examples) expect(workspace.instrumentLocation(path)).toMatchObject({ mode, to: route });
  expect(workspace.usesReadingLayout("instrument")).toBe(true);
  expect(workspace.usesReadingLayout("fieldbook")).toBe(true);
  expect(workspace.usesReadingLayout("notebook")).toBe(false);
});

test("selecting Study Instrument and pairing support independent palette overrides", async () => {
  const data = new Map<string,string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string,v: string) => data.set(k,v), removeItem: (k: string) => data.delete(k) });
  vi.stubGlobal("document", { documentElement: { setAttribute: vi.fn(), removeAttribute: vi.fn() } });
  try {
    const theme = await import("../src/lib/theme.ts");
    expect(theme.LAYOUTS.find(x=>x.id==="instrument")?.name).toBe("Study Instrument");
    theme.selectLayout("instrument");
    expect(data.get("sb-ui")).toBe("instrument");
    expect(data.get("sb-palette")).toBe("instrument-paper");
    theme.palettePref.set("crimson");
    theme.selectLayout("instrument");
    expect(data.get("sb-palette")).toBe("crimson");
    theme.applyPairedAppearance("instrument","instrument-paper");
    expect(data.get("sb-ui")).toBe("instrument");
    expect(data.get("sb-palette")).toBe("instrument-paper");
  } finally {
    vi.unstubAllGlobals();
  }
});
