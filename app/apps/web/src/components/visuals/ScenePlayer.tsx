import "./scene-layout.css";
import { lessonLabels } from "../../lib/lesson-language.ts";
import { FormulaBlock } from "./Lesson.tsx";
import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Scene } from "@tesseract/core";
import { sampleScene } from "@tesseract/core/pure";

const SceneMesh = lazy(()=>import("./SceneMesh.tsx"));
type MeshProps = React.ComponentProps<typeof SceneMesh>;
function OptionalMesh({fallback, ...props}: Omit<MeshProps,"onUnavailable"> & {fallback:ReactNode}) {
  const [view,setView]=useState<"flat"|"mesh"|"unavailable">("flat");
  const labels=lessonLabels(props.language);
  const unavailable=useCallback(()=>setView("unavailable"),[]);
  return <>
    {view==="mesh" ? <Suspense fallback={fallback}><SceneMesh {...props} onUnavailable={unavailable}/></Suspense> : fallback}
    <div className="mb-2 flex flex-wrap items-center gap-2">
      {view==="unavailable" ? <p className="text-xs">{labels.unavailable}</p> :
      <button type="button" className="rounded-md border border-[var(--line)] px-2 py-1 text-sm" onClick={()=>setView(view==="mesh"?"flat":"mesh")}>{view==="mesh"?labels.flat:labels.open3d}</button>}
    </div>
  </>;
}
const AUTO_KEY = "tesseract:scene-autoplay";
const candidates = new Map<string, { ratio:number; manual:number; setActive:(active:boolean)=>void }>();
function choosePlayer() {
  const selected = [...candidates].filter(([,c])=>c.ratio>=0.2)
    .sort(([,a],[,b])=> b.manual-a.manual || b.ratio-a.ratio)[0]?.[0];
  for (const [key, c] of candidates) c.setActive(key===selected);
}
let playSequence = 0;
const TONE = {neutral:"var(--tess-scene-neutral)",primary:"var(--tess-scene-primary)",secondary:"var(--tess-scene-secondary)",caution:"var(--tess-scene-caution)"};
const sx = (x:number) => 25 + x*3.7;
const sy = (y:number) => 18 + y*1.62;

