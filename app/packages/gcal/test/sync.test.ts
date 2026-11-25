import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDataDir, Store } from "@tesseract/core";
import { fromGoogle, GoogleApiError, readState, syncGoogle, type CalendarApi, type GEvent, type GEventBody } from "../src/index.ts";

const TZ = "Asia/Bangkok";
const NOW = () => new Date(2026, 10, 23, 12, 0, 0);

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "brain-gcal-"));
  cpSync(resolveDataDir(), join(dir, "data"), { recursive: true });
  const store = new Store({ dataDir: join(dir, "data"), agent: "google-sync", now: NOW });
  const google = fakeGoogle();
  const run = () => syncGoogle(store, google.api, { statePath: join(dir, "state.json"), timeZone: TZ, now: NOW });
  return { store, google, run, statePath: join(dir, "state.json") };
}

/** In-memory Google Calendar with sync tokens (sequence numbers). */
function fakeGoogle() {
  const calendars = new Set<string>();
  const events = new Map<string, GEvent & { seq: number; cal: string }>();
  let seq = 0;
  let clock = Date.UTC(2026, 10, 24, 0, 0, 0);
  let nextId = 1;
  const tick = () => new Date((clock += 60_000)).toISOString();
  const put = (cal: string, e: GEvent) => {
    const saved = { ...e, cal, seq: ++seq, updated: e.updated ?? tick() };
    events.set(e.id, saved);
    const { seq: _s, cal: _c, ...out } = saved;
    return out as GEvent;
  };
  const calls: string[] = [];
  let expireToken = false;

  const api: CalendarApi = {
    async createCalendar(summary) {
      const id = `cal-${calendars.size + 1}`;
      calendars.add(id);
      calls.push(`createCalendar ${summary}`);
      return { id };
    },
    calendarExists: async (id) => calendars.has(id),
    async listChanges(cal, token) {
      if (token && expireToken) {
        expireToken = false;
        throw new GoogleApiError(410, "gone");
      }
      const since = token ? Number(token) : 0;
      const items = [...events.values()].filter((e) => e.cal === cal && e.seq > since).map(({ seq: _s, cal: _c, ...e }) => e);
      return { items, nextSyncToken: String(seq) };
    },
    listRange: async () => [],
    async insert(cal, body) {
      calls.push(`insert ${body.summary}`);
      return put(cal, { ...body, id: `g${nextId++}`, status: "confirmed" });
    },
    async patch(cal, id, body) {
      const cur = events.get(id);
      if (!cur || cur.status === "cancelled") throw new GoogleApiError(404, "not found");
      calls.push(`patch ${body.summary}`);
      return put(cal, { ...cur, ...body, id, updated: undefined });
    },
    async remove(_cal, id) {
      const cur = events.get(id);
      calls.push(`remove ${cur?.summary}`);
      if (cur) put(cur.cal, { ...cur, status: "cancelled", updated: undefined });
    },
  };
  return {
    api,
    calls,
    events,
    expire: () => (expireToken = true),
    /** Simulate the user editing in Google / Notion Calendar. */
    userEdit: (id: string, patch: Partial<GEvent>) => put(events.get(id)!.cal, { ...events.get(id)!, ...patch, updated: patch.updated }),
    userCreate: (cal: string, body: GEventBody) => put(cal, { ...body, id: `u${nextId++}`, status: "confirmed" }),
    byKey: (key: string) => [...events.values()].find((e) => e.extendedProperties?.private?.sb_key === key && e.status !== "cancelled"),
  };
}

describe("fromGoogle", () => {
  it("reads all-day and timed events in the local time zone", () => {
    expect(fromGoogle({ id: "a", summary: "Holiday", start: { date: "2026-12-05" }, end: { date: "2026-12-06" } }, TZ)).toEqual({
      title: "Holiday", date: "2026-12-05", start: null, end: null, notes: "",
    });
    // 02:00Z = 09:00 in Bangkok
    expect(
      fromGoogle({ id: "b", summary: "Call", start: { dateTime: "2026-12-05T02:00:00Z" }, end: { dateTime: "2026-12-05T03:30:00Z" } }, TZ),
    ).toMatchObject({ date: "2026-12-05", start: "09:00", end: "10:30" });
    expect(fromGoogle({ id: "c", recurrence: ["RRULE:FREQ=DAILY"], start: { date: "2026-12-05" } }, TZ)).toBeNull();
  });
});

