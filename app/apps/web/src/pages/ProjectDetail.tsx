import { Link as LessonLink } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, CalendarClock, Check, ChevronRight, CodeXml, ExternalLink, GitBranch, Plus, Trash2 } from "lucide-react";
import { useState, type DragEvent } from "react";
import { Link, useParams } from "react-router";
import { IconTile } from "../components/cards.tsx";
import { DeleteEntity } from "../components/DeleteEntity.tsx";
import { Description } from "../components/Description.tsx";
import { SystemMap } from "../components/SystemMap.tsx";
import { Button, Card, Chip, Dialog, ErrorNote, Field, inputClass, Loading, ProgressBar, SectionTitle } from "../components/ui.tsx";
import { api, type ProjectView, type Task } from "../lib/api.ts";
import { cn, dueLabel, label, shortDate, todayIso } from "../lib/format.ts";

const COLUMNS: { status: Task["status"]; title: string; tint: string }[] = [
  { status: "todo", title: "To do", tint: "bg-slate-400" },
  { status: "doing", title: "Doing", tint: "bg-sky-500" },
  { status: "review", title: "Review", tint: "bg-amber-500" },
  { status: "done", title: "Done", tint: "bg-emerald-500" },
];
const PRIORITY_TONE = { urgent: "red", high: "amber", medium: "accent", low: "neutral" } as const;
const STATUSES = ["idea", "active", "paused", "done", "archived"] as const;

