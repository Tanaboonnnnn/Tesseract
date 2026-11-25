import { useQuery } from "@tanstack/react-query";
import { BookOpen, CalendarDays, CircleCheck, FolderKanban, ListChecks, RotateCcw, Target } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { LearningCard, ProjectCard } from "../components/cards.tsx";
import { SkillRadar } from "../components/SkillRadar.tsx";
import { Card, Chip, Empty, ErrorNote, Loading, PageHeader, ProgressBar, SectionTitle } from "../components/ui.tsx";
import { api, type Overview } from "../lib/api.ts";
import { cn, dueLabel, greeting, longToday, shortDate } from "../lib/format.ts";
import { useNow } from "../lib/now.ts";
import { useLayout } from "../lib/theme.ts";
import { REVIEW_REASON as REASON } from "../lib/labels.ts";

const PRIORITY_DOT: Record<string, string> = {
  urgent: "bg-rose-500",
  high: "bg-orange-400",
  medium: "bg-accent-500",
  low: "bg-slate-300",
};

export function Home() {
  const { data, error, isPending } = useQuery({ queryKey: ["overview"], queryFn: api.overview });
  const [layout] = useLayout();

  return (
    <>
      {layout !== "bento" && <Header />}
      {isPending ? <Loading /> : error ? <ErrorNote error={error} /> : <Dashboard o={data} />}
    </>
  );
}

/** Greeting, date and a minute clock: kept current while the app stays open (re-renders once a minute). */
function Header() {
  const now = useNow();
  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return (
    <PageHeader
      title={greeting(now)}
      subtitle={longToday(now)}
      action={
        <time dateTime={now.toISOString()} className="hud-number text-3xl tabular-nums" aria-label={`Time ${time}`}>
          {time}
        </time>
      }
    />
  );
}

/** Bento: the greeting and a big clock as the hero tile. */
function Hero() {
  const now = useNow();
  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return (
    <Card className="sb-home-hero col-span-2 flex flex-col justify-between p-6 lg:row-span-2">
      <div>
        <p className="text-sm text-slate-500">{longToday(now)}</p>
        <h1 className="hud-title mt-1 text-3xl">{greeting(now)}</h1>
      </div>
      <time dateTime={now.toISOString()} className="hud-number mt-6 text-6xl tracking-tight tabular-nums">
        {time}
      </time>
    </Card>
  );
}

