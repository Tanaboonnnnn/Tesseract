import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, ChevronLeft, ChevronRight, Link2, RefreshCw, Unlink } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Button, Card, Dialog, ErrorNote, Field, inputClass, Loading, PageHeader, SectionTitle } from "../components/ui.tsx";
import { api, type GoogleInfo, type ScheduleEvent, type ScheduleItem } from "../lib/api.ts";
import { cn, todayIso } from "../lib/format.ts";
import { useNow } from "../lib/now.ts";

type View = "day" | "3days" | "week";
const SPAN: Record<View, number> = { day: 1, "3days": 3, week: 7 };

const KIND: Record<ScheduleItem["kind"], { label: string; cls: string }> = {
  event: { label: "Event", cls: "border-l-accent-500 bg-accent-50/70 dark:border-l-sky-400 dark:bg-sky-400/10" },
  class: { label: "Class", cls: "border-l-indigo-400 bg-indigo-50/70 dark:bg-indigo-400/10" },
  task: { label: "Task due", cls: "border-l-amber-400 bg-amber-50/70 dark:bg-amber-400/10" },
  assignment: { label: "Assignment", cls: "border-l-orange-400 bg-orange-50/70 dark:bg-orange-400/10" },
  exam: { label: "Exam", cls: "border-l-rose-500 bg-rose-50/70 dark:bg-rose-500/10" },
  google: { label: "Google", cls: "border-l-slate-400 bg-slate-50 dark:bg-white/5" },
};

