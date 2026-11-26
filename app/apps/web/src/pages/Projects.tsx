import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { ProjectCard } from "../components/cards.tsx";
import { Button, Card, Dialog, Empty, ErrorNote, Field, inputClass, Loading, PageHeader } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { slugify } from "../lib/format.ts";

const FILTERS = ["active", "all"] as const;

export function Projects() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("active");
  const [creating, setCreating] = useState(false);
  const { data, error, isPending } = useQuery({ queryKey: ["projects"], queryFn: api.projects });
  const shown = (data ?? []).filter((p) => filter === "all" || p.status === "active");

  return (
    <>
      <PageHeader
        title="Projects"
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} /> New project
          </Button>
        }
      />
      <div className="seg mb-5">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f} className="capitalize"
          >
            {f}
          </button>
        ))}
      </div>

      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorNote error={error} />
      ) : shown.length ? (
        <div className="fk-project-index grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </div>
      ) : (
        <Card>
          <Empty>{filter === "active" ? "No active projects." : "No projects yet."}</Empty>
        </Card>
      )}

      <NewProjectDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function NewProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const goals = useQuery({ queryKey: ["goals"], queryFn: api.goals, enabled: open });
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState<"coding" | "general">("general");
  const [goal, setGoal] = useState("");
  const [due, setDue] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api.createProject({ id: slugify(title), title: title.trim(), template, goal: goal || null, due: due || null }),
    onSuccess: (p) => {
      qc.invalidateQueries();
      onClose();
      setTitle("");
      setDue("");
      navigate(`/projects/${p.id}`);
    },
  });

  return (
    <Dialog open={open} onClose={onClose} title="New project">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (slugify(title)) create.mutate();
        }}
      >
        <Field label="Title">
          <input autoFocus className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Home Lab" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <select className={inputClass} value={template} onChange={(e) => setTemplate(e.target.value as "coding" | "general")}>
              <option value="general">General</option>
              <option value="coding">Coding</option>
            </select>
          </Field>
          <Field label="Due">
            <input type="date" className={inputClass} value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
        <Field label="Goal">
          <select className={inputClass} value={goal} onChange={(e) => setGoal(e.target.value)}>
            <option value="">None</option>
            {goals.data?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </Field>
        <ErrorNote error={create.error} />
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!slugify(title) || create.isPending}>
            Create
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
