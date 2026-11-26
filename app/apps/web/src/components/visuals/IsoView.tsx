import { useEffect, useMemo, useState } from "react";
import { validateIso } from "@tesseract/core/iso";
import type { IsoInput } from "@tesseract/core/iso";
import { IsoArt } from "./IsoArt.tsx";

function motionAllowed(){
  if(typeof window==="undefined")return false;
  try{return !window.matchMedia("(prefers-reduced-motion: reduce)").matches&&localStorage.getItem("sb-map-motion")!=="off";}
  catch{return false;}
}
export default function IsoView({input,step}:{input:IsoInput;step:number}){
  const checked=useMemo(()=>validateIso(input),[input]);
  const [motion,setMotion]=useState(motionAllowed);
  useEffect(()=>{
    const query=window.matchMedia("(prefers-reduced-motion: reduce)");
    const change=()=>setMotion(motionAllowed());
    query.addEventListener("change",change);
    window.addEventListener("storage",change);
    window.addEventListener("tesseract-motion",change);
    return ()=>{query.removeEventListener("change",change);window.removeEventListener("storage",change);window.removeEventListener("tesseract-motion",change);};
  },[]);
  if(!checked.ok)return <p role="status">This illustration could not be displayed.</p>;
  return <IsoArt checked={checked} step={step} playing={motion}/>;
}
