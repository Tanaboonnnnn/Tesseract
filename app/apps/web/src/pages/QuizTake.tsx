import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { Button, Card, Chip, ErrorNote, Loading } from "../components/ui.tsx";
import { api, type QuizResult } from "../lib/api.ts";
import { cn, label } from "../lib/format.ts";
import { DIFFICULTY_TONE } from "../lib/labels.ts";

type Given = number | number[] | string;
/** A question after grading (or from a quiz taken earlier: no chosen/correct). Old quizzes have no type → single. */
type Reviewed = {
  type?: "single" | "multi" | "short";
  q: string;
  choices?: string[];
  answer?: number;
  answers?: number[];
  accept?: string[];
  explain?: string;
  chosen?: Given;
  correct?: boolean;
};
type Open = { type?: "single" | "multi" | "short"; q: string; choices?: string[] };

const isAnswered = (v: Given | undefined) => (Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim() !== "" : v !== undefined);

export function QuizTake() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const { data: quiz, error, isPending } = useQuery({ queryKey: ["quiz", id], queryFn: () => api.quiz(id) });
  const list = useQuery({ queryKey: ["quizzes"], queryFn: api.quizzes });
  const [answers, setAnswers] = useState<(Given | undefined)[]>([]);
  const setAnswer = (i: number, v: Given) => setAnswers((a) => Object.assign([...a], { [i]: v }));
  const [result, setResult] = useState<QuizResult | null>(null);

  const submit = useMutation({
    mutationFn: () => api.submitQuiz(id, answers as Given[]),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });

  if (isPending) return <Loading />;
  if (error || !quiz) return <ErrorNote error={error ?? "Not found"} />;

  const header = (
    <>
      <nav className="mb-4 flex items-center gap-1 text-xs text-slate-500">
        <Link to="/quizzes" className="hover:text-accent-600">
          Quizzes
        </Link>
        <ChevronRight size={12} />
        <span className="text-slate-700 dark:text-slate-300">{quiz.title}</span>
      </nav>
      <header className="mb-6">
        <h1 className="hud-title text-3xl">{quiz.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <Chip tone={DIFFICULTY_TONE[quiz.difficulty]}>{quiz.difficulty}</Chip>
          <span>{quiz.questions.length} questions</span>
          <span>· by {quiz.author}</span>
          <span>· {Object.keys(quiz.skills).map(label).join(", ")}</span>
        </div>
      </header>
    </>
  );

  // Just submitted → show my answers. Taken earlier → show the answer key.
  if (result || quiz.status === "done") {
    const score = result?.score ?? list.data?.find((q) => q.id === id)?.score ?? null;
    const items: Reviewed[] = result ? result.results : (quiz.questions as Reviewed[]);
    return (
      <>
        {header}
        <Card className="mb-6 flex flex-wrap items-center gap-6">
          <div>
            <p className="text-xs text-slate-500">Score</p>
            <p className={cn("hud-number text-5xl", score != null && score < 60 ? "text-rose-600" : "text-emerald-600")}>
              {score ?? "–"}
            </p>
          </div>
          {result && (
            <p className="text-sm text-slate-500">
              {result.correct} of {result.total} correct. Saved as an assessment; skill levels and topic review updated.
            </p>
          )}
          <div className="ml-auto flex gap-2">
            <Link to="/skills" className="rounded-lg px-3 py-2 text-sm font-medium text-accent-600 hover:bg-accent-50 dark:hover:bg-accent-500/10">
              View skills
            </Link>
            <Link to="/quizzes" className="rounded-lg bg-accent-600 px-3 py-2 text-sm font-medium text-white hover:bg-accent-700">
              Done
            </Link>
          </div>
        </Card>
        <ol className="space-y-4">
          {items.map((item, i) => (
            <Card key={i}>
              <p className="mb-3 text-sm font-medium">
                <span className="mr-2 text-slate-400">{i + 1}.</span>
                {item.q}
                {item.correct !== undefined && (
                  <span className={cn("ml-2 inline-flex items-center gap-0.5 text-xs font-semibold", item.correct ? "text-emerald-600" : "text-rose-600")}>
                    {item.correct ? <Check size={13} /> : <X size={13} />} {item.correct ? "Correct" : "Wrong"}
                  </span>
                )}
              </p>
              {item.type === "short" ? (
                <div className="space-y-1.5 text-sm">
                  {item.chosen !== undefined && (
                    <p className={cn("flex items-center gap-2 rounded-lg border px-3 py-2", item.correct ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10" : "border-rose-300 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-500/10")}>
                      {item.correct ? <Check size={15} className="text-emerald-600" /> : <X size={15} className="text-rose-600" />}
                      <span className="flex-1">{String(item.chosen)}</span>
                      <span className="text-xs text-slate-400">Your answer</span>
                    </p>
                  )}
                  <p className="text-slate-500">
                    Accepted: <span className="font-medium text-slate-700 dark:text-slate-200">{(item.accept ?? []).join(" / ")}</span>
                  </p>
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {(item.choices ?? []).map((c, ci) => {
                    const key = item.type === "multi" ? (item.answers ?? []) : [item.answer];
                    const picked = Array.isArray(item.chosen) ? item.chosen.includes(ci) : item.chosen === ci;
                    const isAnswer = key.includes(ci);
                    const isWrongPick = picked && !isAnswer;
                    const missed = item.chosen !== undefined && isAnswer && !picked;
                    return (
                      <li
                        key={ci}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                          isAnswer && "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10",
                          isWrongPick && "border-rose-300 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-500/10",
                          !isAnswer && !isWrongPick && "border-[var(--line)] text-slate-500",
                        )}
                      >
                        {isAnswer ? <Check size={15} className="text-emerald-600" /> : isWrongPick ? <X size={15} className="text-rose-600" /> : <span className="w-[15px]" />}
                        <span className="flex-1">{c}</span>
                        {picked && <span className="text-xs text-slate-400">Your answer</span>}
                        {missed && <span className="text-xs text-amber-600">Missed</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
              {item.explain && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{item.explain}</p>}
            </Card>
          ))}
        </ol>
      </>
    );
  }

  const answered = answers.filter(isAnswered).length;
  const total = quiz.questions.length;

  return (
    <>
      {header}
      <ol className="space-y-4 pb-20">
        {quiz.questions.map((item, i) => (
          <Card key={i}>
            <fieldset>
              <legend className="mb-3 text-sm font-medium">
                <span className="mr-2 text-slate-400">{i + 1}.</span>
                {item.q}
              </legend>
              <QuestionInput item={item as Open} value={answers[i]} name={`q${i}`} onChange={(v) => setAnswer(i, v)} />
            </fieldset>
          </Card>
        ))}
      </ol>

      <div className="sb-quiz-submit glass-bar fixed inset-x-0 bottom-14 z-10 border-t lg:bottom-0 lg:left-60">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-10">
          <span className="text-sm text-slate-500 tabular-nums">
            {answered} of {total} answered
          </span>
          <div className="flex-1">{submit.error && <ErrorNote error={submit.error} />}</div>
          <Button
            disabled={answered < total || submit.isPending}
            onClick={() => confirm("Submit your answers? You get one attempt.") && submit.mutate()}
          >
            Submit
          </Button>
        </div>
      </div>
    </>
  );
}

function QuestionInput({ item, value, name, onChange }: { item: Open; value: Given | undefined; name: string; onChange: (v: Given) => void }) {
  if (item.type === "short") {
    return (
      <input
        type="text"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        maxLength={500}
        placeholder="Type your answer"
        autoComplete="off"
        className="w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-accent-500"
      />
    );
  }
  const multi = item.type === "multi";
  const picked = (ci: number) => (multi ? Array.isArray(value) && value.includes(ci) : value === ci);
  return (
    <div className="space-y-1.5">
      {multi && <p className="text-xs text-slate-500">Select all that apply.</p>}
      {(item.choices ?? []).map((c, ci) => (
        <label
          key={ci}
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
            picked(ci)
              ? "border-accent-500 bg-accent-50 dark:border-sky-400 dark:bg-sky-400/10 dark:shadow-[0_0_12px_rgb(var(--glow-rgb)/0.25)]"
              : "border-[var(--line)] hover:border-accent-500",
          )}
        >
          <input
            type={multi ? "checkbox" : "radio"}
            name={name}
            className="accent-accent-600"
            checked={picked(ci)}
            onChange={() => {
              if (!multi) return onChange(ci);
              const cur = Array.isArray(value) ? value : [];
              onChange(cur.includes(ci) ? cur.filter((x) => x !== ci) : [...cur, ci].sort((a, b) => a - b));
            }}
          />
          {c}
        </label>
      ))}
    </div>
  );
}
