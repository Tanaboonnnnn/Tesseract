/**
 * Two-way sync between data/schedule/events.yaml and a dedicated "Panya" Google calendar.
 *
 * - Own events: two-way. Edits/deletes made in Google (or Notion Calendar, which shows Google calendars)
 *   come back; the newer `updated` wins. Events created directly in that calendar are imported.
 * - Task due dates, exams and weekly class times: one-way (the app is the source of truth).
 * - Other calendars (`pull_calendars`) are read-only and never written to data/.
 * All data writes go through Store (logged as the store's agent, e.g. "google-sync").
 */
import { createHash } from "node:crypto";
import { courseSlots, type ScheduleEvent, type ScheduleItem, type Store } from "@brain/core";
import { GoogleApiError, type CalendarApi, type GEvent, type GEventBody } from "./api.ts";
import { readJson, writeJson } from "./files.ts";

export const CALENDAR_NAME = "Panya";
const KEY = "sb_key";

export interface SyncState {
  sync_token: string | null;
  last_sync: string | null;
  /** What was pushed, by key: Google id + content hash (skip unchanged). */
  pushed: Record<string, { google_id: string; hash: string }>;
}

export interface SyncResult {
  calendar_id: string;
  /** Local events created/changed/removed from Google. */
  pulled: number;
  /** Google events created or updated. */
  pushed: number;
  /** Google events removed. */
  removed: number;
  last_sync: string;
}

export interface SyncOptions {
  statePath: string;
  timeZone?: string;
  now?: () => Date;
}

const emptyState = (): SyncState => ({ sync_token: null, last_sync: null, pushed: {} });

export function readState(path: string): SyncState {
  return { ...emptyState(), ...readJson<SyncState>(path) };
}

