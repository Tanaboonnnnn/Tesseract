import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, BookOpen, CalendarDays, CircleCheck, FolderKanban, ListChecks, RotateCcw, Target } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { LearningCard, ProjectCard } from "../components/cards.tsx";
import { Card, Chip, Empty, ErrorNote, Loading, PageHeader, ProgressBar, SectionTitle } from "../components/ui.tsx";
import { api, type Overview } from "../lib/api.ts";
import { cn, dueLabel, greeting, longToday, shortDate } from "../lib/format.ts";
import { useNow } from "../lib/now.ts";
import { useLayout } from "../lib/theme.ts";
import { REVIEW_REASON as REASON } from "../lib/labels.ts";
import { FieldbookCourseHero } from "../components/FieldbookCourseHero.tsx";
import { mostRecentFieldbookCourse, usesReadingLayout } from "../lib/fieldbook-workspace.ts";

const SkillRadar = lazy(() => import("../components/SkillRadar.tsx").then((m) => ({ default: m.SkillRadar })));

function DashboardRadar({ data }: { data: Overview["skills"] }) {
  const host = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (shown || !host.current) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) { setShown(true); io.disconnect(); }
    }, { rootMargin: "100px" });
    io.observe(host.current);
    return () => io.disconnect();
  }, [shown]);
  const placeholder = <div className="h-[230px]" aria-hidden="true" />;
  return <div ref={host}>{shown
    ? <Suspense fallback={placeholder}><SkillRadar data={data} height={230} compact /></Suspense>
    : placeholder}</div>;
}

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
      {layout !== "bento" && layout !== "insights" && !usesReadingLayout(layout) && <Header />}
      {isPending ? <Loading /> : error ? <ErrorNote error={error} /> : layout === "insights" ? <InsightsHome o={data} /> : usesReadingLayout(layout)?<FieldbookHome o={data}/>:<Dashboard o={data} />}
    </>
  );
}