function Dashboard({ o }: { o: Overview }) {
  const active = o.projects.filter((p) => p.status === "active");
  const [layout] = useLayout();
  return (
    <div className="space-y-6">
      <div className={cn("sb-home-stats grid grid-cols-2 gap-3", layout === "bento" ? "lg:grid-cols-4 lg:grid-rows-2" : "lg:grid-cols-4")}>
        {layout === "bento" && <Hero />}
        <Stat icon={<FolderKanban size={18} />} label="Projects" value={active.length} hint="active" />
        <Stat icon={<BookOpen size={18} />} label="Learning" value={o.learning.length} hint="items" />
        <Stat icon={<Target size={18} />} label="Goals" value={o.goals.filter((g) => g.status === "active").length} hint="active" />
        <Stat icon={<RotateCcw size={18} />} label="Review" value={o.review_queue.total} hint="topics" />
      </div>

      {/* Mobile order: Today → Projects → Learning → Skills → Goals. Desktop: Today/Skills/Goals on the right. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-3 lg:grid-rows-[auto_1fr]">
        <div className="lg:col-start-3 lg:row-start-1">
          <Today o={o} />
        </div>

        <div className="space-y-6 lg:col-span-2 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <section>
            <SectionTitle
              action={
                <Link to="/projects" className="text-xs font-medium text-accent-600 hover:underline">
                  View all
                </Link>
              }
            >
              Projects
            </SectionTitle>
            {active.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {active.map((p) => (
                  <ProjectCard key={p.id} p={p} />
                ))}
              </div>
            ) : (
              <Card>
                <Empty>No active projects.</Empty>
              </Card>
            )}
          </section>

          <section>
            <SectionTitle
              action={
                <Link to="/learning" className="text-xs font-medium text-accent-600 hover:underline">
                  View all
                </Link>
              }
            >
              Learning
            </SectionTitle>
            {o.learning.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {o.learning.map((l) => (
                  <LearningCard key={l.id} l={l} />
                ))}
              </div>
            ) : (
              <Card>
                <Empty>No roadmaps or courses yet.</Empty>
              </Card>
            )}
          </section>
        </div>

        <div className="space-y-6 lg:col-start-3 lg:row-start-2">
          <Skills o={o} />
          <Goals o={o} />
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, hint }: { icon: ReactNode; label: string; value: number; hint: string }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="grid size-10 place-items-center rounded-lg bg-accent-50 text-accent-600 ring-1 ring-accent-200 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/40 dark:shadow-[0_0_12px_rgb(var(--glow-rgb)/0.3)]">{icon}</span>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="hud-number text-2xl text-slate-900 dark:text-sky-50">
          {value} <span className="text-xs font-normal text-slate-400">{hint}</span>
        </p>
      </div>
    </Card>
  );
}

/** Classes, events and Google events on today's calendar (task dues are listed below). */
const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
};
const inLabel = (mins: number) => (mins < 60 ? `in ${mins}m` : `in ${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ""}`);

/** Today's timed items with a live status: Done (dimmed), Now, Next · in 2h. Updates with the minute clock. */
function TodaySchedule({ today, now }: { today: string; now: Date }) {
  const { data } = useQuery({ queryKey: ["schedule", today, today], queryFn: () => api.schedule(today, today) });
  const items = (data?.items ?? []).filter((i) => i.kind === "event" || i.kind === "class" || i.kind === "google" || i.kind === "exam");
  if (items.length === 0) return null;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const state = (i: (typeof items)[number]) => {
    if (!i.start) return "allday";
    const s = minutes(i.start);
    const e = i.end ? minutes(i.end) : s;
    return nowMin >= e ? "done" : nowMin >= s ? "now" : "later";
  };
  const next = items.find((i) => state(i) === "later");
  return (
    <Link to="/schedule" className="-mx-2 mb-4 block rounded-lg px-2 py-1 hover:bg-[var(--lane)]">
      <ul className="space-y-1">
        {items.map((i) => {
          const st = state(i);
          return (
            <li key={i.key} className={cn("flex items-center gap-2.5 text-sm", st === "done" && "opacity-45")}>
              <CalendarDays size={14} className={cn("shrink-0", st === "now" ? "text-emerald-500" : "text-accent-600 dark:text-sky-300")} />
              <span className="w-20 shrink-0 text-xs text-slate-400 tabular-nums">{i.start ? `${i.start}–${i.end}` : "All day"}</span>
              <span className={cn("min-w-0 flex-1 truncate", st === "done" && "line-through")}>{i.title}</span>
              {st === "now" && <Chip tone="green">Now</Chip>}
              {st === "done" && <span className="shrink-0 text-[11px] text-slate-400">Done</span>}
              {i === next && <span className="shrink-0 text-[11px] text-accent-600 dark:text-sky-300">Next · {inLabel(minutes(i.start!) - nowMin)}</span>}
            </li>
          );
        })}
      </ul>
    </Link>
  );
}

function Today({ o }: { o: Overview }) {
  const now = useNow();
  const tasks = o.tasks_due.slice(0, 6);
  const review = o.review_queue.top;
  const quizzes = o.quizzes_open;
  return (
    <Card>
      <div className="mb-4 flex items-center gap-3">
        <span className="notice-icon">
          <span className="font-display text-lg leading-none font-bold">!</span>
        </span>
        <span className="notice-title">Today</span>
        <span className="ml-auto text-xs text-slate-500">{now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
      </div>
      <TodaySchedule today={o.today} now={now} />
      {tasks.length === 0 && review.length === 0 && quizzes.length === 0 ? (
        <p className="flex items-center gap-2 py-4 text-sm text-slate-500">
          <CircleCheck size={16} className="text-emerald-500" /> All clear.
        </p>
      ) : (
        <div className="space-y-4">
          {tasks.length > 0 && (
            <ul className="space-y-1">
              {tasks.map((t) => (
                <li key={`${t.ref}/${t.task}`}>
                  <Link
                    to={`/${t.ref}`}
                    className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--lane)]"
                  >
                    <span className={cn("size-2 shrink-0 rounded-full", PRIORITY_DOT[t.priority])} />
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <span className={cn("shrink-0 text-xs", t.overdue ? "text-rose-600" : "text-slate-400")}>{dueLabel(t.due!, o.today)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {quizzes.length > 0 && (
            <ul className="space-y-1">
              {quizzes.map((q) => (
                <li key={q.id}>
                  <Link
                    to={`/quizzes/${q.id}`}
                    className="-mx-2 flex items-center gap-2.5 rounded-lg bg-accent-50 px-2 py-2 text-sm text-accent-700 hover:bg-accent-100 dark:bg-accent-500/10 dark:text-accent-200"
                  >
                    <ListChecks size={15} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">Quiz: {q.title}</span>
                    <span className="text-xs">{q.questions} Qs</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {review.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium tracking-wide text-slate-400 uppercase">To review</p>
              <ul className="space-y-1">
                {review.map((r) => (
                  <li key={r.ref}>
                    <Link
                      to={`/${r.ref.split("#")[0]}`}
                      className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--lane)]"
                    >
                      <RotateCcw size={14} className="shrink-0 text-slate-400" />
                      <span className="min-w-0 flex-1 truncate">{r.title}</span>
                      {r.reasons.map((reason) => (
                        <Chip key={reason} tone={REASON[reason]?.tone}>
                          {REASON[reason]?.text ?? reason}
                        </Chip>
                      ))}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Skills({ o }: { o: Overview }) {
  const assessed = o.skills.some((d) => d.level > 0);
  return (
    <Card>
      <SectionTitle
        action={
          <Link to="/skills" className="text-xs font-medium text-accent-600 hover:underline">
            Open
          </Link>
        }
      >
        Skills
      </SectionTitle>
      {!assessed && <p className="mb-3 text-xs text-slate-400">Levels come from assessments. None yet.</p>}
      <SkillRadar data={o.skills} height={230} compact />
    </Card>
  );
}

function Goals({ o }: { o: Overview }) {
  return (
    <Card>
      <SectionTitle>Goals</SectionTitle>
      {o.goals.length === 0 ? (
        <Empty>No goals yet.</Empty>
      ) : (
        <ul className="space-y-4">
          {o.goals.map((g) => (
            <li key={g.id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium">{g.title}</span>
                <span className="text-xs font-semibold tabular-nums">{g.progress}%</span>
              </div>
              <ProgressBar value={g.progress} color="green" />
              {g.target_date && <p className="mt-1 text-xs text-slate-400">Target {shortDate(g.target_date)}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
