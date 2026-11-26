import { ScenePlayer } from "./ScenePlayer.tsx";
/**
 * One study visual + its step player. Steps only toggle classes (opacity / glow with a short CSS transition),
 * so nothing runs at rest; autoplay is a plain timer that stops at the end, when hidden or off-screen.
 */
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Visual as VisualData } from "../../lib/api.ts";
import { ChartView } from "./ChartView.tsx";
import { GanttView } from "./GanttView.tsx";
import { GridView } from "./GridView.tsx";
import { HtmlFrame } from "./HtmlFrame.tsx";
import { Lesson } from "./Lesson.tsx";
import { Plot } from "./Plot.tsx";
import { makeFx } from "./shared.ts";
import { StateView } from "./StateView.tsx";
import { TreeView } from "./TreeView.tsx";
import { isoBeatTime, isoFlowBeat } from "./iso-motion.ts";
import type { IsoSequence } from "./iso-motion.ts";
import { useIsoMotion } from "./iso-preferences.ts";

const IsoView=lazy(()=>import("./IsoView.tsx"));

export function Visual({ visual, keys = false, learning = "", language }: { visual: VisualData; keys?: boolean; learning?: string; language?:string }) {
  const n = visual.steps.length;
  const isIso = visual.type === "iso";
  // -1 = overview (everything visible); build mode starts at step 0 so the picture builds up.
  const first = visual.step_mode === "build" && n ? 0 : -1;
  const [step, setStep] = useState(first);
  const [legacyPlaying, setPlaying] = useState(false);
  const [sequence,setSequence]=useState<IsoSequence>();
  const [run,setRun]=useState(0);
  const [autoWanted,setAutoWanted]=useState(true);
  const [inView,setInView]=useState(false);
  const motion=useIsoMotion(isIso);
  const playing=isIso?sequence==="run":legacyPlaying;
  const iso=useMemo(()=>{
    if(visual.type!=="iso")return null;
    const {author:_a,created:_c,updated:_u,...input}=visual;
    return input;
  },[visual]);
  const beatTime=iso?isoBeatTime(isoFlowBeat(iso.data.connections,iso.steps,step)).duration:2600;
  const hasFlow=useMemo(()=>!!iso?.data.connections.some(link=>link.kind==="flow"&&iso.steps.some(s=>s.highlight.includes(link.id))),[iso]);
  const progress=useRef({step:-1,run:-1,remaining:0});
  const box = useRef<HTMLDivElement>(null);
  const [isoScene,setIsoScene]=useState<SVGSVGElement|null>(null);
  useEffect(() => {
    setStep(first);
    setSequence(undefined);
    setAutoWanted(true);
    setPlaying(false);
  }, [visual.id, visual.updated, first, isIso]);

  const go = (s: number) => {
    if(isIso) {setAutoWanted(false);setSequence(undefined);}
    setStep(Math.max(first, Math.min(n - 1, s)));
  };

  useEffect(() => {
    if (!playing) return;
    const atEnd = step >= n - 1;
    if (atEnd && !isIso) {
      setPlaying(false);
      return;
    }
    if(isIso&&(progress.current.run!==run||progress.current.step!==step)) {
      progress.current={step,run,remaining:beatTime};
    }
    const duration=isIso?progress.current.remaining:2600;
    const started=performance.now();
    const t = setTimeout(() => {
      if (atEnd) {
        if(isIso) setSequence("end");
        else setPlaying(false);
      }
      else setStep((s) => s + 1);
    }, duration);
    return () => {
      clearTimeout(t);
      if(isIso) progress.current.remaining=Math.max(0,duration-(performance.now()-started));
    };
  }, [playing, step, n, isIso, run, beatTime]);

  useEffect(()=>{
    const el=isoScene;
    if(!isIso||!el||typeof IntersectionObserver==="undefined")return;
    let visible=false;
    const update=()=>setInView(visible&&!document.hidden);
    const obs=new IntersectionObserver(([entry])=>{
      visible=!!entry&&entry.isIntersecting&&entry.intersectionRatio>=0.5;
      update();
    },{threshold:[0,0.5]});
    obs.observe(el);
    document.addEventListener("visibilitychange",update);
    return ()=>{obs.disconnect();document.removeEventListener("visibilitychange",update);};
  },[isIso,isoScene]);

  useEffect(()=>{
    if(!isIso)return;
    if((!inView||(autoWanted&&hasFlow&&!motion))&&sequence==="run"){setSequence("pause");return;}
    if(!inView||!autoWanted||!motion||!hasFlow)return;
    if(sequence==="pause"){setSequence("run");return;}
    if(sequence===undefined||sequence==="end"){setRun(r=>r+1);setStep(0);setSequence("run");}
  },[isIso,inView,autoWanted,motion,hasFlow,sequence]);

  useEffect(() => {
    const el = box.current;
    if (!el || !playing || isIso) return;
    const stop = () => setPlaying(false);
    const io = new IntersectionObserver(([e]) => !e?.isIntersecting && stop());
    io.observe(el);
    const vis = () => document.hidden && stop();
    document.addEventListener("visibilitychange", vis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", vis);
    };
  }, [playing,isIso]);

  useEffect(() => {
    if (!keys || !n) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight"||e.key==="ArrowLeft") {
        if(isIso) {setAutoWanted(false);setSequence(undefined);}
        const delta=e.key==="ArrowRight"?1:-1;
        setStep(s=>Math.max(first,Math.min(n-1,s+delta)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keys, n, first,isIso]);

  const fx = makeFx(visual, step);
  const caption = step >= 0 ? visual.steps[step]?.text : null;

  if (visual.type === "scene") return <ScenePlayer key={visual.id+":"+visual.updated} scene={visual.data} title={visual.title} language={language} />;
  if (visual.type === "lesson") return <Lesson visual={visual} learning={learning} />;
  if (visual.type === "html") return <HtmlFrame html={visual.data.html} height={visual.data.height} title={visual.title} />;

  return (
    <div ref={box} className={iso?"flex flex-col":undefined} onKeyDown={iso&&!keys?e=>{
      if(e.key!=="ArrowLeft"&&e.key!=="ArrowRight")return;
      if((e.target as HTMLElement)?.closest("input, textarea, select"))return;
      e.preventDefault();go(step+(e.key==="ArrowRight"?1:-1));
    }:undefined}>
      <div className="map-stage overflow-x-auto rounded-lg p-2">
        {visual.type === "state" && <StateView v={visual} fx={fx} step={step} />}
        {visual.type === "gantt" && <GanttView v={visual} fx={fx} />}
        {visual.type === "chart" && <ChartView v={visual} fx={fx} />}
        {visual.type === "grid" && <GridView v={visual} fx={fx} />}
        {visual.type === "tree" && <TreeView v={visual} fx={fx} />}
        {visual.type === "plot" && <Plot data={visual.data} fx={fx} />}
        {iso && <Suspense fallback={<p role="status">Loading illustration…</p>}><IsoView input={iso} step={step} sequence={sequence} run={run} motion={motion} sceneRef={setIsoScene}/></Suspense>}
      </div>

      {n > 0 && (
        <div data-iso-player={iso?true:undefined} className={iso?"order-first mb-1 flex flex-wrap items-center gap-x-3 gap-y-2":"mt-3 flex flex-wrap items-center gap-3"}>
          <div className="flex items-center gap-1">
            <StepButton label="Previous step" onClick={() => go(step - 1)} disabled={step <= first}>
              <ChevronLeft size={16} />
            </StepButton>
            <StepButton prominent={isIso} label={isIso?(playing?"Pause":sequence==="pause"?"Resume":sequence==="end"?"Replay":"Play animation"):(playing?"Pause":"Play steps")} onClick={() => {
              if(isIso) {
                setAutoWanted(!playing&&motion);
                if(playing) setSequence("pause");
                else if(sequence==="pause") setSequence("run");
                else {setRun(r=>r+1);setStep(0);setSequence("run");}
              }
              else if (playing) setPlaying(false);
              else {
                if (step >= n - 1) go(first);
                setPlaying(true);
              }
            }}>
              {playing ? <Pause size={15} /> : sequence==="end" || (!isIso && step >= n - 1) ? <RotateCcw size={15} /> : <Play size={15} />}
            </StepButton>
            <StepButton label="Next step" onClick={() => go(step + 1)} disabled={step >= n - 1}>
              <ChevronRight size={16} />
            </StepButton>
          </div>
          <div className="flex max-w-full flex-wrap gap-1" aria-hidden>
            {visual.steps.map((_, i) => (
              <button key={i} tabIndex={-1} onClick={() => go(i)} className={`h-1.5 w-5 rounded-full transition-colors ${i <= step ? "bg-sky-400" : "bg-slate-400/25"}`} />
            ))}
          </div>
          <span className="text-xs text-slate-500 tabular-nums">{step < 0 ? `${n} steps` : `Step ${step + 1}/${n}`}</span>
          <p className="min-h-5 w-full text-sm text-slate-700 dark:text-slate-200" aria-live={isIso&&playing?"off":"polite"}>
            <span key={step} className={caption ? "vis-step-caption inline-block" : "text-slate-400"}>
              {caption ?? (isIso?"Play the animation or use the arrows to inspect one step.":"Press ▶ or → to walk through it step by step.")}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

function StepButton({ label, onClick, disabled, children, prominent }: { label:string;onClick:()=>void;disabled?:boolean;children:React.ReactNode;prominent?:boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={prominent?"inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-[var(--accent-foreground)] ring-1 ring-[var(--line)]":"grid size-8 place-items-center rounded-lg text-slate-600 ring-1 ring-[var(--line)] hover:text-accent-600 disabled:opacity-35 dark:text-slate-300 dark:hover:text-sky-300"}
    >
      {children}
      {prominent&&label}
    </button>
  );
}
