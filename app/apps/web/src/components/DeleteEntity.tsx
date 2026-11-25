/**
 * Delete a project or learning item. Shows exactly what goes (from the server's dry run) before anything is
 * written; one confirm deletes it all in a single change that Activity can undo.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../lib/api.ts";
import { Button, Dialog, ErrorNote } from "./ui.tsx";

export function DeleteEntity({ kind, id }: { kind: "projects" | "learning"; id: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const impact = useQuery({ queryKey: ["delete-impact", kind, id], queryFn: () => api.deleteImpact(kind, id), enabled: open, staleTime: 0 });
  const remove = useMutation({
    mutationFn: () => api.deleteEntity(kind, id),
    onSuccess: () => {
      setOpen(false);
      navigate(`/${kind}`);
      qc.invalidateQueries();
    },
  });
  const what = kind === "projects" ? "project" : "learning item";
  const i = impact.data;

  return (
    <>
      <Button variant="danger" className="py-2 text-xs" onClick={() => setOpen(true)} title={`Delete this ${what}`}>
        <Trash2 size={14} /> Delete
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Delete ${what}?`}>
        {impact.error ? (
          <ErrorNote error={impact.error} />
        ) : !i ? (
          <p className="text-sm text-slate-500">Checking what would be deleted…</p>
        ) : (
          <div className="space-y-3 text-sm">
            <p>
              <span className="font-semibold">{i.title}</span> and everything in it:
            </p>
            <ul className="list-disc space-y-0.5 pl-5 text-slate-600 dark:text-slate-300">
              {Object.entries(i.counts)
                .filter(([, n]) => n > 0)
                .map(([k, n]) => (
                  <li key={k}>{k === "map" ? "the system map" : `${n} ${n === 1 ? k.replace(/s$/, "") : k}`}</li>
                ))}
              {i.unlinked.length > 0 && <li>links removed from {i.unlinked.length} note(s) / event(s)</li>}
              {i.quizzes.length > 0 && <li>{i.quizzes.length} open quiz(zes) on it</li>}
            </ul>
            <p className="text-xs text-slate-500">Assessments and skill history stay. You can undo this from Activity.</p>
            <ErrorNote error={remove.error} />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                className="bg-rose-600 shadow-none hover:bg-rose-700 hover:shadow-none"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                <Trash2 size={14} /> Delete
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
