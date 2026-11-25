/**
 * Lesson visual (SPEC §4.16): a page of blocks for one topic — text, formula, trace (step-by-step state), plot,
 * sim, embedded visual, self-check and sandboxed HTML. Each block is isolated: one bad block shows an error
 * instead of breaking the page.
 */
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react";
import { Component, type ReactNode, useEffect, useId, useState } from "react";
import { api, type LessonBlock, type Visual as VisualData } from "../../lib/api.ts";
import { cn } from "../../lib/format.ts";
import { texToMathML } from "../../lib/math.ts";
import { Markdown } from "../Markdown.tsx";
import { HtmlFrame } from "./HtmlFrame.tsx";
import { Plot } from "./Plot.tsx";
import { LessonMotion } from "./LessonMotion.tsx";
import { PALETTE } from "./shared.ts";
import { Sim } from "./Sims.tsx";
import { Visual } from "./Visual.tsx";

class Guard extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  render() {
    return this.state.error ? <p className="text-sm text-rose-500">This block could not be shown: {this.state.error}</p> : this.props.children;
  }
}

const KIND_LABEL: Record<LessonBlock["kind"], string> = {
  text: "Idea",
  formula: "Formula",
  trace: "Step by step",
  motion: "Animated walkthrough",
  plot: "Graph",
  sim: "Simulation",
  visual: "Diagram",
  check: "Check yourself",
  html: "Interactive",
};

export function Lesson({ visual, learning }: { visual: Extract<VisualData, { type: "lesson" }>; learning: string }) {
  const blocks = visual.data.blocks;
  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap gap-1.5" aria-label="Lesson sections">
        {blocks.map((b, i) => (
          <a key={i} href={`#block-${i + 1}`} className="rounded-full px-2.5 py-1 text-xs ring-1 ring-[var(--line)] hover:bg-[var(--lane)]">
            {i + 1}. {blockTitle(b)}
          </a>
        ))}
      </nav>
      {blocks.map((b, i) => (
        <section key={i} id={`block-${i + 1}`} className="scroll-mt-20 rounded-xl p-4 ring-1 ring-[var(--line)] sm:p-5">
          <p className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-slate-500 uppercase">
            {i + 1} · {blockTitle(b)}
          </p>
          <Guard>
            <Block b={b} learning={learning} />
          </Guard>
        </section>
      ))}
    </div>
  );
}

function blockTitle(b: LessonBlock): string {
  if ((b.kind === "trace" || b.kind === "motion" || b.kind === "sim" || b.kind === "plot") && b.title) return b.title;
  return KIND_LABEL[b.kind];
}

function Block({ b, learning }: { b: LessonBlock; learning: string }) {
  switch (b.kind) {
    case "text":
      return (
        <div className="prose-note">
          <Markdown text={b.md} />
        </div>
      );
    case "formula":
      return <FormulaBlock b={b} />;
    case "trace":
      return <TraceBlock b={b} />;
    case "motion":
      return <LessonMotion block={b} />;
    case "plot":
      return <Plot data={{ ...b, title: undefined }} />;
    case "sim":
      return <Sim sim={b.sim} input={b.input} />;
    case "visual":
      return <EmbeddedVisual learning={learning} id={b.ref} />;
    case "check":
      return <CheckBlock q={b.q} a={b.a} />;
    case "html":
      return <HtmlFrame html={b.html} height={b.height} title="Interactive" />;
  }
}

/* ---------- math ---------- */

