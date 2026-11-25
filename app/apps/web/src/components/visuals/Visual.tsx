/**
 * One study visual + its step player. Steps only toggle classes (opacity / glow with a short CSS transition),
 * so nothing runs at rest; autoplay is a plain timer that stops at the end, when hidden or off-screen.
 */
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

export function Visual({ visual, keys = false, learning = "" }: { visual: VisualData; keys?: boolean; learning?: string }) {
  const n = visual.steps.length;
  // -1 = overview (everything visible); build mode starts at step 0 so the picture builds up.
  const first = visual.step_mode === "build" && n ? 0 : -1;
  const [step, setStep] = useState(first);
  const [playing, setPlaying] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => setStep(first), [visual.id, visual.updated, first]);

  const go = (s: number) => setStep(Math.max(first, Math.min(n - 1, s)));

  useEffect(() => {
    if (!playing) return;
    if (step >= n - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStep((s) => s + 1), 2600);
    return () => clearTimeout(t);
  }, [playing, step, n]);

  useEffect(() => {
    const el = box.current;
    if (!el || !playing) return;
    const stop = () => setPlaying(false);
    const io = new IntersectionObserver(([e]) => !e?.isIntersecting && stop());
    io.observe(el);
    const vis = () => document.hidden && stop();
    document.addEventListener("visibilitychange", vis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", vis);
    };
  }, [playing]);

  useEffect(() => {
    if (!keys || !n) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") setStep((s) => Math.min(n - 1, s + 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(first, s - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keys, n, first]);

  const fx = makeFx(visual, step);
  const caption = step >= 0 ? visual.steps[step]?.text : null;

  if (visual.type === "lesson") return <Lesson visual={visual} learning={learning} />;
  if (visual.type === "html") return <HtmlFrame html={visual.data.html} height={visual.data.height} title={visual.title} />;

  return (
    <div ref={box}>
      <div className="map-stage overflow-x-auto rounded-lg p-2">
        {visual.type === "state" && <StateView v={visual} fx={fx} />}
        {visual.type === "gantt" && <GanttView v={visual} fx={fx} />}
        {visual.type === "chart" && <ChartView v={visual} fx={fx} />}
        {visual.type === "grid" && <GridView v={visual} fx={fx} />}
        {visual.type === "tree" && <TreeView v={visual} fx={fx} />}
        {visual.type === "plot" && <Plot data={visual.data} fx={fx} />}
      </div>

      {n > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <StepButton label="Previous step" onClick={() => go(step - 1)} disabled={step <= first}>
              <ChevronLeft size={16} />
            </StepButton>
            <StepButton label={playing ? "Pause" : "Play steps"} onClick={() => (step >= n - 1 ? (go(first), setPlaying(true)) : setPlaying(!playing))}>
              {playing ? <Pause size={15} /> : step >= n - 1 ? <RotateCcw size={15} /> : <Play size={15} />}
            </StepButton>
            <StepButton label="Next step" onClick={() => go(step + 1)} disabled={step >= n - 1}>
              <ChevronRight size={16} />
            </StepButton>
          </div>
          <div className="flex gap-1" aria-hidden>
            {visual.steps.map((_, i) => (
              <button key={i} tabIndex={-1} onClick={() => go(i)} className={`h-1.5 w-5 rounded-full transition-colors ${i <= step ? "bg-sky-400" : "bg-slate-400/25"}`} />
            ))}
          </div>
          <span className="text-xs text-slate-500 tabular-nums">{step < 0 ? `${n} steps` : `Step ${step + 1}/${n}`}</span>
          <p className="min-h-5 w-full text-sm text-slate-700 dark:text-slate-200" aria-live="polite">
            {caption ?? <span className="text-slate-400">Press ▶ or → to walk through it step by step.</span>}
          </p>
        </div>
      )}
    </div>
  );
}

function StepButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-8 place-items-center rounded-lg text-slate-600 ring-1 ring-[var(--line)] hover:text-accent-600 disabled:opacity-35 dark:text-slate-300 dark:hover:text-sky-300"
    >
      {children}
    </button>
  );
}