export function ProjectDetail() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const { data: p, error, isPending } = useQuery({ queryKey: ["project", id], queryFn: () => api.project(id) });
  const [editing, setEditing] = useState<Task | null>(null);

  const refresh = () => qc.invalidateQueries();
  const updateProject = useMutation({
    mutationFn: (patch: Parameters<typeof api.updateProject>[1]) => api.updateProject(id, patch),
    onSettled: refresh,
  });
  // Optimistic move so drag & drop feels instant.
  const moveTask = useMutation({
    mutationFn: ({ task, status }: { task: string; status: Task["status"] }) => api.updateTask(id, task, { status }),
    onMutate: ({ task, status }) => {
      qc.setQueryData<ProjectView>(["project", id], (old) =>
        old ? { ...old, tasks: old.tasks.map((t) => (t.id === task ? { ...t, status } : t)) } : old,
      );
    },
    onSettled: refresh,
  });
  const addTask = useMutation({
    mutationFn: (input: { title: string; status: Task["status"] }) => api.addTask(id, input),
    onSettled: refresh,
  });

  if (isPending) return <Loading />;
  if (error || !p) return <ErrorNote error={error ?? "Not found"} />;

  const mutationError = updateProject.error ?? moveTask.error ?? addTask.error;

  return (
    <>
      <nav className="mb-4 flex items-center gap-1 text-xs text-slate-500">
        <Link to="/projects" className="hover:text-accent-600">
          Projects
        </Link>
        <ChevronRight size={12} />
        <span className="text-slate-700 dark:text-slate-300">{p.title}</span>
      </nav>

      <header className="mb-6 flex flex-wrap items-start gap-4">
        <IconTile tone="accent">{p.template === "coding" ? <CodeXml size={18} /> : <Box size={18} />}</IconTile>
        <div className="min-w-0 flex-1">
          <h1 className="hud-title text-3xl">{p.title}</h1>
          {p.body && <Description body={p.body} />}
        </div>
        <select
          aria-label="Status"
          className={cn(inputClass.replace("w-full", "w-auto"), "capitalize")}
          value={p.status}
          onChange={(e) => updateProject.mutate({ status: e.target.value as (typeof STATUSES)[number] })}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
        <DeleteEntity kind="projects" id={p.id} />
      </header>

      {mutationError && (
        <div className="mb-4">
          <ErrorNote error={mutationError} />
        </div>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-5 flex items-baseline justify-between">
            <div>
              <p className="text-xs text-slate-500">Phase</p>
              <p className="hud-title text-xl">{label(p.phase)}</p>
            </div>
            <div className="text-right">
              <p className="hud-number text-3xl text-accent-600 dark:text-sky-300">{p.progress}%</p>
              <p className="text-xs text-slate-400">{p.progress_override != null ? "Set manually" : "From tasks"}</p>
            </div>
          </div>
          <ProgressBar value={p.progress} className="mb-6" />
          <PhaseStepper phases={p.phases} current={p.phase} onSelect={(phase) => updateProject.mutate({ phase })} />
        </Card>

        <Card>
          <dl className="space-y-3 text-sm">
            {(p.start || p.due) && (
              <Info icon={<CalendarClock size={15} />} title="Timeline">
                {p.start ? shortDate(p.start) : "—"} → {p.due ? shortDate(p.due) : "—"}
              </Info>
            )}
            {p.repo && (
              <Info icon={<GitBranch size={15} />} title="Repository">
                <a
                  href={p.repo.startsWith("http") ? p.repo : `https://${p.repo}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 break-all text-accent-600 hover:underline"
                >
                  {p.repo.replace(/^https?:\/\//, "")} <ExternalLink size={12} />
                </a>
              </Info>
            )}
            {p.stack && p.stack.length > 0 && (
              <Info icon={<CodeXml size={15} />} title="Stack">
                <span className="flex flex-wrap gap-1">
                  {p.stack.map((s) => (
                    <Chip key={s}>{s}</Chip>
                  ))}
                </span>
              </Info>
            )}
            {p.goal && (
              <Info icon={<Check size={15} />} title="Goal">
                {label(p.goal)}
              </Info>
            )}
          </dl>
        </Card>
      </div>

      <SystemMap project={p.id} tasks={p.tasks} />

      <SectionTitle>Tasks ({p.tasks.length})</SectionTitle>
      <Kanban
        tasks={p.tasks}
        onMove={(task, status) => moveTask.mutate({ task, status })}
        onAdd={(title, status) => addTask.mutate({ title, status })}
        onOpen={setEditing}
      />

      <TaskDialog project={p} task={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function Info({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-slate-500">{title}</dt>
        <dd className="mt-0.5">{children}</dd>
      </div>
    </div>
  );
}

function PhaseStepper({ phases, current, onSelect }: { phases: string[]; current: string; onSelect: (p: string) => void }) {
  const at = phases.indexOf(current);
  return (
    <ol className="flex items-start">
      {phases.map((phase, i) => (
        <li key={phase} className="flex flex-1 flex-col items-center last:flex-none">
          <div className="flex w-full items-center">
            <button
              onClick={() => onSelect(phase)}
              title={`Set phase: ${label(phase)}`}
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border-2 transition",
                i < at && "border-emerald-500 bg-emerald-500 text-white",
                i === at && "border-accent-600 bg-[var(--panel-solid)] ring-4 ring-accent-100 dark:border-sky-400 dark:ring-sky-400/20 dark:shadow-[0_0_12px_rgb(var(--glow-rgb)/0.6)]",
                i > at && "border-[var(--line)] bg-[var(--panel-solid)] hover:border-accent-500",
              )}
            >
              {i < at ? <Check size={13} strokeWidth={3} /> : i === at ? <span className="size-2 rounded-full bg-accent-600" /> : null}
            </button>
            {i < phases.length - 1 && <div className={cn("h-0.5 flex-1", i < at ? "bg-emerald-500" : "bg-[var(--line)]")} />}
          </div>
          <span
            className={cn(
              "mt-2 -ml-6 w-12 text-center text-[11px] sm:w-16 sm:text-xs",
              i === at ? "font-semibold text-slate-900 dark:text-white" : "text-slate-500",
              i === phases.length - 1 && "ml-0",
            )}
          >
            {label(phase)}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Kanban({
  tasks,
  onMove,
  onAdd,
  onOpen,
}: {
  tasks: Task[];
  onMove: (task: string, status: Task["status"]) => void;
  onAdd: (title: string, status: Task["status"]) => void;
  onOpen: (t: Task) => void;
}) {
  const [over, setOver] = useState<string | null>(null);
  const today = todayIso();

  const drop = (e: DragEvent, status: Task["status"]) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData("text/task");
    const task = tasks.find((t) => t.id === id);
    if (task && task.status !== status) onMove(id, status);
  };

  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-4">
      {COLUMNS.map((col) => {
        const items = tasks.filter((t) => t.status === col.status);
        return (
          <section
            key={col.status}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(col.status);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => drop(e, col.status)}
            className={cn(
              "lane flex w-[78vw] shrink-0 snap-start flex-col p-2.5 transition sm:w-auto",
              over === col.status && "bg-accent-50 ring-2 ring-accent-200 dark:bg-accent-500/10",
            )}
          >
            <h3 className="mb-2 flex items-center gap-2 px-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <span className={cn("size-2 rounded-full", col.tint)} />
              {col.title}
              <span className="font-normal text-slate-400">{items.length}</span>
            </h3>
            <ul className="flex min-h-12 flex-1 flex-col gap-2">
              {items.map((t) => {
                const overdue = !!t.due && t.status !== "done" && t.due < today;
                return (
                  <li
                    key={t.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/task", t.id)}
                    onClick={() => onOpen(t)}
                    className="tile tile-hover cursor-grab p-3 text-sm active:cursor-grabbing"
                  >
                    <p className={cn("leading-snug", t.status === "done" && "text-slate-400 line-through")}>{t.title}</p>
                    {(t.priority !== "medium" || t.due || t.phase) && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {t.priority !== "medium" && <Chip tone={PRIORITY_TONE[t.priority]}>{label(t.priority)}</Chip>}
                        {t.due && t.status !== "done" && (
                          <Chip tone={overdue ? "red" : "neutral"}>
                            <CalendarClock size={11} />
                            {dueLabel(t.due, today)}
                          </Chip>
                        )}
                        {t.phase && <span className="text-[11px] text-slate-400">{label(t.phase)}</span>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <AddTask onAdd={(title) => onAdd(title, col.status)} />
          </section>
        );
      })}
    </div>
  );
}

function AddTask({ onAdd }: { onAdd: (title: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-[var(--panel-solid)] hover:text-accent-600"
      >
        <Plus size={14} /> Add task
      </button>
    );
  }
  return (
    <form
      className="mt-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) onAdd(title.trim());
        setTitle("");
      }}
    >
      <input
        autoFocus
        className={cn(inputClass, "py-1.5")}
        placeholder="Task title, Enter to add"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => !title && setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      />
    </form>
  );
}

function TaskDialog({ project, task, onClose }: { project: ProjectView; task: Task | null; onClose: () => void }) {
  return (
    <Dialog open={!!task} onClose={onClose} title="Task">
      {task && <TaskForm key={task.id} project={project} task={task} onClose={onClose} />}
    </Dialog>
  );
}

function TaskForm({ project, task, onClose }: { project: ProjectView; task: Task; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: task.title,
    status: task.status,
    priority: task.priority,
    due: task.due ?? "",
    phase: task.phase ?? "",
    topic_refs: task.topic_refs ?? [],
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const done = () => {
    qc.invalidateQueries();
    onClose();
  };
  const save = useMutation({
    mutationFn: () =>
      api.updateTask(project.id, task.id, { ...form, title: form.title.trim(), due: form.due || null, phase: form.phase || null }),
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: () => api.deleteTask(project.id, task.id), onSuccess: done });
  const lessons = useQuery({queryKey:["lesson-options"], queryFn:api.lessonOptions});
  const [lesson,setLesson] = useState("");


  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Title">
        <input className={inputClass} value={form.title} onChange={(e) => set("title", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          <select className={inputClass} value={form.status} onChange={(e) => set("status", e.target.value as Task["status"])}>
            {COLUMNS.map((c) => (
              <option key={c.status} value={c.status}>
                {c.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select className={inputClass} value={form.priority} onChange={(e) => set("priority", e.target.value as Task["priority"])}>
            {(["low", "medium", "high", "urgent"] as const).map((p) => (
              <option key={p} value={p}>
                {label(p)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Due">
          <input type="date" className={inputClass} value={form.due} onChange={(e) => set("due", e.target.value)} />
        </Field>
        <Field label="Phase">
          <select className={inputClass} value={form.phase} onChange={(e) => set("phase", e.target.value)}>
            <option value="">None</option>
            {project.phases.map((ph) => (
              <option key={ph} value={ph}>
                {label(ph)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="space-y-2">
        <Field label="Related lessons">
          <select className={inputClass} value={lesson} onChange={e=>setLesson(e.target.value)}>
            <option value="">Choose a lesson</option>
            {(lessons.data ?? []).filter(l=>!form.topic_refs.includes(l.ref)).map(l=><option key={l.ref} value={l.ref}>{l.course} · {l.title}</option>)}
          </select>
        </Field>
        <Button type="button" disabled={!lesson || form.topic_refs.length>=12} onClick={()=>{set("topic_refs",[...form.topic_refs,lesson]);setLesson("");}}>Add lesson link</Button>
        {form.topic_refs.map(ref=>{
          const link=lessons.data?.find(l=>l.ref===ref);
          return <div className="flex flex-wrap items-center gap-2 text-sm" key={ref}>
            {link?<LessonLink className="underline" to={link.url}>{link.title}</LessonLink>:<span title={ref}>Lesson not available</span>}
            <Button type="button" onClick={()=>set("topic_refs",form.topic_refs.filter(x=>x!==ref))}>Remove link</Button>
          </div>;
        })}
      </div>
      <ErrorNote error={save.error ?? remove.error} />
      <div className="flex items-center justify-between pt-1">
        <Button
          type="button"
          variant="danger"
          onClick={() => confirm(`Delete "${task.title}"?`) && remove.mutate()}
          disabled={remove.isPending}
        >
          <Trash2 size={15} /> Delete
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!form.title.trim() || save.isPending}>
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}
