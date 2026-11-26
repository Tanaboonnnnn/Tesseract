import { useEffect, useMemo, useState } from "react";
import { validateIso } from "@tesseract/core/iso";
import type { IsoInput } from "@tesseract/core/iso";
import { IsoArt, isoViewPlan } from "./IsoArt.tsx";
import { turnIso } from "./iso-camera.ts";
import type { IsoTurn } from "./iso-camera.ts";
import type { IsoSequence } from "./iso-motion.ts";

function motionAllowed(){
  if(typeof window==="undefined")return false;
  try{return !window.matchMedia("(prefers-reduced-motion: reduce)").matches&&localStorage.getItem("sb-map-motion")!=="off";}
  catch{return false;}
}
export default function IsoView({input,step,sequence,run}:{input:IsoInput;step:number;sequence?:IsoSequence;run:number}){
  const checked=useMemo(()=>validateIso(input),[input]);
  const [motion,setMotion]=useState(motionAllowed);
  const plan=useMemo(()=>checked.ok?isoViewPlan(checked):null,[checked]);
  const home=plan?.home??0;
  const [turn,setTurn]=useState<IsoTurn>(home);
  useEffect(()=>setTurn(home),[home,input.id]);
  useEffect(()=>{
    const query=window.matchMedia("(prefers-reduced-motion: reduce)");
    const change=()=>setMotion(motionAllowed());
    query.addEventListener("change",change);
    window.addEventListener("storage",change);
    window.addEventListener("tesseract-motion",change);
    return ()=>{query.removeEventListener("change",change);window.removeEventListener("storage",change);window.removeEventListener("tesseract-motion",change);};
  },[]);
  if(!checked.ok||!plan)return <p role="status">This illustration could not be displayed.</p>;
  return <>
    <IsoArt checked={checked} step={step} playing={motion} turn={turn} plan={plan} sequence={sequence} run={run}/>
    <div className="iso-view-controls" role="group" aria-label="Illustration view">
      <button type="button" aria-label="Rotate left" onClick={()=>setTurn(t=>turnIso(t,-1))}>↶</button>
      <span aria-live="polite">View {turnIso(turn,-home)+1}/4</span>
      <button type="button" aria-label="Rotate right" onClick={()=>setTurn(t=>turnIso(t,1))}>↷</button>
      <button type="button" aria-label="Reset view" onClick={()=>setTurn(home)} disabled={turn===home}>Reset</button>
    </div>
  </>;
}
