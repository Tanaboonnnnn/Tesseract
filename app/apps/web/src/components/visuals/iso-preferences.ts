import { useEffect, useState } from "react";

function motionAllowed(){
  if(typeof window==="undefined")return false;
  try{return !window.matchMedia("(prefers-reduced-motion: reduce)").matches&&localStorage.getItem("sb-map-motion")!=="off";}
  catch{return false;}
}

export function useIsoMotion(active:boolean){
  const [motion,setMotion]=useState(motionAllowed);
  useEffect(()=>{
    if(!active)return;
    const query=window.matchMedia("(prefers-reduced-motion: reduce)");
    const change=()=>setMotion(motionAllowed());
    change();
    query.addEventListener("change",change);
    window.addEventListener("storage",change);
    window.addEventListener("tesseract-motion",change);
    return ()=>{query.removeEventListener("change",change);window.removeEventListener("storage",change);window.removeEventListener("tesseract-motion",change);};
  },[active]);
  return motion;
}
