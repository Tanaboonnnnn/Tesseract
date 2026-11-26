import type { Scene } from "./scene.ts";

function interpolate(frames: NonNullable<Scene["tracks"]>[number]["frames"], t:number, initial:number) {
  const i = frames.findIndex(f => f.at_ms > t);
  if (i < 0) return frames.at(-1)!.value;
  const right = frames[i]!;
  const left = frames[i-1] ?? {at_ms:0,value:initial};
  return left.value + (right.value-left.value) * (t-left.at_ms)/(right.at_ms-left.at_ms);
}

export function sampleScene(scene: Scene, timeMs: number, inputs: Readonly<Record<string,number>> = {}) {
  const t = Math.min(scene.duration_ms, Math.max(0,Number.isFinite(timeMs) ? timeMs : 0));
  const entities = scene.entities.map(entity => ({...entity,opacity:entity.opacity ?? 100}));
  const byId = new Map(entities.map(e => [e.id,e]));
  for (const track of scene.tracks ?? []) {
    const entity = byId.get(track.entity)!;
    entity[track.property] = interpolate(track.frames,t,entity[track.property]);
  }
  for (const control of scene.controls ?? []) {
    const n = Object.hasOwn(inputs,control.id) ? inputs[control.id] : undefined;
    byId.get(control.target)![control.property] =
      Math.min(control.max,Math.max(control.min,n !== undefined && Number.isFinite(n) ? n : control.initial));
  }
  const beat = scene.beats.findLast(b=>b.at_ms <= t) ?? scene.beats[0]!;
  return { timeMs:t, entities, beat };
}
