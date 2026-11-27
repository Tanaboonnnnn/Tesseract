import { useQuery } from "@tanstack/react-query";
import { NotebookPen, Plus, Scale, ScrollText, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { DeleteRecord } from "../components/DeleteRecord.tsx";
import { Card, Chip, Empty, ErrorNote, inputClass, Loading, PageHeader } from "../components/ui.tsx";
import { api, type NoteSummary } from "../lib/api.ts";
import { cn, shortDate } from "../lib/format.ts";

export const NOTE_TYPES = {
  note: { label: "Note", icon: NotebookPen, tone: "accent" },
  decision: { label: "Decision", icon: Scale, tone: "amber" },
  log: { label: "Log", icon: ScrollText, tone: "blue" },
} as const;

const FILTERS = [
  { id: "all", label: "All" },
  { id: "note", label: "Notes" },
  { id: "decision", label: "Decisions" },
  { id: "log", label: "Logs" },
] as const;

export function Notes() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [q, setQ] = useState("");
  const { data, error, isPending } = useQuery({ queryKey: ["notes"], queryFn: () => api.notes() });

  const needle = q.trim().toLowerCase();
  const shown = (data ?? [])
    .filter((n) => filter === "all" || n.type === filter)
    .filter((n) => !needle || `${n.title} ${n.excerpt} ${n.tags.join(" ")}`.toLowerCase().includes(needle));

  return (
    <>
      <PageHeader
        title="Notes"
        action={
          <Link to="/notes/new" className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-2 text-sm font-medium text-white hover:bg-accent-700">
            <Plus size={16} /> New note
          </Link>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="seg">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
          <input className={cn(inputClass, "pl-9")} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search notes" />
        </label>
      </div>

      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorNote error={error} />
      ) : shown.length ? (
        <ul className="fk-index-grid grid gap-3 sm:grid-cols-2">
          {shown.map((n) => (
            <NoteCard key={n.id} n={n} />
          ))}
        </ul>
      ) : (
        <Card>
          <Empty>{data?.length ? "No matching notes." : "No notes yet."}</Empty>
        </Card>
      )}
    </>
  );
}

function NoteCard({ n }: { n: NoteSummary }) {
  const t = NOTE_TYPES[n.type];
  const Icon = t.icon;
  return (
    <li className="tile tile-hover flex flex-col">
      <Link to={`/notes/${n.id}`} className="block flex-1 p-4 pb-2">
        <div className="flex items-start gap-2.5">
          <Icon size={17} className="mt-0.5 shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-lg leading-tight font-semibold tracking-wide text-slate-900 dark:text-sky-50">{n.title}</h3>
            {n.excerpt && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{n.excerpt}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
              <Chip tone={t.tone}>{t.label}</Chip>
              {n.tags.map((tag) => (
                <span key={tag}>#{tag}</span>
              ))}
              <span className="ml-auto">{shortDate(n.updated)}</span>
            </div>
          </div>
        </div>
      </Link>
      <div className="flex justify-end px-4 pb-3">
        <DeleteRecord kind="note" id={n.id} title={n.title} />
      </div>
    </li>
  );
}
