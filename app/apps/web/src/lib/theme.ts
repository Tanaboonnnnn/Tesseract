import { useEffect, useState, useSyncExternalStore } from "react";

export type ThemePref = "light" | "dark" | "system";
const KEY = "theme";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

export function readTheme(): ThemePref {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "system";
}

/** Same logic as the inline script in index.html (runs before first paint). */
export function applyTheme(pref: ThemePref): void {
  const dark = pref === "dark" || (pref === "system" && media().matches);
  document.documentElement.classList.toggle("dark", dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#030817" : "#edf3ff");
}

export function useTheme(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(readTheme);

  useEffect(() => {
    applyTheme(pref);
    if (pref !== "system") return;
    const m = media();
    const onChange = () => applyTheme("system");
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, [pref]);

  const set = (p: ThemePref) => {
    if (p === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, p);
    setPref(p);
  };
  return [pref, set];
}

/* ---------- Layout (UI theme) and colours: two independent choices ---------- */

export const LAYOUTS = [
  { id: "system", name: "Solo Leveling System", hint: "Sidebar + glowing HUD windows with corner brackets", palette: "blue" },
  { id: "minimal", name: "Minimal", hint: "Top bar, whitespace, hairlines, calm type", palette: "neutral" },
  { id: "bento", name: "Bento", hint: "Icon rail, rounded tiles, big numbers, progress rings", palette: "aurora" },
  { id: "notebook", name: "Notebook", hint: "Paper index cards, ruled lines, bookmark tabs", palette: "sepia" },
  { id: "terminal", name: "Terminal", hint: "Monospace console, boxed panes, status bar", palette: "amber" },
] as const;
export type LayoutId = (typeof LAYOUTS)[number]["id"];

export const PALETTES = [
  { id: "blue", name: "System Blue", swatch: ["#030817", "#38bdf8", "#1f6fe5"] },
  { id: "aurora", name: "Aurora", swatch: ["#060312", "#2dd4bf", "#8b5cf6"] },
  { id: "crimson", name: "Crimson", swatch: ["#0c0306", "#f43f5e", "#fbbf24"] },
  { id: "sepia", name: "Sepia", swatch: ["#f4ede0", "#8b5a2b", "#d6a35e"] },
  { id: "neutral", name: "Neutral", swatch: ["#f7f7f8", "#18181b", "#2563eb"] },
  { id: "amber", name: "Amber CRT", swatch: ["#0a0700", "#ffb000", "#ffd27a"] },
] as const;
export type PaletteId = (typeof PALETTES)[number]["id"];

export const APPEARANCES = [
  { id: "original", name: "Original", hint: "Keep your own colour palette", swatch: null },
  { id: "graphite", name: "Graphite", hint: "Cool grey, crisp edges", swatch: ["#171a20", "#f3f5f7", "#434f5e"] },
  { id: "pine", name: "Pine", hint: "Forest green, soft edges", swatch: ["#111e18", "#eef5ee", "#276348"] },
  { id: "clay", name: "Clay", hint: "Warm cream, editorial headings", swatch: ["#241713", "#f8eee5", "#91462f"] },
  { id: "plum", name: "Plum", hint: "Muted violet, rounded cards", swatch: ["#201724", "#f5eef6", "#754b7f"] },
] as const;
export type AppearanceId = (typeof APPEARANCES)[number]["id"];

/** A setting saved per device, shared by every component (useSyncExternalStore). */
function pref<T extends string>(key: string, values: readonly T[], fallback: T, apply: (v: T) => void) {
  const listeners = new Set<() => void>();
  const read = (): T => {
    const v = localStorage.getItem(key);
    return (values as readonly string[]).includes(v ?? "") ? (v as T) : fallback;
  };
  let value = read();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      if (next === fallback) localStorage.removeItem(key);
      else localStorage.setItem(key, next);
      apply(next);
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

const attr = (name: string, fallback: string) => (v: string) =>
  v === fallback ? document.documentElement.removeAttribute(name) : document.documentElement.setAttribute(name, v);

// One-time migration from the colour-only themes (sb-style). The inline script in index.html does the same.
const OLD: Record<string, PaletteId> = { aurora: "aurora", crimson: "crimson", paper: "sepia", minimal: "neutral" };
const old = localStorage.getItem("sb-style");
if (old) {
  if (OLD[old] && !localStorage.getItem("sb-palette")) localStorage.setItem("sb-palette", OLD[old]);
  localStorage.removeItem("sb-style");
}

export const layoutPref = pref<LayoutId>("sb-ui", LAYOUTS.map((l) => l.id), "system", attr("data-ui", "system"));
export const appearancePref = pref<AppearanceId>("sb-appearance", APPEARANCES.map((p) => p.id), "original", attr("data-appearance", "original"));
export const palettePref = pref<PaletteId>("sb-palette", PALETTES.map((p) => p.id), "blue", attr("data-palette", "blue"));

export function useLayout(): [LayoutId, (v: LayoutId) => void] {
  return [useSyncExternalStore(layoutPref.subscribe, layoutPref.get), layoutPref.set];
}
function selectPalette(v: PaletteId) {
  appearancePref.set("original");
  palettePref.set(v);
}

export function usePalette(): [PaletteId, (v: PaletteId) => void] {
  return [useSyncExternalStore(palettePref.subscribe, palettePref.get), selectPalette];
}
export function useAppearance(): [AppearanceId, (v: AppearanceId) => void] {
  return [useSyncExternalStore(appearancePref.subscribe, appearancePref.get), appearancePref.set];
}
