/** Minimal Google Calendar v3 REST client (plain fetch — the official SDK is far heavier). */
import type { Fetch } from "./oauth.ts";

const BASE = "https://www.googleapis.com/calendar/v3";

export type GDateTime = { date?: string; dateTime?: string; timeZone?: string };

export interface GEvent {
  id: string;
  status?: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  description?: string;
  location?: string;
  start?: GDateTime;
  end?: GDateTime;
  recurrence?: string[];
  updated?: string;
  extendedProperties?: { private?: Record<string, string> };
}

export type GEventBody = Omit<GEvent, "id" | "status" | "updated">;

export class GoogleApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface CalendarApi {
  createCalendar(summary: string, timeZone: string): Promise<{ id: string }>;
  calendarExists(id: string): Promise<boolean>;
  /** Full list (with deletions) or incremental with a sync token. 410 → sync token expired. */
  listChanges(calendarId: string, syncToken: string | null): Promise<{ items: GEvent[]; nextSyncToken: string }>;
  /** Expanded instances in a time window (read-only overlay). */
  listRange(calendarId: string, timeMin: string, timeMax: string): Promise<GEvent[]>;
  insert(calendarId: string, body: GEventBody): Promise<GEvent>;
  patch(calendarId: string, eventId: string, body: GEventBody): Promise<GEvent>;
  remove(calendarId: string, eventId: string): Promise<void>;
}

export function calendarApi(getToken: () => Promise<string>, fetchFn: Fetch = fetch): CalendarApi {
  async function call<T>(method: string, path: string, query: Record<string, string> = {}, body?: unknown): Promise<T> {
    const url = new URL(BASE + path);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const res = await fetchFn(url, {
      method,
      headers: { authorization: `Bearer ${await getToken()}`, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 204) return undefined as T;
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
    if (!res.ok) throw new GoogleApiError(res.status, `Google Calendar ${res.status}: ${json.error?.message ?? res.statusText}`);
    return json;
  }
  const cal = (id: string) => `/calendars/${encodeURIComponent(id)}`;

  return {
    createCalendar: (summary, timeZone) => call("POST", "/calendars", {}, { summary, timeZone }),
    async calendarExists(id) {
      try {
        await call("GET", cal(id));
        return true;
      } catch (e) {
        if (e instanceof GoogleApiError && (e.status === 404 || e.status === 410)) return false;
        throw e;
      }
    },
    async listChanges(calendarId, syncToken) {
      const items: GEvent[] = [];
      let pageToken: string | undefined;
      for (;;) {
        const q: Record<string, string> = { maxResults: "250", showDeleted: "true" };
        if (syncToken) q.syncToken = syncToken;
        if (pageToken) q.pageToken = pageToken;
        const r = await call<{ items?: GEvent[]; nextPageToken?: string; nextSyncToken?: string }>(
          "GET",
          `${cal(calendarId)}/events`,
          q,
        );
        items.push(...(r.items ?? []));
        if (r.nextPageToken) pageToken = r.nextPageToken;
        else return { items, nextSyncToken: r.nextSyncToken ?? "" };
      }
    },
    async listRange(calendarId, timeMin, timeMax) {
      const items: GEvent[] = [];
      let pageToken: string | undefined;
      for (;;) {
        const q: Record<string, string> = { timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "250" };
        if (pageToken) q.pageToken = pageToken;
        const r = await call<{ items?: GEvent[]; nextPageToken?: string }>("GET", `${cal(calendarId)}/events`, q);
        items.push(...(r.items ?? []));
        if (!r.nextPageToken) return items;
        pageToken = r.nextPageToken;
      }
    },
    insert: (calendarId, body) => call("POST", `${cal(calendarId)}/events`, {}, body),
    patch: (calendarId, eventId, body) => call("PATCH", `${cal(calendarId)}/events/${encodeURIComponent(eventId)}`, {}, body),
    async remove(calendarId, eventId) {
      try {
        await call("DELETE", `${cal(calendarId)}/events/${encodeURIComponent(eventId)}`);
      } catch (e) {
        if (e instanceof GoogleApiError && (e.status === 404 || e.status === 410)) return; // already gone
        throw e;
      }
    },
  };
}
