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

/* ---------- Layout selection applies a recommended palette; colour overrides remain independent ---------- */

export const LAYOUTS = [
  { id: "system", name: "Solo Leveling System", hint: "Sidebar + glowing HUD windows with corner brackets", palette: "blue" },
  { id: "minimal", name: "Minimal", hint: "Top bar, whitespace, hairlines, calm type", palette: "neutral" },
  { id: "bento", name: "Bento", hint: "Icon rail, rounded tiles, big numbers, progress rings", palette: "aurora" },
  { id: "notebook", name: "Notebook", hint: "Paper index cards, ruled lines, bookmark tabs", palette: "sepia" },
  { id: "terminal", name: "Terminal", hint: "Monospace console, boxed panes, status bar", palette: "amber" },
  { id: "linear", name: "Linear", hint: "Compact sidebar, grouped workspaces and a wider desk", palette: "indigo" },
  { id: "notion", name: "Notion", hint: "Workspace sidebar, breadcrumbs and a centred writing column", palette: "paper" },
  { id: "editorial", name: "Warm Editorial", hint: "Centred masthead, horizontal index and a reading-first column", palette: "terracotta" },
  { id: "insights", name: "Insights", hint: "Dual sidebar and a workspace overview with live metrics", palette: "garden" },
  { id: "fieldbook", name: "Fieldbook", hint: "Paper and ink, a quiet sidebar, and clear skill progress", palette: "fieldbook-paper" },
] as const;
export type LayoutId = (typeof LAYOUTS)[number]["id"];

export const PALETTES = [
  { id: "blue", name: "System Blue", swatch: ["#030817", "#38bdf8", "#1f6fe5"] },
  { id: "aurora", name: "Aurora", swatch: ["#060312", "#2dd4bf", "#8b5cf6"] },
  { id: "crimson", name: "Crimson", swatch: ["#0c0306", "#f43f5e", "#fbbf24"] },
  { id: "sepia", name: "Sepia", swatch: ["#f4ede0", "#8b5a2b", "#d6a35e"] },
  { id: "neutral", name: "Neutral", swatch: ["#f7f7f8", "#18181b", "#2563eb"] },
  { id: "amber", name: "Amber CRT", swatch: ["#0a0700", "#ffb000", "#ffd27a"] },
  { id: "indigo", name: "Indigo", swatch: ["#08090a", "#7170ff", "#5e6ad2"] },
  { id: "paper", name: "Paper", swatch: ["#ffffff", "#31302e", "#0075de"] },
  { id: "terracotta", name: "Terracotta", swatch: ["#fbf6ee", "#f1e3cf", "#9b5b32"] },
  { id: "garden", name: "Garden", swatch: ["#ffffff", "#eef3e9", "#367e12"] },
  { id: "fieldbook-paper", name: "Fieldbook Paper", swatch: ["#f8f6f0", "#e8efe6", "#243d34"] },
] as const;
export type PaletteId = (typeof PALETTES)[number]["id"];

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
export const palettePref = pref<PaletteId>("sb-palette", PALETTES.map((p) => p.id), "blue", attr("data-palette", "blue"));

export function selectLayout(next: LayoutId): void {
  if (layoutPref.get() === next) return;
  palettePref.set(LAYOUTS.find((l) => l.id === next)!.palette);
  layoutPref.set(next);
}

export function useLayout(): [LayoutId, (v: LayoutId) => void] {
  return [useSyncExternalStore(layoutPref.subscribe, layoutPref.get), selectLayout];
}
export function usePalette(): [PaletteId, (v: PaletteId) => void] {
  return [useSyncExternalStore(palettePref.subscribe, palettePref.get), palettePref.set];
}


/** Apply metadata from a successfully authenticated pairing only. */
export function applyPairedAppearance(layout: string | null, palette: string | null): void {
  const nextLayout = LAYOUTS.find((value) => value.id === layout);
  const nextPalette = PALETTES.find((value) => value.id === palette);
  if (nextLayout) layoutPref.set(nextLayout.id);
  if (nextPalette) palettePref.set(nextPalette.id);
}
