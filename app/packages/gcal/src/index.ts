/** Google Calendar for Tesseract: OAuth (loopback + PKCE), REST client, two-way sync. */
import { Store, type ScheduleItem } from "@tesseract/core";
import { calendarApi, type CalendarApi } from "./api.ts";
import { googlePaths } from "./files.ts";
import { accessToken, disconnect, loadClient, loadToken, startAuth, type Fetch, type PendingAuth } from "./oauth.ts";
import { externalItems, readState, syncGoogle, type SyncResult } from "./sync.ts";

export * from "./api.ts";
export * from "./files.ts";
export * from "./oauth.ts";
export * from "./sync.ts";

export interface GoogleStatus {
  /** OAuth client file is present (~/.tesseract/google-client.json). */
  client: boolean;
  connected: boolean;
  calendar_id: string | null;
  last_sync: string | null;
  last_error: string | null;
}

export interface GoogleService {
  status(): GoogleStatus;
  connect(): Promise<{ url: string }>;
  sync(): Promise<SyncResult>;
  /** Read-only events from other calendars; [] when not connected. Cached 5 minutes. */
  external(from: string, to: string): Promise<ScheduleItem[]>;
  disconnect(): Promise<void>;
  /** Sync now and then every `minutes` while the process runs (timer does not keep it alive). */
  startAutoSync(minutes?: number): void;
}

export function googleService(store: Store, options: { dir?: string; fetchFn?: Fetch; api?: CalendarApi } = {}): GoogleService {
  const paths = googlePaths(options.dir);
  const fetchFn = options.fetchFn ?? fetch;
  const api = options.api ?? calendarApi(() => accessToken(paths, fetchFn), fetchFn);
  // Sync writes are logged as "google-sync", not as the UI or an AI.
  const syncStore = new Store({ dataDir: store.dataDir, agent: "google-sync" });
  let lastError: string | null = null;
  let pending: PendingAuth | null = null;
  const cache = new Map<string, { at: number; items: ScheduleItem[] }>();

  const connected = () => loadToken(paths) !== null;

  async function sync(): Promise<SyncResult> {
    try {
      const r = await syncGoogle(syncStore, api, { statePath: paths.state });
      lastError = null;
      cache.clear();
      return r;
    } catch (e) {
      lastError = (e as Error).message;
      throw e;
    }
  }

  return {
    status: () => ({
      client: loadClient(paths) !== null,
      connected: connected(),
      calendar_id: store.getGoogleSettings().calendar_id,
      last_sync: readState(paths.state).last_sync,
      last_error: lastError,
    }),
    async connect() {
      pending?.cancel();
      pending = await startAuth(paths, fetchFn);
      pending.done.then(() => sync()).catch((e: Error) => (lastError = e.message));
      return { url: pending.url };
    },
    sync,
    async external(from, to) {
      if (!connected()) return [];
      const k = `${from}/${to}`;
      const hit = cache.get(k);
      if (hit && Date.now() - hit.at < 5 * 60_000) return hit.items;
      try {
        const items = await externalItems(store, api, from, to);
        cache.set(k, { at: Date.now(), items });
        return items;
      } catch (e) {
        lastError = (e as Error).message;
        return [];
      }
    },
    async disconnect() {
      await disconnect(paths, fetchFn);
      cache.clear();
      lastError = null;
    },
    startAutoSync(minutes = 15) {
      const tick = () => {
        if (connected()) sync().catch(() => {});
      };
      tick();
      setInterval(tick, minutes * 60_000).unref();
    },
  };
}