export function ScenePlayer({ scene, title, language }: { scene:Scene; title:string; language?:string }) {
  const labels=lessonLabels(language);
  const id = useId();
  const root = useRef<HTMLElement>(null);
  const clock = useRef(0);
  const priority = useRef(0);
  const [time,setTime] = useState(0);
  const [active,setActive] = useState(false);
  const [visible,setVisible] = useState(() => !document.hidden);
  const [reduced,setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [autoplay,setAutoplay] = useState(()=>localStorage.getItem(AUTO_KEY)!=="off");
  useEffect(()=>{
    const update=()=>setAutoplay(localStorage.getItem(AUTO_KEY)!=="off");
    window.addEventListener("tesseract-scene-autoplay",update);
    window.addEventListener("storage",update);
    return ()=>{window.removeEventListener("tesseract-scene-autoplay",update);window.removeEventListener("storage",update);};
  },[]);
  const [mode,setMode] = useState<"auto"|"play"|"pause">("auto");
  const [speed,setSpeed] = useState(1);
  const [inputs,setInputs] = useState<Record<string,number>>({});
  const [hover,setHover] = useState<string|null>(null);
  const [focus,setFocus] = useState<string|null>(null);
  const [pinned,setPinned] = useState<string|null>(null);

  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const visibility = () => setVisible(!document.hidden);
    const change = () => { setReduced(q.matches); if (q.matches) setMode("pause"); };
    document.addEventListener("visibilitychange",visibility);
    q.addEventListener("change",change);
    return () => { document.removeEventListener("visibilitychange",visibility); q.removeEventListener("change",change); };
  },[]);

  useEffect(() => {
    const element=root.current!;
    if (!("IntersectionObserver" in window) || !visible || mode==="pause" || ((reduced || !autoplay) && mode==="auto")) { setActive(false); return; }
    const observer = new IntersectionObserver(([entry])=>{
      candidates.set(id,{ratio:entry?.intersectionRatio ?? 0,manual:mode==="play" ? priority.current : 0,setActive});
      choosePlayer();
    },{threshold:[0,0.2,0.4,0.6,0.8,1]});
    observer.observe(element);
    return ()=>{observer.disconnect(); candidates.delete(id); choosePlayer(); };
  },[id,mode,visible,reduced,autoplay]);

  const canAnimate = active && visible && mode!=="pause" && ((!reduced && autoplay) || mode==="play");
  useEffect(()=>{
    if (!canAnimate || (clock.current===scene.duration_ms && !scene.loop)) return;
    let frame=0;
    let previous:number|undefined;
    const animate=(now:number)=>{
      const next=clock.current + Math.min(100,now-(previous ?? now))*speed;
      previous=now;
      clock.current = scene.loop ? next % scene.duration_ms : Math.min(next,scene.duration_ms);
      setTime(clock.current);
      if (scene.loop || next<scene.duration_ms) frame=requestAnimationFrame(animate);
      else setMode("pause");
    };
    frame=requestAnimationFrame(animate);
    return ()=>cancelAnimationFrame(frame);
  },[canAnimate,speed,scene.duration_ms,scene.loop]);

  const { entities, beat } = sampleScene(scene,time,inputs);
  const playing = canAnimate && (scene.loop || time<scene.duration_ms);
  const shown = new Set(entities.filter(e=>e.opacity>0).map(e=>e.id));
  const link = scene.bindings?.find(b=>b.id===(hover ?? focus ?? pinned) && b.target_ids.some(e=>shown.has(e)));
  const selected = new Set(link?.target_ids ?? []);
  const formulaShowsExplanation = scene.panels.some(p=>p.kind==="inspect" && p.id===link?.panel && p.tex);
  const layout = scene.panels.length===1 ? "single" : scene.panels.length===2 && scene.panels.filter(p=>p.kind==="inspect").length===1 ? "compact-inspect" : "grid";
  const seek=(ms:number)=>{setMode("pause"); clock.current=ms; setTime(ms);};
  const play=()=>{priority.current=++playSequence; if (clock.current>=scene.duration_ms) { clock.current=0; setTime(0); } setMode("play");};
  const step=scene.beats.indexOf(beat);
  const linkClass=(key:string)=>link?.id===key?" tess-scene-linked-chip":"";
  const button="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--lane)] disabled:opacity-40";
  const toggle = (key:string)=>setPinned(old=>old===key ? null : key);

  return <section ref={root} aria-label={title} className="tess-scene-layout my-3 min-w-0 space-y-3 rounded-xl border border-[var(--line)] p-3 sm:p-4" onKeyDown={e=>{if(e.key==="Escape"){setPinned(null);setHover(null);setFocus(null);}}}>
    <div className="tess-scene-panels min-w-0 gap-3" data-layout={layout}>
      {scene.panels.map(panel=><section key={panel.id} data-panel-kind={panel.kind} className="min-w-0 rounded-lg bg-[var(--lane)] p-3">
        <h4 className="break-words text-sm font-semibold">{panel.label}</h4>
        {panel.kind==="inspect" && panel.tex ? <div className="mt-2">
        <FormulaBlock b={{kind:"formula",tex:panel.tex,where:[],terms:(scene.bindings??[]).filter(b=>b.panel===panel.id).map(b=>({id:b.id,label:b.term,note:b.explanation}))}}
          connected={{active:link?.id??null,pinned,onHover:setHover,onFocus:setFocus,onSelect:toggle,enabled:key=>(scene.bindings??[]).some(b=>b.id===key && b.target_ids.some(t=>shown.has(t)))}} />
        </div> : panel.kind==="inspect" ? <div className="mt-2 flex flex-wrap gap-2">{scene.bindings?.filter(b=>b.panel===panel.id).map(b=><button key={b.id} type="button" className={button+" break-words "+linkClass(b.id)} aria-pressed={pinned===b.id} disabled={!b.target_ids.some(t=>shown.has(t))} onPointerEnter={e=>{if(e.pointerType!=="touch")setHover(b.id);}} onPointerLeave={()=>setHover(null)} onFocus={()=>setFocus(b.id)} onBlur={()=>setFocus(null)} onClick={()=>toggle(b.id)}>{b.term}</button>)}</div> :
          <>
          {(() => {
            const drawing = <svg className="tess-scene-canvas mt-2 h-auto w-full" data-projection={panel.kind==="diagram"?panel.projection:panel.kind==="mesh"?"isometric":undefined} viewBox="0 0 420 214" aria-label={panel.label}>
            {panel.kind==="plot" && <g fill="none" stroke="currentColor" opacity=".45"><path d="M25 18 V180 H395" /><path d="M25 140 H395 M25 100 H395 M25 60 H395" opacity=".3" /></g>}
            {panel.kind==="plot" && <><text x="25" y="14" fontSize="11" fill="currentColor">{panel.y_label}</text><text x="395" y="207" fontSize="11" textAnchor="end" fill="currentColor">{panel.x_label}</text></>}
            {entities.filter(e=>e.panel===panel.id && e.opacity>0).map(e=>{
              const matches = scene.bindings?.filter(b=>b.target_ids.includes(e.id)) ?? [];
              const matching = matches.find(b=>b.id===link?.id) ?? matches[0];
              const linked = selected.has(e.id);
              const highlighted = linked || beat.focus?.includes(e.id);
              const color=linked ? "var(--tess-scene-focus)" : TONE[e.tone ?? "neutral"];
              const x=sx(e.x), y=sy(e.y), w=e.width ?? 14, h=e.height ?? 24;
              const iso = panel.kind==="mesh" || (panel.kind==="diagram" && panel.projection==="isometric");
              return <g key={e.id} data-scene-entity={e.id} data-linked={linked||undefined} opacity={e.opacity/100} strokeWidth={highlighted?3:1.5} stroke={color} fill="none"
                onPointerEnter={matching?event=>{if(event.pointerType!=="touch")setHover(matching.id);}:undefined} onPointerLeave={matching?()=>setHover(null):undefined}
                onClick={matching?()=>toggle(matching.id):undefined} className={matching?"tess-scene-target cursor-pointer":undefined} data-kind={e.kind}>
                <title>{e.label}</title>
                {e.kind==="path" ? <><polyline points={e.points!.map(([px,py])=>sx(px+e.x)+","+sy(py+e.y)).join(" ")} strokeLinecap="round" strokeLinejoin="round" /><polyline points={e.points!.map(([px,py])=>sx(px+e.x)+","+sy(py+e.y)).join(" ")} stroke="transparent" strokeWidth="14" /></> :
                 e.kind==="box" ? <>{iso && <g className="tess-scene-solid" style={{color}}>
                   <path className="tess-scene-solid-top" d={"M"+(x-w/2)+" "+(y-h/2)+" l10 -7 h"+w+" l-10 7 Z"} />
                   <path className="tess-scene-solid-side" d={"M"+(x+w/2)+" "+(y-h/2)+" l10 -7 v"+h+" l-10 7 Z"} />
                 </g>}<rect x={x-w/2} y={y-h/2} width={w} height={h} rx={iso?0:4} className={iso?"tess-scene-solid-front":undefined} style={iso?{color}:undefined} fill={linked?"var(--tess-scene-focus-bg)":"var(--panel-solid)"} />
                 {iso && e.appearance && <g stroke="none" fill="var(--scene-paper)" aria-hidden="true">
                   {e.appearance==="display"?<><rect x={x-w*.38} y={y-h*.31} width={w*.76} height={h*.52}/><rect x={x-w*.24} y={y-h*.22} width={w*.48} height={1.4} fill={TONE.primary}/></>:
                     [-.28,0,.28].map(dy=><g key={dy}><rect x={x-w*.38} y={y+h*dy-1} width={w*.76} height={2}/><circle cx={x+w*.26} cy={y+h*dy} r={.8} fill={TONE.secondary}/></g>)}
                 </g>}</> :
                 (e.kind==="circle" || e.kind==="point") ? <circle cx={x} cy={y} r={e.kind==="point"? (highlighted?8:5):w/2} fill={e.kind==="point"?color:"none"} /> : null}
                {e.kind!=="path" && <text stroke="none" fill="currentColor" fontSize="12" className={linked?"tess-scene-linked-label":undefined} fontWeight={highlighted?700:400} x={x} y={y+(e.kind==="box"?h/2+16:e.kind==="circle"?w/2+16:e.kind==="point"?20:0)} textAnchor="middle">{e.label}</text>}
              </g>;
            })}
          </svg>;
            return panel.kind==="mesh" ? <OptionalMesh label={panel.label} language={language} fallback={drawing}
              entities={entities.filter(e=>e.panel===panel.id)} highlighted={new Set([...selected,...(beat.focus??[])])}
              onSelect={entity=>{const binding=(scene.bindings??[]).find(b=>b.target_ids.includes(entity));if(binding)toggle(binding.id);}}/> : drawing;
          })()}
          {!!scene.bindings?.some(b=>b.target_ids.some(key=>entities.some(e=>e.id===key && e.panel===panel.id && shown.has(key)))) && <div className="flex flex-wrap gap-2">
            {entities.filter(e=>e.panel===panel.id && shown.has(e.id)).flatMap(e=>(scene.bindings??[]).filter(b=>b.target_ids.includes(e.id)).map(b=>
              <button key={e.id+":"+b.id} type="button" className={button+linkClass(b.id)} aria-pressed={pinned===b.id} onFocus={()=>setFocus(b.id)} onBlur={()=>setFocus(null)} onClick={()=>toggle(b.id)}>{e.label}</button>))}
          </div>}
          </>
        }
      </section>)}
    </div>
    {!!scene.legend?.length && <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label={labels.legend}>
      {scene.legend.map((item,i)=><li key={i} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full" style={{background:TONE[item.tone]}}/>{item.label}</li>)}
    </ul>}
    {link && !formulaShowsExplanation && <p className="break-words text-sm"><strong>{link.term}:</strong> {link.explanation}</p>}
    <div className="space-y-2 rounded-lg border border-[var(--line)] bg-[var(--panel-solid)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={button+" min-h-11 bg-accent-600 font-semibold text-white hover:bg-accent-700"} onClick={playing?()=>setMode("pause"):play}>{playing?labels.pause:labels.play}</button>
        <button type="button" className={button+" min-h-11"} onClick={()=>{clock.current=0;setTime(0);play();}}>{labels.replay}</button>
        <span className="ml-auto text-sm muted">{labels.step} {step+1} / {scene.beats.length}</span>
      </div>
      <label className="block text-sm">{labels.timeline} <input className="block min-h-8 w-full" type="range" min={0} max={scene.duration_ms} step={1} list={id+"-markers"} value={Math.round(time)} onChange={e=>seek(Number(e.target.value))} /></label>
      <datalist id={id+"-markers"}>{scene.beats.map(b=><option key={b.id} value={b.at_ms}/>)}</datalist>
      <details className="text-sm"><summary className="w-fit cursor-pointer muted">{labels.controls}</summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label><input type="checkbox" checked={autoplay} onChange={e=>{localStorage.setItem(AUTO_KEY,e.target.checked?"on":"off");window.dispatchEvent(new Event("tesseract-scene-autoplay"));}} /> {labels.autoplay}</label>
          <label>{labels.speed} <select className={button} value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[0.5,1,1.5,2].map(n=><option key={n} value={n}>{n}×</option>)}</select></label>
        </div>
      </details>
    </div>
    <nav aria-label={labels.guide} className="space-y-2">
      <h5 className="text-sm font-semibold">{labels.guide}</h5>
      <ol className="tess-scene-steps">
        {scene.beats.map((b,i)=><li key={b.id}>
          <button type="button" className="tess-scene-step" aria-current={b===beat?"step":undefined} onClick={()=>seek(b.at_ms)}>
            <span className="tess-scene-step-number" aria-hidden="true">{i+1}</span>
            <span className="min-w-0 break-words">{b.label}</span>
          </button>
        </li>)}
      </ol>
      <p className="tess-scene-caption rounded-lg border border-[var(--line)] p-3 text-sm" aria-live={playing?"off":"polite"}>{beat.text}</p>
    </nav>
    {scene.controls?.map(c=><label key={c.id} className="block text-sm">{c.label}: {inputs[c.id] ?? c.initial}<input className="block w-full" type="range" min={c.min} max={c.max} step="any" value={inputs[c.id] ?? c.initial} onChange={e=>setInputs(old=>({...old,[c.id]:Number(e.target.value)}))}/></label>)}
  </section>;
}
