import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CalendarClock, ChevronRight, Circle, CircleAlert, CircleCheck, CircleDot, GraduationCap, ListChecks, Play, Plus, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { IconTile } from "../components/cards.tsx";
import { DeleteEntity } from "../components/DeleteEntity.tsx";
import { Description } from "../components/Description.tsx";
import { LearningMap } from "../components/LearningMap.tsx";
import { Card, Chip, ErrorNote, inputClass, Loading, ProgressBar, SectionTitle } from "../components/ui.tsx";
import { api, type LearningView, type TopicView, type VisualSummary } from "../lib/api.ts";
import { VisualList } from "../components/VisualList.tsx";
import { cn, dueLabel, label, shortDate, slugify, todayIso } from "../lib/format.ts";
import { REVIEW_REASON, TOPIC_STATUS_LABEL } from "../lib/labels.ts";

type Status = TopicView["status"];

const STATUS_ICON: Record<Status, React.ReactNode> = {
  "not-started": <Circle size={18} className="text-slate-300 dark:text-slate-600" />,
  learning: <CircleDot size={18} className="text-sky-500" />,
  understood: <CircleCheck size={18} className="text-emerald-500" />,
  "needs-review": <CircleAlert size={18} className="text-amber-500" />,
};

export function LearningDetail() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const { data: l, error, isPending } = useQuery({ queryKey: ["learning", id], queryFn: () => api.learningItem(id) });
  const skills = useQuery({ queryKey: ["skills"], queryFn: api.skills });
  const quizzes = useQuery({ queryKey: ["quizzes"], queryFn: api.quizzes });
  const visuals = useQuery({ queryKey: ["learning", id, "visuals"], queryFn: () => api.visuals(id) });

  const skillTitle = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of skills.data ?? []) for (const s of d.skills) m.set(s.id, s.title);
    return (sid: string) => m.get(sid) ?? label(sid);
  }, [skills.data]);

  const update = useMutation({
    mutationFn: ({ topic, status }: { topic: string; status: Status }) => api.updateTopic(id, topic, { status }),
    onSettled: () => qc.invalidateQueries(),
  });

  if (isPending) return <Loading />;
  if (error || !l) return <ErrorNote error={error ?? "Not found"} />;

  const understood = l.topics.filter((t) => t.status === "understood").length;
  const toReview = l.topics.filter((t) => t.review.reasons.length > 0).length;
  const openQuizzes = (quizzes.data ?? []).filter(
    (q) => q.status === "open" && q.topic_refs.some((r) => r.startsWith(`learning/${l.id}#`)),
  );

  return (
    <>
      <nav className="mb-4 flex items-center gap-1 text-xs text-slate-500">
        <Link to="/learning" className="hover:text-accent-600">
          Learning
        </Link>
        <ChevronRight size={12} />
        <span className="text-slate-700 dark:text-slate-300">{l.title}</span>
      </nav>

      <header className="mb-6 flex items-start gap-4">
        <IconTile tone={l.type === "course" ? "blue" : "green"}>
          {l.type === "course" ? <GraduationCap size={18} /> : <BookOpen size={18} />}
        </IconTile>
        <div className="min-w-0 flex-1">
          <h1 className="hud-title text-3xl">{l.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {l.type === "course" ? `Course${l.term ? ` · ${l.term}` : ""}` : "Roadmap"}
            {l.goal && <> · {label(l.goal)}</>}
          </p>
          {l.body && <Description body={l.body} />}
        </div>
        <DeleteEntity kind="learning" id={l.id} />
      </header>

      {update.error && (
        <div className="mb-4">
          <ErrorNote error={update.error} />
        </div>
      )}

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Progress</p>
          <p className="hud-number text-2xl">{l.progress}%</p>
          <ProgressBar value={l.progress} color={l.type === "course" ? "blue" : "green"} className="mt-2" />
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Understood</p>
          <p className="text-xl font-semibold tabular-nums">
            {understood}
            <span className="text-sm font-normal text-slate-400">/{l.topics.length}</span>
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">To review</p>
          <p className={cn("text-xl font-semibold tabular-nums", toReview > 0 && "text-amber-600")}>{toReview}</p>
        </Card>
      </div>

      {openQuizzes.length > 0 && (
        <Card className="mb-6 flex flex-wrap items-center gap-3 border-accent-200 bg-accent-50/60 dark:border-accent-500/30 dark:bg-accent-500/10">
          <ListChecks size={18} className="text-accent-600" />
          <p className="flex-1 text-sm">
            {openQuizzes.length === 1 ? "A quiz is ready" : `${openQuizzes.length} quizzes are ready`} for this {l.type}.
          </p>
          {openQuizzes.map((q) => (
            <Link key={q.id} to={`/quizzes/${q.id}`} className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700">
              Take “{q.title}”
            </Link>
          ))}
        </Card>
      )}

      <LearningMap id={l.id} />

      {l.topics.length > 0 && (
        <Card className="mb-6">
          <SectionTitle>Visuals</SectionTitle>
          {visuals.data?.length ? (
            <VisualList learning={l.id} items={visuals.data} />
          ) : (
            <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Sparkles size={15} className="shrink-0 text-accent-600 dark:text-sky-300" />
              No visuals yet. Ask your AI: “Make a visual for {l.topics[0]!.title} with steps.”
            </p>
          )}
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className={cn("space-y-6", l.type === "course" ? "lg:col-span-2" : "lg:col-span-3")}>
          <RoadmapPath l={l} visuals={visuals.data ?? []} skillTitle={skillTitle} onStatus={(topic, status) => update.mutate({ topic, status })} />
        </div>
        {l.type === "course" && <CoursePanel l={l} />}
      </div>
    </>
  );
}

function RoadmapPath({
  l,
  visuals,
  skillTitle,
  onStatus,
}: {
  l: LearningView;
  visuals: VisualSummary[];
  skillTitle: (id: string) => string;
  onStatus: (topic: string, status: Status) => void;
}) {
  const titles = new Map(l.topics.map((t) => [t.id, t.title]));
  return (
    <ol className="space-y-4">
      {l.phases.map((phase, i) => {
        const topics = l.topics.filter((t) => t.phase === phase);
        const done = topics.filter((t) => t.status === "understood").length;
        const complete = topics.length > 0 && done === topics.length;
        return (
          <li key={phase} className="relative pl-10">
            {i < l.phases.length - 1 && <span className="absolute top-8 bottom-[-1rem] left-[13px] w-0.5 bg-[var(--line)]" />}
            <span
              className={cn(
                "absolute top-1 left-0 grid size-7 place-items-center rounded-full text-xs font-semibold",
                complete ? "bg-emerald-500 text-white" : "bg-[var(--panel-solid)] text-accent-600 ring-1 ring-[var(--line-strong)] dark:text-sky-300",
              )}
            >
              {complete ? <CircleCheck size={15} /> : i + 1}
            </span>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="hud-title text-base">{label(phase)}</h3>
              <span className="text-xs text-slate-400 tabular-nums">
                {done}/{topics.length}
              </span>
            </div>
            <Card className="p-0">
              {topics.length === 0 ? (
                <p className="px-4 py-3 text-sm text-slate-400">No topics yet.</p>
              ) : (
                <ul className="divide-y divide-[var(--line)]">
                  {topics.map((t) => (
                    <TopicRow key={t.id} t={t} learning={l.id} visuals={visuals.filter((v) => v.topic === t.id)} skillTitle={skillTitle} after={t.depends_on.map((d) => titles.get(d) ?? d)} onStatus={onStatus} />
                  ))}
                </ul>
              )}
              <AddTopic learningId={l.id} phase={phase} />
            </Card>
          </li>
        );
      })}
    </ol>
  );
}

function TopicRow({
  t,
  learning,
  visuals,
  skillTitle,
  after,
  onStatus,
}: {
  t: TopicView;
  learning: string;
  visuals: VisualSummary[];
  skillTitle: (id: string) => string;
  after: string[];
  onStatus: (topic: string, status: Status) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <span title={TOPIC_STATUS_LABEL[t.effective_status]}>{STATUS_ICON[t.effective_status]}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{t.title}</span>
          {t.review.reasons.map((r) => (
            <Chip key={r} tone={REVIEW_REASON[r]?.tone}>
              <span title={REVIEW_REASON[r]?.hint}>{REVIEW_REASON[r]?.text ?? r}</span>
            </Chip>
          ))}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
          {t.skills.map((s) => (
            <Link key={s} to={`/skills?skill=${s}`} className="hover:text-accent-600">
              {skillTitle(s)}
            </Link>
          ))}
          {after.length > 0 && <span>After {after.join(", ")}</span>}
          {t.last_score != null && <span className={cn(t.last_score < 60 && "text-rose-500")}>Last score {t.last_score}</span>}
          {t.last_reviewed && <span>Reviewed {shortDate(t.last_reviewed)}</span>}
        </div>
      </div>
      {visuals.length > 0 && (
        <Link
          to={`/learning/${learning}/visuals/${visuals[0]!.id}`}
          title={visuals.map((v) => v.title).join(" · ")}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-accent-600 ring-1 ring-accent-400/40 hover:bg-accent-500/10 dark:text-sky-300"
        >
          <Play size={12} /> Review{visuals.length > 1 ? ` (${visuals.length})` : ""}
        </Link>
      )}
      <select
        aria-label={`Status of ${t.title}`}
        value={t.status}
        onChange={(e) => onStatus(t.id, e.target.value as Status)}
        className={cn(inputClass.replace("w-full", "w-auto"), "py-1 text-xs")}
      >
        {(Object.keys(TOPIC_STATUS_LABEL) as Status[]).map((s) => (
          <option key={s} value={s}>
            {TOPIC_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    </li>
  );
}

function AddTopic({ learningId, phase }: { learningId: string; phase: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const add = useMutation({
    mutationFn: () => api.addTopic(learningId, { id: slugify(title), title: title.trim(), phase }),
    onSuccess: () => {
      setTitle("");
      qc.invalidateQueries();
    },
  });
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1 border-t border-[var(--line)] px-4 py-2 text-xs text-slate-500 hover:text-accent-600"
      >
        <Plus size={14} /> Add topic
      </button>
    );
  }
  return (
    <form
      className="space-y-2 border-t border-[var(--line)] p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (slugify(title)) add.mutate();
      }}
    >
      <input
        autoFocus
        className={cn(inputClass, "py-1.5")}
        placeholder="Topic title, Enter to add"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => !title && setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      />
      <ErrorNote error={add.error} />
    </form>
  );
}

function CoursePanel({ l }: { l: LearningView }) {
  const today = todayIso();
  return (
    <div className="space-y-6">
      {l.exams && l.exams.length > 0 && (
        <Card>
          <SectionTitle>Exams</SectionTitle>
          <ul className="space-y-3">
            {l.exams.map((e) => (
              <li key={e.id} className="flex items-center gap-3 text-sm">
                <CalendarClock size={16} className="shrink-0 text-slate-400" />
                <div className="flex-1">
                  <p className="font-medium">{e.title}</p>
                  <p className="text-xs text-slate-500">
                    {e.date ? `${shortDate(e.date)} · ${e.date >= today ? dueLabel(e.date, today) : "Past"}` : "No date"}
                    {e.weight != null && ` · ${e.weight}%`}
                  </p>
                </div>
                {e.score != null && (
                  <span className="text-sm font-semibold tabular-nums">
                    {e.score}
                    {e.max_score != null && <span className="text-xs font-normal text-slate-400">/{e.max_score}</span>}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {l.assignments && l.assignments.length > 0 && (
        <Card>
          <SectionTitle>Assignments</SectionTitle>
          <ul className="space-y-3">
            {l.assignments.map((a) => (
              <li key={a.id} className="flex items-center gap-3 text-sm">
                {a.status === "done" ? (
                  <CircleCheck size={16} className="shrink-0 text-emerald-500" />
                ) : (
                  <Circle size={16} className="shrink-0 text-slate-300" />
                )}
                <div className="flex-1">
                  <p className={cn("font-medium", a.status === "done" && "text-slate-400 line-through")}>{a.title}</p>
                  {a.due && a.status !== "done" && (
                    <p className={cn("text-xs", a.due < today ? "text-rose-600" : "text-slate-500")}>{dueLabel(a.due, today)}</p>
                  )}
                </div>
                {a.score != null && (
                  <span className="text-sm font-semibold tabular-nums">
                    {a.score}
                    {a.max_score != null && <span className="text-xs font-normal text-slate-400">/{a.max_score}</span>}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {l.schedule && l.schedule.length > 0 && (
        <Card>
          <SectionTitle>Schedule</SectionTitle>
          <ul className="space-y-1.5 text-sm">
            {l.schedule.map((s, i) => (
              <li key={i} className="flex justify-between">
                <span className="capitalize">{s.day}</span>
                <span className="text-slate-500">
                  {s.time}
                  {s.room && ` · ${s.room}`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {l.grade && (
        <Card>
          <p className="text-xs text-slate-500">Grade</p>
          <p className="text-2xl font-semibold">{l.grade}</p>
        </Card>
      )}
    </div>
  );
}
