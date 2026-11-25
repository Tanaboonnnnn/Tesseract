import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Monitor, Undo2 } from "lucide-react";
import { useState } from "react";
import { Button, Card, Empty, ErrorNote, Loading, PageHeader } from "../components/ui.tsx";
import { api, type ActivitySummary } from "../lib/api.ts";
import { cn } from "../lib/format.ts";

function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function Activity() {
  const { data, error, isPending } = useQuery({ queryKey: ["activity"], queryFn: api.activity });
  return (
    <>
      <PageHeader title="Activity" subtitle="The last 20 changes by you and your AI clients. Undo any of them." />
      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorNote error={error} />
      ) : data.length ? (
        <Card className="p-0">
          <ul className="divide-y divide-[var(--line)]">
            {data.map((e) => (
              <Entry key={e.id} e={e} />
            ))}
          </ul>
        </Card>
      ) : (
        <Card>
          <Empty>No changes yet.</Empty>
        </Card>
      )}
    </>
  );
}

function Entry({ e }: { e: ActivitySummary }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const undo = useMutation({ mutationFn: () => api.undo(e.id), onSuccess: () => qc.invalidateQueries() });
  const human = e.agent === "web-ui";
  const Icon = human ? Monitor : Bot;

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
            human ? "bg-slate-100 text-slate-500 dark:bg-white/10" : "bg-accent-50 text-accent-600 dark:bg-accent-500/15",
          )}
          title={human ? "Web app" : "AI client"}
        >
          <Icon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm", e.action === "undo" && "text-slate-500 italic")}>{e.summary}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            <span className="font-medium text-slate-500 dark:text-slate-400">{e.agent}</span> · {timeAgo(e.ts)} ·{" "}
            <button onClick={() => setOpen((o) => !o)} className="hover:text-accent-600">
              {e.files.length} file{e.files.length > 1 ? "s" : ""}
            </button>
          </p>
          {open && (
            <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-slate-400">
              {e.files.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
          {undo.error && (
            <div className="mt-2">
              <ErrorNote error={undo.error} />
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          className="shrink-0 px-2 py-1 text-xs"
          disabled={undo.isPending}
          onClick={() => confirm(`Undo "${e.summary}"?`) && undo.mutate()}
        >
          <Undo2 size={14} /> Undo
        </Button>
      </div>
    </li>
  );
}
