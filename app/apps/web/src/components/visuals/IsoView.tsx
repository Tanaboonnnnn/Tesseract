import { useEffect, useMemo, useState } from "react";
import { validateIso } from "@tesseract/core/iso";
import type { IsoInput } from "@tesseract/core/iso";
import { IsoArt, isoViewPlan } from "./IsoArt.tsx";
import { turnIso } from "./iso-camera.ts";
import type { IsoTurn } from "./iso-camera.ts";
import type { IsoSequence } from "./iso-motion.ts";
import type { PlaybackRate } from "./playback-rate.ts";

export default function IsoView({input,step,sequence,run,motion,rate,sceneRef}:{
  input:IsoInput;step:number;sequence?:IsoSequence;run:number;motion:boolean;rate:PlaybackRate;sceneRef:(svg:SVGSVGElement|null)=>void;
}){
  const checked=useMemo(()=>validateIso(input),[input]);
  const plan=useMemo(()=>checked.ok?isoViewPlan(checked):null,[checked]);
  const home=plan?.home??0;
  const [turn,setTurn]=useState<IsoTurn>(home);
  useEffect(()=>setTurn(home),[home,input.id]);
  if(!checked.ok||!plan)return <p role="status">This illustration could not be displayed.</p>;
  return <>
    {!motion&&<p className="mb-2 text-xs muted" role="status">Reduced or disabled motion: steps play as still frames.</p>}
    <IsoArt checked={checked} step={step} playing={motion} turn={turn} plan={plan} sequence={sequence} run={run} rate={rate} sceneRef={sceneRef}/>
    <div className="iso-view-controls" role="group" aria-label="Illustration view">
      <button type="button" aria-label="Rotate left" onClick={()=>setTurn(t=>turnIso(t,-1))}>↶</button>
      <span aria-live="polite">View {turnIso(turn,-home)+1}/4</span>
      <button type="button" aria-label="Rotate right" onClick={()=>setTurn(t=>turnIso(t,1))}>↷</button>
      <button type="button" aria-label="Reset view" onClick={()=>setTurn(home)} disabled={turn===home}>Reset</button>
    </div>
  </>;
}
