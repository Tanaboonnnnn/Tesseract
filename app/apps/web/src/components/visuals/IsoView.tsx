import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { validateIso } from "@tesseract/core/iso";
import type { IsoInput } from "@tesseract/core/iso";
import { IsoArt, isoViewPlan } from "./IsoArt.tsx";
import { turnIso } from "./iso-camera.ts";
import type { IsoTurn } from "./iso-camera.ts";
import type { IsoSequence } from "./iso-motion.ts";
import type { PlaybackRate } from "./playback-rate.ts";

export default function IsoView({input,step,sequence,run,motion,rate,viewportRef}:{
  input:IsoInput;step:number;sequence?:IsoSequence;run:number;motion:boolean;rate:PlaybackRate;viewportRef:(node:HTMLDivElement|null)=>void;
}){
  const checked=useMemo(()=>validateIso(input),[input]);
  const plan=useMemo(()=>checked.ok?isoViewPlan(checked):null,[checked]);
  const home=plan?.home??0;
  const [turn,setTurn]=useState<IsoTurn>(home);
  const [zoom,setZoom]=useState(1);
  const viewport=useRef<HTMLDivElement|null>(null);
  const previous=useRef({zoom:1,turn});
  const attachViewport=useCallback((node:HTMLDivElement|null)=>{
    viewport.current=node;
    viewportRef(node);
  },[viewportRef]);
  useEffect(()=>{setTurn(home);setZoom(1);},[home,input.id]);
  useLayoutEffect(()=>{
    const el=viewport.current, old=previous.current, ratio=zoom/old.zoom;
    previous.current={zoom,turn};
    if(!el||(ratio===1&&old.turn===turn))return;
    if(zoom===1){el.scrollTo(0,0);return;}
    if(old.zoom===1||old.turn!==turn){el.scrollTo((el.scrollWidth-el.clientWidth)/2,(el.scrollHeight-el.clientHeight)/2);return;}
    el.scrollTo((el.scrollLeft+el.clientWidth/2)*ratio-el.clientWidth/2,
      (el.scrollTop+el.clientHeight/2)*ratio-el.clientHeight/2);
  },[zoom,turn]);
  const reset=()=>{setTurn(home);setZoom(1);};
  if(!checked.ok||!plan)return <p role="status">This illustration could not be displayed.</p>;
  return <>
    {!motion&&<p className="mb-2 text-xs muted" role="status">Reduced or disabled motion: steps play as still frames.</p>}
    <IsoArt checked={checked} step={step} playing={motion} turn={turn} plan={plan} sequence={sequence} run={run} rate={rate} zoom={zoom} viewportRef={attachViewport}/>
    <div className="iso-view-controls" role="group" aria-label="Illustration view">
      <button type="button" aria-label="Rotate left" onClick={()=>setTurn(t=>turnIso(t,-1))}>↶</button>
      <span aria-live="polite">View {turnIso(turn,-home)+1}/4</span>
      <button type="button" aria-label="Rotate right" onClick={()=>setTurn(t=>turnIso(t,1))}>↷</button>
      <span className="iso-zoom-controls" role="group" aria-label="Illustration zoom">
        <button type="button" title="Zoom out" aria-label="Zoom out" onClick={()=>setZoom(z=>Math.max(1,z-.5))} disabled={zoom===1}>{"\u2212"}</button>
        <span aria-live="polite">{zoom*100}%</span>
        <button type="button" title="Zoom in" aria-label="Zoom in" onClick={()=>setZoom(z=>Math.min(2,z+.5))} disabled={zoom===2}>+</button>
      </span>
      <button type="button" aria-label="Reset view" onClick={reset} disabled={turn===home&&zoom===1}>Reset</button>
    </div>
  </>;
}
