import { useSyncExternalStore } from "react";

export const PLAYBACK_RATES = [.5, 1, 1.5, 2] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];
const KEY = "tesseract:visual-playback-rate";
const subs = new Set<() => void>();
export function parsePlaybackRate(input: unknown): PlaybackRate {
  const n = Number(input);
  return (PLAYBACK_RATES as readonly number[]).includes(n) ? n as PlaybackRate : 1;
}
export function remainingAfterPlayback(remaining: number, elapsedWallMs: number, rate: PlaybackRate) {
  return Math.max(0, remaining - Math.max(0, elapsedWallMs) * rate);
}
export function wallTimeAtRate(ms: number, rate: PlaybackRate) { return ms / rate; }

function read(): PlaybackRate {
  try { return parsePlaybackRate(localStorage.getItem(KEY)); } catch { return 1; }
}
let rate = read();
const subscribe = (fn: () => void) => {
  subs.add(fn);
  const sync = (e:StorageEvent) => { if (e.key===KEY || e.key===null) { rate=read(); fn(); } };
  window.addEventListener("storage", sync);
  return () => { subs.delete(fn);window.removeEventListener("storage", sync); };
};
const get = () => rate;
const defaultSnapshot = (): PlaybackRate => 1;
export function usePlaybackRate(): [PlaybackRate, (value: PlaybackRate) => void] {
  return [useSyncExternalStore(subscribe,get,defaultSnapshot),setRate];
}
function setRate(value:PlaybackRate) {
  rate = value;
  try { localStorage.setItem(KEY,String(value)); } catch {}
  subs.forEach(fn=>fn());
}
