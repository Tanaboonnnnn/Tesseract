import assert from "node:assert/strict";

const looks = [
  { id: "graphite", name: "Graphite" }, { id: "pine", name: "Pine" },
  { id: "clay", name: "Clay" }, { id: "plum", name: "Plum" },
];
function contrast(a: string, b: string) {
  const luminance = (x: string) => {
    assert.match(x, /^#[\da-f]{6}$/i, "tokens must resolve to tested hex colours");
    const rgb = x.slice(1).match(/../g)!.map((v) => parseInt(v, 16) / 255)
      .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export async function checkAppearance(page: any, base: string) {
  await page.goto(base + "/settings");
  const layout = page.getByRole("radiogroup", { name: "Layout" });
  await layout.getByRole("radio", { name: /^Minimal/ }).click();
  const colours = page.getByRole("radiogroup", { name: "Colours" });
  await colours.getByRole("radio", { name: "Sepia" }).click();
  const mode = page.locator("main").getByRole("radiogroup", { name: "Theme" });
  const read = () => page.evaluate(() => {
    const root = document.documentElement;
    const css = getComputedStyle(root);
    const cssVar = (name: string) => css.getPropertyValue(name).trim();
    const main = document.querySelector("main")!;
    const frame = main.getBoundingClientRect();
    return {
      layout: root.dataset.ui, appearance: root.dataset.appearance, palette: root.dataset.palette,
      dark: root.classList.contains("dark"), bg: cssVar("--bg"), panel: cssVar("--panel-solid"),
      cta: cssVar("--color-accent-600"), chart: cssVar("--chart-accent"),
      chartText: cssVar("--chart-text"), sidebar: cssVar("--color-sidebar"),
      navFg: cssVar("--color-sky-50"), font: getComputedStyle(main).getPropertyValue("--font-display").trim(),
      radius: getComputedStyle(main.querySelector(".panel")!).borderTopLeftRadius,
      frame: [frame.x + scrollX, frame.y + scrollY, frame.width],
    };
  });
  const group = page.getByRole("group", { name: "Appearance presets" });
  const distinct = new Set<string>();
  for (const label of ["Light", "Dark"]) {
    await mode.getByRole("radio", { name: label, exact: true }).click();
    const isDark = label === "Dark";
    await page.waitForFunction((dark: boolean) => document.documentElement.classList.contains("dark") === dark, isDark);
    const original = await read();
    for (const look of looks) {
      await group.getByRole("radio", { name: look.name, exact: true }).check();
      const actual = await read();
      assert.equal(actual.appearance, look.id);
      assert.equal(actual.layout, "minimal");
      assert.equal(actual.dark, isDark);
      assert.notEqual(actual.bg, original.bg);
      assert.notEqual(actual.font, original.font);
      assert.match(actual.radius, /^(4|12|16|20)px$/);
      assert.deepEqual(actual.frame, original.frame);
      assert(contrast(actual.cta, "#ffffff") >= 4.5, look.name + " solid button text");
      assert(contrast(actual.chartText, actual.panel) >= 4.5, look.name + " chart labels");
      assert(contrast(actual.chart, actual.panel) >= 3, look.name + " chart mark");
      assert(contrast(actual.navFg, actual.sidebar) >= 4.5, look.name + " sidebar text");
      distinct.add(actual.bg);
    }
    await group.getByRole("radio", { name: "Original", exact: true }).check();
    assert.deepEqual(await read(), original);
  }
  assert.equal(distinct.size, 8);
  await group.getByRole("radio", { name: "Pine", exact: true }).check();
  const pine = await read();
  await page.reload();
  await group.getByRole("radio", { name: "Pine", exact: true }).waitFor();
  assert.deepEqual(await read(), pine);
  await colours.getByRole("radio", { name: "Crimson" }).click();
  assert.equal((await read()).appearance, undefined);
  assert.equal((await read()).palette, "crimson");
  console.log("PASS four appearance presets in Light/Dark, contrast, fixed layout, persistence, original/custom palette");
}