describe("two-way sync", () => {
  it("creates the Tesseract calendar and pushes events, dues, exams and classes", async () => {
    const { store, google, run } = setup();
    store.addEvent({ title: "Study pods", date: "2026-11-25", start: "14:00", end: "16:00" });
    store.addTask("weather-app", { title: "Demo", due: "2026-12-01" });

    const r = await run();
    expect(google.calls[0]).toBe("createCalendar Tesseract");
    expect(store.getGoogleSettings().calendar_id).toBe("cal-1");
    expect(r.pushed).toBeGreaterThanOrEqual(5); // event, 5 open tasks with due dates, assignment, exam, class
    expect(store.listEvents()[0]!.google_id).toBe(google.byKey("event:2026-11-25-study-pods")!.id);
    expect(google.byKey("task:weather-app/t-005")).toMatchObject({ summary: "Due: Demo", start: { date: "2026-12-01" } });
    expect(google.byKey("exam:operating-systems/midterm")).toMatchObject({ summary: "Exam: Midterm" });
    expect(google.byKey("class:operating-systems/0")).toMatchObject({
      recurrence: ["RRULE:FREQ=WEEKLY"],
      start: { dateTime: "2026-11-23T09:00:00", timeZone: TZ }, // 2026-11-23 is a Monday
    });
    expect(google.byKey("event:2026-11-25-study-pods")!.start).toEqual({ dateTime: "2026-11-25T14:00:00", timeZone: TZ });

    // Nothing changed → nothing sent
    google.calls.length = 0;
    expect(await run()).toMatchObject({ pulled: 0, pushed: 0, removed: 0 });
    expect(google.calls).toEqual([]);
  });

  it("brings back edits and deletes made in Google", async () => {
    const { store, google, run } = setup();
    const e = store.addEvent({ title: "Study pods", date: "2026-11-25", start: "14:00", end: "16:00" });
    await run();
    const gid = store.getEvent(e.id).google_id!;

    google.userEdit(gid, { summary: "Study pods + services", start: { dateTime: "2026-11-26T08:00:00Z" }, end: { dateTime: "2026-11-26T10:00:00Z" } });
    expect((await run()).pulled).toBe(1);
    expect(store.getEvent(e.id)).toMatchObject({ title: "Study pods + services", date: "2026-11-26", start: "15:00", end: "17:00" });
    expect(store.listActivity()[0]).toMatchObject({ agent: "google-sync" });

    google.userEdit(gid, { status: "cancelled" });
    await run();
    expect(store.listEvents()).toEqual([]);
  });

  it("imports events created in the Tesseract calendar and tags them", async () => {
    const { store, google, run } = setup();
    await run();
    const g = google.userCreate("cal-1", { summary: "Dentist", start: { date: "2026-11-28" }, end: { date: "2026-11-29" } });
    await run();
    const imported = store.listEvents().find((x) => x.google_id === g.id)!;
    expect(imported).toMatchObject({ id: "2026-11-28-dentist", title: "Dentist", start: null });
    expect(google.events.get(g.id)!.extendedProperties?.private?.sb_key).toBe("event:2026-11-28-dentist");
  });

  it("keeps the newer side on conflict and removes Google events deleted in the app", async () => {
    const { store, google, run } = setup();
    const e = store.addEvent({ title: "Gym", date: "2026-11-25" });
    await run();
    const gid = store.getEvent(e.id).google_id!;
    // Google edit older than the app's last change → app wins and overwrites Google
    store.updateEvent(e.id, { title: "Gym (legs)" });
    google.userEdit(gid, { summary: "Gym (old)", updated: "2026-01-01T00:00:00.000Z" });
    await run();
    expect(store.getEvent(e.id).title).toBe("Gym (legs)");
    expect(google.events.get(gid)!.summary).toBe("Gym (legs)");

    store.deleteEvent(e.id);
    expect((await run()).removed).toBe(1);
    expect(google.events.get(gid)!.status).toBe("cancelled");
  });

  it("removes a task due date from Google once the task is done", async () => {
    const { store, google, run } = setup();
    store.addTask("weather-app", { title: "Demo", due: "2026-12-01" });
    await run();
    expect(google.byKey("task:weather-app/t-005")).toBeDefined();
    store.updateTask("weather-app", "t-005", { status: "done" });
    await run();
    expect(google.byKey("task:weather-app/t-005")).toBeUndefined();
  });

  it("recovers from an expired sync token and a deleted calendar", async () => {
    const { store, google, run, statePath } = setup();
    const e = store.addEvent({ title: "Gym", date: "2026-11-25" });
    await run();
    google.expire();
    await expect(run()).resolves.toMatchObject({ pulled: 0 });

    (google.api as { calendarExists: (id: string) => Promise<boolean> }).calendarExists = async () => false;
    const r = await run();
    expect(r.calendar_id).toBe("cal-2");
    expect(store.getEvent(e.id).google_id).not.toBeNull();
    expect(readState(statePath).last_sync).not.toBeNull();
  });

  it("respects push settings", async () => {
    const { store, google, run } = setup();
    store.updateGoogleSettings({ push: { task_dues: false, course_slots: false, exams: false } });
    store.addTask("weather-app", { title: "Demo", due: "2026-12-01" });
    store.addEvent({ title: "Gym", date: "2026-11-25" });
    await run();
    expect(google.calls.filter((c) => c.startsWith("insert"))).toEqual(["insert Gym"]);
  });
});
