import { BookOpen, Box, CalendarClock, CodeXml, GraduationCap } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { LearningSummary, ProjectSummary } from "../lib/api.ts";
import { cn, daysFrom, dueLabel, label, shortDate, todayIso } from "../lib/format.ts";
import { useLayout } from "../lib/theme.ts";
import { Chip, ProgressBar, ProgressRing } from "./ui.tsx";

export function IconTile({ children, tone }: { children: ReactNode; tone: "accent" | "green" | "blue" }) {
  return (
    <span
      className={cn(
        "sb-icon-tile grid size-10 shrink-0 place-items-center rounded-lg",
        tone === "accent" && "bg-accent-50 text-accent-600 ring-1 ring-accent-200 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/40 dark:shadow-[0_0_12px_rgb(var(--glow-rgb)/0.3)]",
        tone === "green" && "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/40",
        tone === "blue" && "bg-sky-50 text-sky-600 ring-1 ring-sky-200 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/40",
      )}
    >
      {children}
    </span>
  );
}

const cardClass =
  "tile block p-4";
const hoverClass = "tile-hover";

/** Bar in most layouts; a ring with the number inside in Bento. */
function Progress({ value, color }: { value: number; color?: "blue" | "green" }) {
  const [layout] = useLayout();
  if (layout === "bento") {
    return (
      <div className="mt-4 flex items-center gap-3">
        <span className="relative grid place-items-center">
          <ProgressRing value={value} size={52} />
          <span className="absolute text-xs font-bold tabular-nums">{value}%</span>
        </span>
        <span className="text-xs text-slate-500">done</span>
      </div>
    );
  }
  return (
    <div className="mt-4 flex items-center gap-3">
      <ProgressBar value={value} color={color} />
      <span className="w-9 text-right text-xs font-semibold tabular-nums">{value}%</span>
    </div>
  );
}

export function ProjectCard({ p }: { p: ProjectSummary }) {
  const open = p.tasks.todo + p.tasks.doing + p.tasks.review;
  const overdue = !!p.due && p.status !== "done" && daysFrom(todayIso(), p.due) < 0;
  return (
    <Link to={`/projects/${p.id}`} className={cn(cardClass, hoverClass)}>
      <div className="flex items-start gap-3">
        <IconTile tone="accent">{p.template === "coding" ? <CodeXml size={18} /> : <Box size={18} />}</IconTile>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-lg leading-tight font-semibold tracking-wide text-slate-900 dark:text-sky-50">{p.title}</h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span>{label(p.phase)}</span>
            {p.status !== "active" && <Chip>{label(p.status)}</Chip>}
          </div>
        </div>
      </div>
      <Progress value={p.progress} />
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>{open} open</span>
        {p.due && (
          <span className={cn("flex items-center gap-1", overdue && "text-rose-600")}>
            <CalendarClock size={13} />
            {overdue ? dueLabel(p.due) : shortDate(p.due)}
          </span>
        )}
      </div>
    </Link>
  );
}

export function LearningCard({ l }: { l: LearningSummary }) {
  return (
    <Link to={`/learning/${l.id}`} className={cn(cardClass, hoverClass)}>
      <div className="flex items-start gap-3">
        <IconTile tone={l.type === "course" ? "blue" : "green"}>
          {l.type === "course" ? <GraduationCap size={18} /> : <BookOpen size={18} />}
        </IconTile>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-lg leading-tight font-semibold tracking-wide text-slate-900 dark:text-sky-50">{l.title}</h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span>{l.type === "course" ? "Course" : "Roadmap"}</span>
            <span>·</span>
            <span>{l.topics} topics</span>
            {l.needs_review > 0 && <Chip tone="amber">{l.needs_review} to review</Chip>}
          </div>
        </div>
      </div>
      <Progress value={l.progress} color={l.type === "course" ? "blue" : "green"} />
      {l.next_exam?.date && (
        <p className="mt-3 flex items-center gap-1 text-xs text-slate-500">
          <CalendarClock size={13} />
          {l.next_exam.title} · {dueLabel(l.next_exam.date)}
        </p>
      )}
    </Link>
  );
}
