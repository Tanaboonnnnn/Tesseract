import assert from "node:assert/strict";

const presets = [
  { id: "linear", title: "Linear", palette: "indigo" },
  { id: "notion", title: "Notion", palette: "paper" },
  { id: "editorial", title: "Warm Editorial", palette: "terracotta" },
] as const;

export async function checkLayouts(page: any, base: string) {
  await page.goto(base + "/settings");
  const group = page.getByRole("radiogroup", { name: "Layout", exact: true });
  const colours = page.getByRole("radiogroup", { name: "Colours", exact: true });
  const mode = page.locator("main").getByRole("radiogroup", { name: "Theme" });
  await group.waitFor();
  for (const label of ["Solo Leveling System", "Minimal", "Bento", "Notebook", "Terminal"]) {
    assert.equal(await group.getByText(label, { exact: true }).count(), 1, label);
  }
  const config = () => page.evaluate(() => ({
    layout: document.documentElement.dataset.ui,
    palette: document.documentElement.dataset.palette,
    mobile: innerWidth < 1024,
    validWidth: document.documentElement.scrollWidth <= innerWidth + 1,
    inset: getComputedStyle(document.querySelector(".sb-frame")!).paddingLeft,
    bg: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim(),
  }));
  const insets = new Set<string>();
  for (const look of presets) {
    await group.getByRole("radio", { name: new RegExp("^" + look.title) }).click();
    await page.waitForFunction((id: string) => document.documentElement.dataset.ui === id, look.id);
    const state = await config();
    assert.equal(state.palette, look.palette);
    assert(state.validWidth);
    insets.add(state.inset);
    for (const label of ["Light", "Dark"]) {
      await mode.getByRole("radio", { name: label, exact: true }).click();
      await page.waitForFunction((dark: boolean) => document.documentElement.classList.contains("dark") === dark, label === "Dark");
      assert((await config()).validWidth);
    }
    const nav = page.getByRole("navigation", { name: state.mobile ? "Mobile navigation" : look.title + " navigation" });
    await nav.waitFor();
    if (state.mobile) {
      await nav.getByRole("link", { name: "More" }).click();
      await page.getByRole("link", { name: "Notes" }).click();
      await page.getByRole("heading", { name: "Notes", exact: true }).waitFor();
      await nav.getByRole("link", { name: "More" }).click();
      await page.getByRole("link", { name: "Settings" }).click();
    } else {
      await nav.getByRole("link", { name: "Notes", exact: true }).click();
      await page.getByRole("heading", { name: "Notes", exact: true }).waitFor();
      await nav.getByRole("link", { name: "Settings", exact: true }).click();
    }
    await group.waitFor();
    assert.equal((await config()).layout, look.id);
  }
  if (!(await config()).mobile) assert.equal(insets.size, 3);
  assert.equal(await page.getByText("Appearance presets", { exact: true }).count(), 0);
  const oldBg = (await config()).bg;
  await colours.getByRole("radio", { name: "Crimson", exact: true }).click();
  assert.notEqual((await config()).bg, oldBg);
  assert.equal((await config()).palette, "crimson");
  await page.reload();
  await group.waitFor();
  assert.equal((await config()).layout, "editorial");
  assert.equal((await config()).palette, "crimson");
  await group.getByRole("radio", { name: /^Notebook/ }).click();
  assert.equal((await config()).layout, "notebook");
  assert.equal((await config()).palette, "crimson");
  console.log("PASS new layouts, navigation routes, light/dark, palette override, reload, and legacy layout");
}