function Tex({ tex, display = true, className }: { tex: string; display?: boolean; className?: string }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    texToMathML(tex, display).then((h) => live && setHtml(h), () => live && setHtml(null));
    return () => {
      live = false;
    };
  }, [tex, display]);
  if (html === null) return <code className={cn("text-sm text-slate-500", className)}>{tex}</code>;
  return <span className={cn("sb-math", display && "block overflow-x-auto py-1 text-xl", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}

function FormulaBlock({ b }: { b: Extract<LessonBlock, { kind: "formula" }> }) {
  const [selected, setActive] = useState<number>(-1);
  const [pointed, setPointed] = useState<number>(-1);
  const active = pointed >= 0 ? pointed : selected;
  const scope = useId();
  const color = (i: number) => PALETTE[i % PALETTE.length]!;
  const css = b.terms
    .map((t, i) => {
      const dim = active >= 0 && active !== i;
      return `[data-formula-scope="${scope}"] .sb-term-${t.id}{color:${color(i)};opacity:${dim ? 0.3 : 1};transition:opacity .25s${active === i ? `;filter:drop-shadow(0 0 6px ${color(i)})` : ""}}`;
    })
    .join("");
  const term = b.terms[active];
  return (
    <div className="sb-formula space-y-3" data-formula-scope={scope}>
      <style>{css}</style>
      <div onPointerMove={event => {
        if (event.pointerType === "touch" || !(event.target instanceof Element)) return;
        const target = event.target;
        const index = b.terms.findIndex(t => target.closest(".sb-term-" + t.id));
        setPointed(index);
      }} onPointerLeave={() => setPointed(-1)}>
        <Tex tex={b.tex} />
      </div>
      {b.terms.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <button className="grid size-7 place-items-center rounded-md ring-1 ring-[var(--line)] disabled:opacity-35" aria-label="Previous term" disabled={selected <= -1} onClick={() => setActive(selected - 1)}>
              <ChevronLeft size={14} />
            </button>
            <button className="grid size-7 place-items-center rounded-md ring-1 ring-[var(--line)] disabled:opacity-35" aria-label="Next term" disabled={selected >= b.terms.length - 1} onClick={() => setActive(selected + 1)}>
              <ChevronRight size={14} />
            </button>
            {b.terms.map((t, i) => (
              <button
                key={t.id}
                aria-pressed={selected === i}
                onClick={() => setActive(selected === i ? -1 : i)}
                className={cn("rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition", active === i ? "ring-2" : "ring-[var(--line)]")}
                style={{ color: color(i), ...(active === i ? { boxShadow: `0 0 0 2px ${color(i)}` } : {}) }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="min-h-5 text-sm text-slate-600 dark:text-slate-300">{term ? (term.note ?? term.label) : "Point to a term, or select its label to pin the explanation."}</p>
        </>
      )}
      {b.where.length > 0 && (
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          {b.where.map((w) => (
            <div key={w.sym} className="contents">
              <dt>
                <Tex tex={w.sym} display={false} />
              </dt>
              <dd className="text-slate-600 dark:text-slate-300">{w.meaning}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/* ---------- step by step with the current state ---------- */

function TraceBlock({ b }: { b: Extract<LessonBlock, { kind: "trace" }> }) {
  const [i, setI] = useState(0);
  const step = b.steps[i]!;
  const prev = i > 0 ? b.steps[i - 1]!.state : {};
  // state carries forward: a step only needs to list what changed
  const state = Object.assign({}, ...b.steps.slice(0, i + 1).map((s) => s.state)) as Record<string, string | number>;
  return (
    <div className="space-y-3">
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(110px, 1fr))` }}>
        {b.vars.map((v) => {
          const val = state[v.name];
          const changed = v.name in step.state && String(step.state[v.name]) !== String(prev[v.name] ?? "");
          const lit = step.highlight.includes(v.name);
          return (
            <div
              key={v.name}
              className={cn("rounded-lg px-3 py-2 ring-1 transition", lit ? "ring-2 ring-accent-500" : "ring-[var(--line)]", changed && "bg-accent-500/10")}
            >
              <p className="text-[11px] text-slate-500">{v.label ?? v.name}</p>
              <p className={cn("font-mono text-base font-semibold tabular-nums", changed && "text-accent-600 dark:text-sky-300")}>{val === undefined ? "–" : String(val)}</p>
            </div>
          );
        })}
      </div>
      <div className="min-h-12 rounded-lg bg-[var(--lane)] px-3 py-2 text-sm">
        <p>{step.text}</p>
        {step.tex && <Tex tex={step.tex} className="text-base" />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="grid size-8 place-items-center rounded-lg ring-1 ring-[var(--line)] disabled:opacity-35" aria-label="Previous step" disabled={i === 0} onClick={() => setI(i - 1)}>
          <ChevronLeft size={16} />
        </button>
        <button className="grid size-8 place-items-center rounded-lg ring-1 ring-[var(--line)] disabled:opacity-35" aria-label="Next step" disabled={i >= b.steps.length - 1} onClick={() => setI(i + 1)}>
          <ChevronRight size={16} />
        </button>
        <div className="flex max-w-full flex-wrap gap-1">
          {b.steps.map((_, j) => (
            <button key={j} aria-label={`Step ${j + 1}`} onClick={() => setI(j)} className={cn("h-1.5 w-5 rounded-full", j <= i ? "bg-sky-400" : "bg-slate-400/25")} />
          ))}
        </div>
        <span className="text-xs text-slate-500 tabular-nums">
          Step {i + 1}/{b.steps.length}
        </span>
      </div>
    </div>
  );
}

/* ---------- others ---------- */

function CheckBlock({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <p className="font-medium">{q}</p>
      {open ? (
        <div className="rounded-lg bg-[var(--lane)] px-3 py-2 text-sm">
          <Markdown text={a} />
        </div>
      ) : (
        <p className="text-sm text-slate-500">Answer it in your head first.</p>
      )}
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-600 hover:underline dark:text-sky-300">
        {open ? <EyeOff size={13} /> : <Eye size={13} />} {open ? "Hide answer" : "Reveal answer"}
      </button>
    </div>
  );
}

function EmbeddedVisual({ learning, id }: { learning: string; id: string }) {
  const v = useQuery({ queryKey: ["learning", learning, "visual", id], queryFn: () => api.visual(learning, id) });
  if (v.error) return <p className="text-sm text-rose-500">Visual “{id}” could not be loaded.</p>;
  if (!v.data) return null;
  return <Visual visual={v.data} learning={learning} />;
}