function parse(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(day: string, n: number): string {
  const d = parse(day);
  d.setDate(d.getDate() + n);
  return iso(d);
}
/** Monday of the week containing `day`. */
function weekStart(day: string): string {
  const wd = (parse(day).getDay() + 6) % 7;
  return addDays(day, -wd);
}
const dayName = (day: string, style: "short" | "long" = "short") => parse(day).toLocaleDateString("en-US", { weekday: style });
const dayNum = (day: string) => parse(day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
/** "Today" / "Tomorrow" / "Yesterday", or null. */
function relative(day: string, today: string): string | null {
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  if (day === addDays(today, -1)) return "Yesterday";
  return null;
}

export function Schedule() {
  useNow(); // re-render at midnight so "Today" moves on
  const today = todayIso();
  const [view, setView] = useState<View>(() => (window.innerWidth < 768 ? "day" : "week"));
  const [anchor, setAnchor] = useState(today);
  const [editing, setEditing] = useState<ScheduleEvent | "new" | null>(null);

  const from = view === "week" ? weekStart(anchor) : anchor;
  const to = addDays(from, SPAN[view] - 1);
  const days = Array.from({ length: SPAN[view] }, (_, i) => addDays(from, i));

  // Quick picks set the view AND the date, so each one visibly changes the page (and shows which one is on).
  const PICKS: { id: string; label: string; view: View; anchor: string }[] = [
    { id: "today", label: "Today", view: "day", anchor: today },
    { id: "tomorrow", label: "Tomorrow", view: "day", anchor: addDays(today, 1) },
    { id: "3days", label: "Next 3 days", view: "3days", anchor: today },
    { id: "week", label: "This week", view: "week", anchor: today },
  ];
  const isOn = (p: (typeof PICKS)[number]) => p.view === view && (view === "week" ? weekStart(p.anchor) === from : p.anchor === anchor);
  const go = (v: View, a: string) => {
    setView(v);
    setAnchor(a);
  };
  const { data, error, isPending } = useQuery({ queryKey: ["schedule", from, to], queryFn: () => api.schedule(from, to) });

  const rel = relative(anchor, today);
  const title =
    view === "day" ? `${rel ? `${rel} · ` : ""}${dayName(anchor, "long")}, ${dayNum(anchor)}` : `${dayNum(from)} – ${dayNum(to)}`;

  return (
    <>
      <PageHeader
        title="Schedule"
        subtitle={title}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center">
              <Button variant="ghost" aria-label={`Previous ${SPAN[view] === 1 ? "day" : `${SPAN[view]} days`}`} onClick={() => setAnchor(addDays(anchor, -SPAN[view]))}>
                <ChevronLeft size={16} />
              </Button>
              <input
                type="date"
                aria-label="Go to date"
                value={anchor}
                onChange={(e) => e.target.value && setAnchor(e.target.value)}
                className={cn(inputClass.replace("w-full", "w-auto"), "py-1.5 text-sm")}
              />
              <Button variant="ghost" aria-label={`Next ${SPAN[view] === 1 ? "day" : `${SPAN[view]} days`}`} onClick={() => setAnchor(addDays(anchor, SPAN[view]))}>
                <ChevronRight size={16} />
              </Button>
            </div>
            <Button className="shadow-none hover:shadow-none" onClick={() => setEditing("new")}>
              <CalendarPlus size={16} /> Add
            </Button>
          </div>
        }
      />

      <section aria-label="Calendar agenda">
        <div className="seg mb-3 w-fit max-w-full flex-wrap" role="group" aria-label="Show">
          {PICKS.map((p) => (
            <button key={p.id} aria-pressed={isOn(p)} onClick={() => go(p.view, p.anchor)}>
              {p.label}
            </button>
          ))}
        </div>

        {isPending ? (
          <Loading />
        ) : error ? (
          <ErrorNote error={error} />
        ) : (
          <div
            className={cn(
              "grid overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel-solid)]",
              view === "week" && "xl:grid-cols-7 xl:divide-x xl:divide-y-0",
              view === "3days" && "md:grid-cols-3 md:divide-x md:divide-y-0",
              "divide-y divide-[var(--line)]",
            )}
          >
            {days.map((d) => (
              <DayColumn
                key={d}
                day={d}
                today={today}
                items={data.items.filter((i) => i.date === d)}
                onEdit={async (id) => setEditing(await api.event(id))}
              />
            ))}
          </div>
        )}

      </section>

      <GooglePanel />

      <EventDialog
        key={editing === "new" ? "new" : editing?.id ?? "none"}
        event={editing}
        defaultDate={view === "day" ? anchor : today >= from && today <= to ? today : from}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

function DayColumn({ day, today, items, onEdit }: { day: string; today: string; items: ScheduleItem[]; onEdit: (id: string) => void }) {
  const navigate = useNavigate();
  const isToday = day === today;
  const dayLabel = relative(day, today);
  const open = (i: ScheduleItem) => {
    if (i.kind === "event") onEdit(i.key.slice("event:".length));
    else if (i.ref) navigate(`/${i.ref}`);
  };
  return (
    <section
      aria-label={`${dayName(day, "long")}, ${dayNum(day)}`}
      aria-current={isToday ? "date" : undefined}
      className={cn("min-w-0 px-3 py-3 xl:min-h-28", isToday && "bg-[var(--lane)]")}
    >
      <header className="mb-3">
        <h2 className={cn("text-sm leading-tight font-semibold", isToday && "text-accent-700 dark:text-accent-300")}>
          {dayName(day)} <span className="whitespace-nowrap font-medium">{dayNum(day)}</span>
        </h2>
        {dayLabel && (
          <p className={cn("mt-0.5 text-xs", isToday ? "font-semibold text-accent-700 dark:text-accent-300" : "text-slate-600 dark:text-slate-400")}>
            {dayLabel}
          </p>
        )}
      </header>
      {items.length === 0 ? (
        <p className="text-xs text-slate-600 dark:text-slate-400">No events</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((i) => (
            <li key={i.key}>
              <button
                onClick={() => open(i)}
                disabled={i.kind === "google"}
                title={`${KIND[i.kind].label}${i.detail ? ` · ${i.detail}` : ""}`}
                className={cn("w-full rounded border-l-[3px] px-2 py-1 text-left text-xs transition hover:brightness-95 disabled:cursor-default", KIND[i.kind].cls)}
              >
                {i.start && (
                  <span className="block text-[10px] text-slate-500 tabular-nums dark:text-slate-400">
                    {i.start}–{i.end}
                  </span>
                )}
                <span className="line-clamp-2 font-medium">{i.title}</span>
                {i.kind !== "event" && <span className="text-[10px] text-slate-500 dark:text-slate-400">{KIND[i.kind].label}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EventDialog({ event, defaultDate, onClose }: { event: ScheduleEvent | "new" | null; defaultDate: string; onClose: () => void }) {
  const qc = useQueryClient();
  const existing = event && event !== "new" ? event : null;
  const [form, setForm] = useState({
    title: existing?.title ?? "",
    date: existing?.date ?? defaultDate,
    start: existing?.start ?? "",
    end: existing?.end ?? "",
    notes: existing?.notes ?? "",
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const done = () => {
    qc.invalidateQueries({ queryKey: ["schedule"] });
    qc.invalidateQueries({ queryKey: ["google"] });
    onClose();
  };
  const save = useMutation({
    mutationFn: () => {
      const body = { title: form.title.trim(), date: form.date, start: form.start || null, end: form.end || null, notes: form.notes };
      return existing ? api.updateEvent(existing.id, body) : api.addEvent(body);
    },
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: () => api.deleteEvent(existing!.id), onSuccess: done });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <Dialog open={event !== null} onClose={onClose} title={existing ? "Edit event" : "New event"}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Title">
          <input className={inputClass} value={form.title} onChange={(e) => set("title", e.target.value)} required autoFocus />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Date">
            <input type="date" className={inputClass} value={form.date} onChange={(e) => set("date", e.target.value)} required />
          </Field>
          <Field label="Start">
            <input type="time" className={inputClass} value={form.start} onChange={(e) => set("start", e.target.value)} />
          </Field>
          <Field label="End">
            <input type="time" className={inputClass} value={form.end} onChange={(e) => set("end", e.target.value)} />
          </Field>
        </div>
        <p className="text-xs text-slate-400">Leave start and end empty for an all-day event.</p>
        <Field label="Notes">
          <textarea className={cn(inputClass, "min-h-16")} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
        <ErrorNote error={save.error ?? remove.error} />
        <div className="flex items-center justify-between pt-1">
          {existing ? (
            <Button type="button" variant="danger" onClick={() => remove.mutate()} disabled={remove.isPending}>
              Delete
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={save.isPending || !form.title.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ago(isoTs: string): string {
  const min = Math.round((Date.now() - new Date(isoTs).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  return `${Math.round(min / 60)} h ago`;
}

const PUSH_LABEL = { events: "Events", task_dues: "Task due dates", course_slots: "Class times", exams: "Exams & assignments" } as const;

function GooglePanel() {
  const qc = useQueryClient();
  // Poll only while a Google sign-in is in progress (stops once connected).
  const [waiting, setWaiting] = useState(false);
  const { data: g } = useQuery({
    queryKey: ["google"],
    queryFn: api.google,
    refetchInterval: (q) => (waiting && !q.state.data?.connected ? 3000 : false),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["google"] });
    qc.invalidateQueries({ queryKey: ["schedule"] });
  };
  const connect = useMutation({
    mutationFn: api.googleConnect,
    onSuccess: ({ url }) => {
      setWaiting(true);
      setTimeout(() => setWaiting(false), 5 * 60_000); // sign-in link expires after 5 min
      window.open(url, "_blank", "noopener");
    },
  });
  const sync = useMutation({ mutationFn: api.googleSync, onSettled: refresh });
  const disconnect = useMutation({ mutationFn: api.googleDisconnect, onSettled: refresh });
  const settings = useMutation({ mutationFn: api.googleSettings, onSettled: refresh });

  if (!g?.available) return null;
  if (!g.client && !g.connected) {
    return (
      <details className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--panel-solid)] text-sm">
        <summary className="cursor-pointer rounded-lg px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2">
          <span className="ml-1 font-semibold">Google Calendar</span>
          <span className="ml-2 text-xs text-slate-600 dark:text-slate-400">Not set up</span>
        </summary>
        <p className="border-t border-[var(--line)] px-4 py-3 text-slate-600 dark:text-slate-400">
          Save your Google OAuth client file as <code className="break-all">~/.tesseract/google-client.json</code>.
          Follow <code className="break-all">docs/GOOGLE_CALENDAR.md</code>, then reload this page.
        </p>
      </details>
    );
  }
  return (
    <Card className="mt-6">
      <SectionTitle>Google Calendar</SectionTitle>
      <GoogleState g={g} />
      <div className="mt-3 flex flex-wrap gap-2">
        {g.connected ? (
          <>
            <Button onClick={() => sync.mutate()} disabled={sync.isPending}>
              <RefreshCw size={15} className={cn(sync.isPending && "animate-spin")} /> Sync now
            </Button>
            <Button variant="ghost" onClick={() => disconnect.mutate()}>
              <Unlink size={15} /> Disconnect
            </Button>
          </>
        ) : (
          g.client && (
            <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
              <Link2 size={15} /> Connect Google Calendar
            </Button>
          )
        )}
      </div>
      {g.connected && (
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {(Object.keys(PUSH_LABEL) as (keyof typeof PUSH_LABEL)[]).map((k) => (
            <label key={k} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={g.settings.push[k]}
                onChange={(e) => settings.mutate({ push: { [k]: e.target.checked } })}
              />
              {PUSH_LABEL[k]}
            </label>
          ))}
        </div>
      )}
      <ErrorNote error={connect.error ?? sync.error ?? disconnect.error ?? settings.error} />
    </Card>
  );
}

function GoogleState({ g }: { g: GoogleInfo }) {
  if (g.connected) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Two-way sync with the “Tesseract” calendar (also shows in Notion Calendar).{" "}
        {g.last_sync ? `Last sync ${ago(g.last_sync)}.` : "Not synced yet."}
        {g.last_error && <span className="block text-rose-600 dark:text-rose-300">{g.last_error}</span>}
      </p>
    );
  }
  return <p className="text-sm text-slate-500 dark:text-slate-400">Ready to connect. A Google sign-in page opens in your browser.</p>;
}
