import { useQuery } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import { Link } from "react-router";
import { Card, Chip, Empty, ErrorNote, Loading, PageHeader, SectionTitle } from "../components/ui.tsx";
import { api, type QuizSummary } from "../lib/api.ts";
import { cn, shortDate } from "../lib/format.ts";
import { DIFFICULTY_TONE } from "../lib/labels.ts";

export function Quizzes() {
  const { data, error, isPending } = useQuery({ queryKey: ["quizzes"], queryFn: api.quizzes });
  const open = (data ?? []).filter((q) => q.status === "open");
  const done = (data ?? []).filter((q) => q.status === "done").sort((a, b) => b.created.localeCompare(a.created));

  return (
    <>
      <PageHeader title="Quizzes" subtitle="Written by your AI, graded here. One attempt each." />
      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorNote error={error} />
      ) : (
        <div className="space-y-8">
          <section>
            <SectionTitle>Ready</SectionTitle>
            {open.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {open.map((q) => (
                  <QuizCard key={q.id} q={q} />
                ))}
              </div>
            ) : (
              <Card>
                <Empty>No open quizzes. Ask your AI: “Make me a quiz on …”.</Empty>
              </Card>
            )}
          </section>
          {done.length > 0 && (
            <section>
              <SectionTitle>Taken</SectionTitle>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {done.map((q) => (
                  <QuizCard key={q.id} q={q} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}

function QuizCard({ q }: { q: QuizSummary }) {
  return (
    <Link
      to={`/quizzes/${q.id}`}
      className="block tile tile-hover p-4"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-50 text-accent-600 ring-1 ring-accent-200 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/40 dark:shadow-[0_0_12px_rgb(var(--glow-rgb)/0.3)]">
          <ListChecks size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-lg leading-tight font-semibold tracking-wide text-slate-900 dark:text-sky-50">{q.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <Chip tone={DIFFICULTY_TONE[q.difficulty]}>{q.difficulty}</Chip>
            <span>{q.questions} questions</span>
            <span>· by {q.author}</span>
          </div>
        </div>
        {q.score != null && (
          <span className={cn("text-lg font-semibold tabular-nums", q.score < 60 ? "text-rose-600" : "text-emerald-600")}>{q.score}</span>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-400">{shortDate(q.created)}</p>
    </Link>
  );
}
