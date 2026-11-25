import { describe, expect, it } from "vitest";
import { BrainError, parseSlotTime, scheduleItems } from "../src/index.ts";
import { makeStore } from "./helpers.ts";

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof BrainError ? e.code : "OTHER";
  }
  return "NONE";
};

describe("schedule events", () => {
  it("adds, updates and deletes events, each logged and undoable", () => {
    const store = makeStore();
    const e = store.addEvent({ title: "Study pods", date: "2026-11-24", start: "14:00", end: "16:00", links: ["learning/kubernetes"] });
    expect(e).toMatchObject({ id: "2026-11-24-study-pods", google_id: null, notes: "" });
    expect(store.listActivity()[0]).toMatchObject({ agent: "test", action: "create", entity: "schedule/events" });

    const moved = store.updateEvent(e.id, { start: "15:00", end: "17:00" });
    expect(moved.start).toBe("15:00");

    store.deleteEvent(e.id);
    expect(store.listEvents()).toEqual([]);
    store.undo(store.listActivity()[0]!.id);
    expect(store.listEvents().map((x) => x.start)).toEqual(["15:00"]);
  });

  it("makes ids unique and sorts all-day before timed events", () => {
    const store = makeStore();
    store.addEvent({ title: "Gym", date: "2026-11-24", start: "18:00", end: "19:00" });
    store.addEvent({ title: "Gym", date: "2026-11-24", start: "07:00", end: "08:00" });
    store.addEvent({ title: "Holiday", date: "2026-11-24" });
    expect(store.listEvents().map((e) => e.id)).toEqual(["2026-11-24-holiday", "2026-11-24-gym-2", "2026-11-24-gym"]);
    expect(store.listEvents({ from: "2026-11-25" })).toEqual([]);
  });

  it("rejects bad times, half-open times and unknown links without writing", () => {
    const store = makeStore();
    expect(codeOf(() => store.addEvent({ title: "x", date: "2026-11-24", start: "25:00", end: "26:00" }))).toBe("VALIDATION");
    expect(codeOf(() => store.addEvent({ title: "x", date: "2026-11-24", start: "10:00" }))).toBe("VALIDATION");
    expect(codeOf(() => store.addEvent({ title: "x", date: "2026-11-24", start: "10:00", end: "09:00" }))).toBe("VALIDATION");
    expect(codeOf(() => store.addEvent({ title: "x", date: "2026-11-24", links: ["projects/nope"] }))).toBe("VALIDATION");
    expect(codeOf(() => store.updateEvent("nope", { title: "y" }))).toBe("NOT_FOUND");
    expect(store.listActivity()).toHaveLength(0);
  });

  it("applies a sync batch as one change and skips unchanged events", () => {
    const store = makeStore({ agent: "google-sync" });
    const a = store.addEvent({ title: "A", date: "2026-11-24" });
    const b = store.addEvent({ title: "B", date: "2026-11-25" });
    const before = store.listActivity().length;
    const n = store.applyEventSync(
      { upsert: [a, { ...b, title: "B moved", date: "2026-11-26", google_id: "g1" }], remove: [] },
      "sync from Google",
    );
    expect(n).toBe(1);
    expect(store.listActivity()).toHaveLength(before + 1);
    expect(store.getEvent(b.id)).toMatchObject({ title: "B moved", google_id: "g1" });
    expect(store.applyEventSync({ upsert: [], remove: [a.id] }, "sync")).toBe(1);
    expect(store.applyEventSync({ upsert: [], remove: ["missing"] }, "sync")).toBe(0);
  });

  it("stores Google settings with defaults and merges push flags", () => {
    const store = makeStore();
    expect(store.getGoogleSettings()).toEqual({
      calendar_id: null,
      pull_calendars: ["primary"],
      push: { events: true, task_dues: true, course_slots: true, exams: true },
    });
    const s = store.updateGoogleSettings({ calendar_id: "abc@group.calendar.google.com", push: { task_dues: false } });
    expect(s.push).toEqual({ events: true, task_dues: false, course_slots: true, exams: true });
    expect(store.getGoogleSettings().calendar_id).toBe("abc@group.calendar.google.com");
    expect(store.validateAll()).toEqual([]);
  });
});

describe("schedule view", () => {
  it("parses class times", () => {
    expect(parseSlotTime("9:00-12:00")).toEqual(["09:00", "12:00"]);
    expect(parseSlotTime("13:30 – 15:00")).toEqual(["13:30", "15:00"]);
    expect(parseSlotTime("TBA")).toEqual([null, null]);
  });

  it("merges events, weekly classes, task dues, assignments and exams", () => {
    const store = makeStore();
    store.addEvent({ title: "Study pods", date: "2026-11-30", start: "14:00", end: "16:00" });
    store.addTask("weather-app", { title: "Demo", due: "2026-12-01", priority: "high" });
    // 2026-11-30 and 2026-12-07 are Mondays: the OS course meets 09:00-12:00
    const items = scheduleItems(store, "2026-11-30", "2026-12-15");
    expect(items.map((i) => [i.kind, i.date, i.start, i.title])).toEqual([
      ["class", "2026-11-30", "09:00", "Operating Systems"],
      ["event", "2026-11-30", "14:00", "Study pods"],
      ["assignment", "2026-12-01", null, "Process scheduling lab"],
      ["task", "2026-12-01", null, "Demo"],
      ["class", "2026-12-07", "09:00", "Operating Systems"],
      ["class", "2026-12-14", "09:00", "Operating Systems"],
      ["exam", "2026-12-15", null, "Midterm"],
    ]);
  });

  it("hides finished courses and done tasks, and limits the range", () => {
    const store = makeStore();
    store.updateLearning("operating-systems", { grade: "A" });
    expect(scheduleItems(store, "2026-11-30", "2026-11-30")).toEqual([]);
    expect(codeOf(() => scheduleItems(store, "2026-01-01", "2026-12-31"))).toBe("VALIDATION");
  });
});
