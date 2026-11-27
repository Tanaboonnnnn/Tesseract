import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api.ts";
import { Button, Dialog, ErrorNote } from "./ui.tsx";

export function DeleteRecord({ kind, id, title, completed, onDeleted }: {
  kind: "quiz" | "note";
  id: string;
  title: string;
  completed?: boolean;
  onDeleted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const deletion = useMutation({
    mutationFn: () => kind === "quiz" ? api.deleteQuiz(id) : api.deleteNote(id),
    onSuccess: () => {
      setOpen(false);
      onDeleted?.();
      void qc.invalidateQueries();
    },
  });

  return (
    <>
      <Button
        type="button"
        variant="danger"
        className="min-h-10 shrink-0 border border-current/25 text-xs"
        aria-label={`Delete ${kind}: ${title}`}
        onClick={() => { deletion.reset(); setOpen(true); }}
      >
        <Trash2 size={14} aria-hidden="true" /> Delete
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Delete ${kind}?`}>
        <p className="break-words text-sm"><strong>{title}</strong> will be removed.</p>
        <p className="mt-2 text-sm muted">
          {kind === "note" && "Saved links to this note will be removed from notes and events. "}
          {kind === "quiz" && completed && "Your score and assessment will be kept. "}
          Undo this change in Activity.
        </p>
        <ErrorNote error={deletion.error} />
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={deletion.isPending}>Cancel</Button>
          <Button type="button" variant="danger" className="border border-current/25" onClick={() => deletion.mutate()} disabled={deletion.isPending}>
            <Trash2 size={14} aria-hidden="true" /> {deletion.isPending ? "Deleting…" : `Delete ${kind}`}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
