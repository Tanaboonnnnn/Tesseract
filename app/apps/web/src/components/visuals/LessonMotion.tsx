import { ArrowDown, ArrowRight, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { LessonBlock } from "../../lib/api.ts";
import { cn } from "../../lib/format.ts";
import { Button } from "../ui.tsx";

type Motion = Extract<LessonBlock, { kind: "motion" }>;

export function LessonMotion({ block }: { block: Motion }) {
  const [step, setStep] = useState(0);
  const i = Math.min(step, block.steps.length - 1);
  const current = block.steps[i]!;
  const before = block.steps[i - 1];
  const itemFor = (id: string) => block.items.find((item) => item.id === id)!;
  const revealed = [...new Set(block.steps.slice(0, i + 1).map((s) => s.focus))];
  const items = block.mode === "flow" ? block.items : block.mode === "reveal" ? revealed.map(itemFor) : [itemFor(current.focus)];
  const isFlow = block.mode === "flow";
  const isCompare = block.mode === "compare";

  return (
    <div className="space-y-3">
      <div className={cn("grid gap-2", isCompare && before && "sm:grid-cols-2")} aria-label={`${block.mode} scene`}>
        {isCompare && before && (
          <div className="min-w-0 break-words rounded-lg border border-[var(--line)] bg-[var(--panel-solid)] p-3">
            <p className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-300">Before</p>
            <p className="text-sm font-semibold">{itemFor(before.focus).label}</p>
            {itemFor(before.focus).detail && <p className="mt-1 text-sm">{itemFor(before.focus).detail}</p>}
          </div>
        )}
        {items.map((item, index) => {
          const active = item.id === current.focus;
          return (
            <div key={item.id} className="min-w-0">
              {isFlow && index > 0 && (
                <div aria-hidden="true" className="relative mb-1 flex h-5 items-center pl-5 text-slate-500">
                  <ArrowDown size={15} />
                  {active && i > 0 && <span key={i} className="lesson-flow-signal" />}
                </div>
              )}
              <div aria-current={active ? "step" : undefined} className={cn(
                "min-w-0 break-words rounded-lg border p-3",
                active ? "border-accent-500 bg-[var(--lane)]" : "border-[var(--line)] bg-[var(--panel-solid)]",
              )}>
                <div key={active ? i : item.id} className={active ? `lesson-motion-${block.mode}` : undefined}>
                  {isCompare && <p className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-300">{before ? "After" : "Starting point"}</p>}
                  <p className="font-semibold text-sm">{item.label}</p>
                  {item.detail && <p className="mt-1 text-sm">{item.detail}</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p role="status" className="min-h-10 break-words rounded-lg bg-[var(--lane)] px-3 py-2 text-sm">
        <span className="vis-step-caption inline-block" key={i}>{current.text}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" aria-label="Previous motion step" disabled={i === 0} onClick={() => setStep(i - 1)}><ChevronLeft size={16} /></Button>
        <Button variant="ghost" aria-label="Next motion step" disabled={i === block.steps.length - 1} onClick={() => setStep(i + 1)}><ArrowRight size={16} /></Button>
        <Button variant="ghost" aria-label="Reset motion steps" disabled={i === 0} onClick={() => setStep(0)}><RotateCcw size={15} /></Button>
        <span className="text-xs tabular-nums">Step {i + 1}/{block.steps.length}</span>
      </div>
    </div>
  );
}
