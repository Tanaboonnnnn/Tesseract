import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/format.ts";
import { Markdown } from "./Markdown.tsx";

/** Project / learning body as Markdown. Long bodies show the first paragraph until expanded. */
export function Description({ body }: { body: string }) {
  const [open, setOpen] = useState(false);
  const text = body.trim();
  const cut = text.search(/\n\s*\n/);
  const hasMore = cut !== -1;
  return (
    <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
      <Markdown text={open || !hasMore ? text : text.slice(0, cut)} />
      {hasMore && (
        <button
          onClick={() => setOpen(!open)}
          className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-accent-600 hover:underline dark:text-sky-300"
        >
          <ChevronDown size={13} className={cn("transition", open && "rotate-180")} />
          {open ? "Show less" : "Show details"}
        </button>
      )}
    </div>
  );
}