function FieldbookHome({o}:{o:Overview}) {
  const courses=useQuery({queryKey:["classroom-published"],queryFn:api.publishedCourses});
  const notes=useQuery({queryKey:["notes"],queryFn:()=>api.notes()});
  return <div className="fk-home">
    <PageHeader title="Your workspace" subtitle="Pick up where you left off, then plan what matters today."/>
    <div className="fk-columns">
      <FieldbookCourseHero course={mostRecentFieldbookCourse(courses.data??[])}/>
      <Today o={o}/>
    </div>
    <div className="fk-columns">
      <section className="fk-home-stream">
        <SectionTitle action={<Link to="/projects">All projects</Link>}>In progress</SectionTitle>
        {o.projects.filter(p=>p.status==="active").length? o.projects.filter(p=>p.status==="active").slice(0,4).map(p=><ProjectCard key={p.id} p={p}/>):<Empty>No active projects.</Empty>}
        <SectionTitle action={<Link to="/notes">All notes</Link>}>Recent notes</SectionTitle>
        {notes.data?.length?<ul className="fk-lists">{[...notes.data].sort((a,b)=>b.updated.localeCompare(a.updated)).slice(0,4).map(n=><li key={n.id}><Link to={"/notes/"+n.id}>{n.title}</Link></li>)}</ul>:<Empty>No recent notes.</Empty>}
      </section>
      <div className="space-y-5"><Goals o={o}/><Card><SectionTitle action={<Link to="/skills">Open Skills</Link>}>Skills</SectionTitle><p className="fk-muted">Compare skill levels and review your assessments.</p></Card></div>
    </div>
  </div>;
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

function InsightsHome({ o }: { o: Overview }) {
  const active = o.projects.filter((p) => p.status === "active");
  const goals = o.goals.filter((g) => g.status === "active");
  const schedule = useQuery({ queryKey: ["schedule", o.today, o.today], queryFn: () => api.schedule(o.today, o.today) });
  const stages = [
    { key: "todo", label: "To do", color: "var(--insights-neutral)" },
    { key: "doing", label: "In progress", color: "var(--insights-blue)" },
    { key: "review", label: "Review", color: "var(--insights-amber)" },
    { key: "done", label: "Done", color: "var(--color-accent-600)" },
  ] as const;
  const segments = stages.map((s) => ({ ...s, count: active.reduce((n, p) => n + p.tasks[s.key], 0) }));
  const total = segments.reduce((n, s) => n + s.count, 0);
  return (
    <div className="space-y-5">
      <PageHeader title="Workspace overview" subtitle="Projects, study and today's priorities in one place." action={
        <Link to="/schedule" className="insights-cta inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold"><CalendarDays size={16} /> Open schedule</Link>
      } />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Workspace indicators">
        <InsightMetric icon={<FolderKanban size={16} />} label="Projects" value={active.length} note="active projects" to="/projects" tone="green" />
        <InsightMetric icon={<BookOpen size={16} />} label="Learning" value={o.learning.length} note="courses and roadmaps" to="/learning" tone="blue" />
        <InsightMetric icon={<Target size={16} />} label="Goals" value={goals.length} note="active goals" to="#insights-goals" tone="amber" />
        <InsightMetric icon={<CalendarDays size={16} />} label="Schedule" value={schedule.data?.items.length ?? "–"} note={schedule.isError ? "unavailable" : schedule.isPending ? "loading" : "items today"} to="/schedule" tone="violet" />
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Card>
          <SectionTitle action={<Link to="/projects" className="insights-text-action text-xs font-medium">View projects</Link>}>Project task mix</SectionTitle>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">Tasks in active projects, grouped by current status.</p>
          {total ? <>
            <p className="mb-4 text-3xl font-semibold tabular-nums">{total} <span className="text-sm font-normal">tasks</span></p>
            <div className="mb-3 flex h-3 overflow-hidden rounded-full [background:var(--lane)]" aria-hidden="true">
              {segments.filter((s) => s.count > 0).map((s) => <div key={s.key} style={{ width: (s.count / total * 100) + "%", background: s.color }} />)}
            </div>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-4" aria-label="Task counts by status">
              {segments.map((s) => <li key={s.key} className="flex min-w-0 items-center gap-1.5"><span className="size-2 shrink-0 rounded-full" aria-hidden="true" style={{ background: s.color }} />{s.label} <strong className="tabular-nums">{s.count}</strong></li>)}
            </ul>
          </> : <Empty>No tasks in active projects.</Empty>}
        </Card>
        <Today o={o} />
        <Card>
          <SectionTitle action={<Link to="/learning" className="insights-text-action text-xs font-medium">View learning</Link>}>Learning progress</SectionTitle>
          {o.learning.length ? <ul className="space-y-3">{o.learning.slice(0, 5).map((l) => <li key={l.id}>
            <Link to={`/learning/${l.id}`} className="flex items-center justify-between gap-3 text-sm hover:underline">
              <span className="min-w-0 break-words">{l.title}</span><strong className="text-xs tabular-nums">{l.progress}%</strong>
            </Link>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full [background:var(--lane)]" aria-hidden="true"><div className="h-full rounded-full bg-accent-600" style={{width: l.progress + "%"}} /></div>
          </li>)}</ul> : <Empty>No courses or roadmaps yet.</Empty>}
        </Card>
        <section id="insights-goals" className="scroll-mt-20">
          {goals.length ? <Goals o={o} /> : <Card><SectionTitle>Goals</SectionTitle><Empty>No active goals.</Empty></Card>}
        </section>
        <div className="xl:col-span-2">
          <Card>
            <SectionTitle action={<Link to="/skills" className="insights-text-action text-xs font-medium">Open skills</Link>}>Skills</SectionTitle>
            {o.skills.length ? <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {o.skills.slice(0, 8).map((skill) => <li key={skill.id} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-[var(--line)] px-3 py-2 text-sm">
                <span className="min-w-0 break-words">{skill.title}</span>
                <span className="shrink-0 text-xs font-medium text-slate-600 dark:text-slate-400">Level {skill.level}</span>
              </li>)}
            </ul> : <Empty>No skill domains yet.</Empty>}
          </Card>
        </div>
      </div>
    </div>
  );
}

function InsightMetric({ icon, label, value, note, to, tone }: { icon: ReactNode; label: string; value: number | string; note: string; to: string; tone: "green" | "blue" | "amber" | "violet" }) {
  const contents = <>
    <div className="flex min-w-0 items-center justify-between gap-1 text-xs font-semibold"><span className="truncate">{label}</span><span aria-hidden="true" className={`insights-badge is-${tone} grid size-7 shrink-0 place-items-center rounded-full`}>{icon}</span></div>
    <p className="my-1.5 text-3xl font-semibold leading-none tracking-tight tabular-nums">{value}</p>
    <p className="flex min-w-0 items-center gap-1 text-xs text-slate-600 dark:text-slate-400"><span>{note}</span><ArrowUpRight size={12} className="ml-auto shrink-0" aria-hidden="true" /></p>
  </>;
  return to.startsWith("#")
    ? <a href={to} className="insights-metric min-w-0 rounded-xl border p-3 sm:p-4">{contents}</a>
    : <Link to={to} className="insights-metric min-w-0 rounded-xl border p-3 sm:p-4">{contents}</Link>;
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
      <DashboardRadar data={o.skills} />
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
