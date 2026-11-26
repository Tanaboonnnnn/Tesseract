import { PLAYBACK_RATES, parsePlaybackRate, type PlaybackRate } from "./playback-rate.ts";
export function PlaybackRateControl({rate,onChange,label="Playback speed"}:{
  rate:PlaybackRate; onChange:(rate:PlaybackRate)=>void; label?:string;
}) {
  return <label className="visual-playback-rate"><span className="sr-only">{label}</span>
    <select aria-label={label} title={label} value={rate} className="min-h-9 rounded-md border border-[var(--line)] bg-[var(--panel-solid)] px-2 text-sm"
      onChange={event=>onChange(parsePlaybackRate(event.target.value))}>
      {PLAYBACK_RATES.map(n=><option key={n} value={n}>{n}×</option>)}
    </select>
  </label>;
}