export const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/* ---------- date helpers ---------- */

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Wall-clock date and HH:MM of an instant in a time zone. */
function localParts(iso: string, timeZone: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

type EventFields = Pick<ScheduleEvent, "title" | "date" | "start" | "end" | "notes">;

/** Google event → our fields. null for recurring series (not supported as own events). */
export function fromGoogle(g: GEvent, timeZone: string): EventFields | null {
  if (g.recurrence?.length || !g.start) return null;
  const title = g.summary?.trim() || "(no title)";
  const notes = g.description ?? "";
  if (g.start.date) return { title, date: g.start.date, start: null, end: null, notes };
  if (!g.start.dateTime) return null;
  const s = localParts(g.start.dateTime, timeZone);
  const e = g.end?.dateTime ? localParts(g.end.dateTime, timeZone) : s;
  let end = e.date === s.date ? e.time : "23:59";
  let start = s.time;
  if (end <= start) [start, end] = start === "23:59" ? ["23:58", "23:59"] : [start, "23:59"];
  return { title, date: s.date, start, end, notes };
}

function timing(date: string, start: string | null, end: string | null, timeZone: string): Pick<GEventBody, "start" | "end"> {
  return start && end
    ? { start: { dateTime: `${date}T${start}:00`, timeZone }, end: { dateTime: `${date}T${end}:00`, timeZone } }
    : { start: { date }, end: { date: addDays(date, 1) } };
}

export function toGoogle(e: ScheduleEvent, timeZone: string): GEventBody {
  return {
    summary: e.title,
    description: e.notes,
    ...timing(e.date, e.start, e.end, timeZone),
    extendedProperties: { private: { [KEY]: `event:${e.id}` } },
  };
}

const hashOf = (body: GEventBody) => createHash("sha1").update(JSON.stringify(body)).digest("hex");

const sameFields = (a: EventFields, b: EventFields) =>
  a.title === b.title && a.date === b.date && a.start === b.start && a.end === b.end && a.notes === b.notes;

/* ---------- what the app pushes ---------- */

function desired(store: Store, timeZone: string, today: string): Map<string, { body: GEventBody; event?: ScheduleEvent }> {
  const settings = store.getGoogleSettings();
  const out = new Map<string, { body: GEventBody; event?: ScheduleEvent }>();
  const tag = (key: string) => ({ extendedProperties: { private: { [KEY]: key } } });

  if (settings.push.events) {
    for (const e of store.listEvents()) out.set(`event:${e.id}`, { body: toGoogle(e, timeZone), event: e });
  }
  if (settings.push.task_dues) {
    for (const p of store.listProjects()) {
      if (p.status === "archived" || p.status === "done") continue;
      for (const t of p.tasks) {
        if (t.status === "done" || !t.due) continue;
        const key = `task:${p.id}/${t.id}`;
        out.set(key, { body: { summary: `Due: ${t.title}`, description: `${p.title} · ${t.priority}`, ...timing(t.due, null, null, timeZone), ...tag(key) } });
      }
    }
  }
  const learning = settings.push.exams || settings.push.course_slots ? store.listLearning() : [];
  if (settings.push.exams) {
    for (const l of learning) {
      for (const x of l.exams ?? []) {
        if (!x.date) continue;
        const key = `exam:${l.id}/${x.id}`;
        out.set(key, { body: { summary: `Exam: ${x.title}`, description: l.title, ...timing(x.date, null, null, timeZone), ...tag(key) } });
      }
      for (const a of l.assignments ?? []) {
        if (a.status === "done" || !a.due) continue;
        const key = `assignment:${l.id}/${a.id}`;
        out.set(key, { body: { summary: `Due: ${a.title}`, description: l.title, ...timing(a.due, null, null, timeZone), ...tag(key) } });
      }
    }
  }
  if (settings.push.course_slots) {
    for (const s of courseSlots(store)) {
      // First meeting on or after today, then weekly until the course gets a grade.
      let first = today;
      for (let i = 0; i < 7 && new Date(`${first}T00:00:00Z`).getUTCDay() !== s.weekday; i++) first = addDays(first, 1);
      out.set(s.key, {
        body: {
          summary: s.title,
          ...(s.room ? { location: s.room } : {}),
          ...timing(first, s.start, s.end, timeZone),
          recurrence: ["RRULE:FREQ=WEEKLY"],
          ...tag(s.key),
        },
      });
    }
  }
  return out;
}

/* ---------- sync ---------- */

let running: Promise<SyncResult> | null = null;

/** One sync at a time per process; a second call joins the running one. */
export function syncGoogle(store: Store, api: CalendarApi, options: SyncOptions): Promise<SyncResult> {
  running ??= doSync(store, api, options).finally(() => (running = null));
  return running;
}

async function doSync(store: Store, api: CalendarApi, options: SyncOptions): Promise<SyncResult> {
  const timeZone = options.timeZone ?? localTimeZone();
  const now = options.now ?? (() => new Date());
  let state = readState(options.statePath);

  /* 1. the dedicated calendar */
  let calendarId = store.getGoogleSettings().calendar_id;
  if (!calendarId || !(await api.calendarExists(calendarId))) {
    calendarId = (await api.createCalendar(CALENDAR_NAME, timeZone)).id;
    store.updateGoogleSettings({ calendar_id: calendarId });
    state = emptyState();
    const stale = store.listEvents().filter((e) => e.google_id);
    if (stale.length) store.applyEventSync({ upsert: stale.map((e) => ({ ...e, google_id: null })), remove: [] }, "reset Google ids (new calendar)");
  }

  /* 2. pull changes made in Google */
  let changes;
  try {
    changes = await api.listChanges(calendarId, state.sync_token);
  } catch (e) {
    if (!(e instanceof GoogleApiError && e.status === 410)) throw e;
    changes = await api.listChanges(calendarId, null); // sync token expired → full list
  }
  const local = store.listEvents();
  const byId = new Map(local.map((e) => [e.id, e]));
  const byGoogle = new Map(local.filter((e) => e.google_id).map((e) => [e.google_id!, e]));
  const taken = new Set(byId.keys());
  const upsert = new Map<string, ScheduleEvent>();
  const remove = new Set<string>();

  for (const g of changes.items) {
    const key = g.extendedProperties?.private?.[KEY];
    if (key && !key.startsWith("event:")) {
      if (g.status === "cancelled") delete state.pushed[key]; // deleted in Google → pushed again
      continue;
    }
    const mine = (key ? byId.get(key.slice("event:".length)) : undefined) ?? byGoogle.get(g.id);
    const googleNewer = (ev: ScheduleEvent) => (g.updated ?? "") > ev.updated;
    if (g.status === "cancelled") {
      if (mine && googleNewer(mine)) remove.add(mine.id);
      continue;
    }
    const fields = fromGoogle(g, timeZone);
    if (!fields) continue;
    if (!mine) {
      if (key) continue; // deleted here; the push step removes it from Google
      const id = store.newEventId(fields.date, fields.title, taken);
      taken.add(id);
      upsert.set(id, { id, ...fields, links: [], google_id: g.id, updated: g.updated ?? now().toISOString() });
    } else if (!sameFields(mine, fields) && googleNewer(mine)) {
      upsert.set(mine.id, { ...mine, ...fields, google_id: g.id, updated: g.updated! });
    }
  }
  const pulled = upsert.size || remove.size ? store.applyEventSync({ upsert: [...upsert.values()], remove: [...remove] }, "sync from Google Calendar") : 0;
  state.sync_token = changes.nextSyncToken || null;

  /* 3. push the app's view */
  const want = desired(store, timeZone, store.today());
  const idUpdates: ScheduleEvent[] = [];
  let pushed = 0;
  let removed = 0;

  for (const [key, { body, event }] of want) {
    const hash = hashOf(body);
    const prev = state.pushed[key];
    const gid = event?.google_id ?? prev?.google_id ?? null;
    if (gid && prev?.hash === hash && prev.google_id === gid) continue;
    let saved: GEvent;
    try {
      saved = gid ? await api.patch(calendarId, gid, body) : await api.insert(calendarId, body);
    } catch (e) {
      if (!(gid && e instanceof GoogleApiError && (e.status === 404 || e.status === 410))) throw e;
      saved = await api.insert(calendarId, body); // gone in Google → create again
    }
    state.pushed[key] = { google_id: saved.id, hash };
    if (event && event.google_id !== saved.id) idUpdates.push({ ...event, google_id: saved.id });
    pushed++;
  }
  for (const [key, prev] of Object.entries(state.pushed)) {
    if (want.has(key)) continue;
    await api.remove(calendarId, prev.google_id);
    delete state.pushed[key];
    removed++;
  }
  if (idUpdates.length) store.applyEventSync({ upsert: idUpdates, remove: [] }, "link events to Google Calendar");

  state.last_sync = now().toISOString();
  writeJson(options.statePath, state);
  return { calendar_id: calendarId, pulled, pushed, removed, last_sync: state.last_sync };
}

/* ---------- read-only overlay ---------- */

/** Events from the user's other calendars, for display only (never written to data/). */
export async function externalItems(store: Store, api: CalendarApi, from: string, to: string, timeZone = localTimeZone()): Promise<ScheduleItem[]> {
  const settings = store.getGoogleSettings();
  const items: ScheduleItem[] = [];
  for (const calendarId of settings.pull_calendars) {
    if (calendarId === settings.calendar_id) continue;
    const events = await api.listRange(calendarId, `${from}T00:00:00Z`, `${addDays(to, 1)}T23:59:59Z`);
    for (const g of events) {
      if (g.status === "cancelled" || g.extendedProperties?.private?.[KEY]) continue;
      const f = fromGoogle({ ...g, recurrence: undefined }, timeZone);
      if (!f || f.date < from || f.date > to) continue;
      items.push({ key: `google:${calendarId}/${g.id}`, kind: "google", title: f.title, date: f.date, start: f.start, end: f.end, ref: null, ...(g.location ? { detail: g.location } : {}) });
    }
  }
  return items;
}
