/** The index of visuals loads without their renderers or simulation engines. */
import { Link } from "react-router";
import { cn } from "../lib/format.ts";
import { VISUAL_META } from "./visuals/meta.tsx";

export function VisualList({ learning, items, className }: { learning: string; items: { id: string; title: string; type: keyof typeof VISUAL_META; steps: number }[]; className?: string }) {
  return (
    <ul className={cn("grid gap-2 sm:grid-cols-2", className)}>
      {items.map((x) => {
        const M = VISUAL_META[x.type];
        return (
          <li key={x.id}>
            <Link to={`/learning/${learning}/visuals/${x.id}`} className="flex items-center gap-2.5 rounded-lg px-3 py-2 ring-1 ring-[var(--line)] hover:bg-[var(--lane)] hover:ring-accent-400/50">
              <M.icon size={16} className="shrink-0 text-accent-600 dark:text-sky-300" />
              <span className="min-w-0 flex-1 truncate text-sm">{x.title}</span>
              <span className="shrink-0 text-[11px] text-slate-400">{x.steps ? `${x.steps} steps` : M.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
