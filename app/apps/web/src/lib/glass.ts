/**
 * Panel transparency, saved per device. Sets --panel-opacity on <html>; panels use
 * rgb(var(--panel-base) / var(--panel-opacity)). No value saved = the theme's default.
 * The inline script in index.html applies it before first paint.
 */
import { useState } from "react";

const KEY = "sb-transparency";
export const MAX_TRANSPARENCY = 80;

export function readTransparency(): number | null {
  const v = Number(localStorage.getItem(KEY));
  return localStorage.getItem(KEY) === null || Number.isNaN(v) ? null : Math.max(0, Math.min(MAX_TRANSPARENCY, v));
}

export function applyTransparency(t: number | null): void {
  const s = document.documentElement.style;
  if (t === null) s.removeProperty("--panel-opacity");
  else s.setProperty("--panel-opacity", String(1 - t / 100));
}

export function useTransparency(): [number | null, (t: number | null) => void] {
  const [t, setT] = useState(readTransparency);
  return [
    t,
    (next) => {
      if (next === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, String(next));
      applyTransparency(next);
      setT(next);
    },
  ];
}
