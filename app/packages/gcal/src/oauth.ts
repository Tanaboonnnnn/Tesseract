/**
 * OAuth for an installed ("Desktop app") client: loopback redirect + PKCE (RFC 8252).
 * No secrets in the repo; the client file and token live in ~/.panya.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { readJson, removeFile, writeJson, type GooglePaths } from "./files.ts";

/** Least privilege: manage only calendars this app creates + read events (for the read-only overlay). */
export const SCOPES = [
  "https://www.googleapis.com/auth/calendar.app.created",
  "https://www.googleapis.com/auth/calendar.events.readonly",
];

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export interface OAuthClient {
  client_id: string;
  client_secret: string;
}

export interface Token {
  access_token: string;
  refresh_token: string;
  /** epoch ms */
  expires_at: number;
}

export type Fetch = typeof fetch;

/** Reads the JSON downloaded from Google Cloud (`{"installed": {...}}`). */
export function loadClient(paths: GooglePaths): OAuthClient | null {
  const raw = readJson<{ installed?: OAuthClient; web?: OAuthClient }>(paths.client);
  const c = raw?.installed ?? raw?.web;
  return c?.client_id && c.client_secret ? { client_id: c.client_id, client_secret: c.client_secret } : null;
}

const b64url = (buf: Buffer) => buf.toString("base64url");

async function postForm(fetchFn: Fetch, url: string, form: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetchFn(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Google OAuth error ${res.status}: ${String(body.error_description ?? body.error ?? "")}`);
  return body;
}

export interface PendingAuth {
  /** Open this in a browser. */
  url: string;
  /** Resolves once the user approved and the token is saved. */
  done: Promise<void>;
  cancel: () => void;
}

/** Starts a one-shot loopback server and returns the consent URL. Times out after 5 minutes. */
export async function startAuth(paths: GooglePaths, fetchFn: Fetch = fetch): Promise<PendingAuth> {
  const client = loadClient(paths);
  if (!client) throw new Error(`Google client file missing: ${paths.client} (see docs/GOOGLE_CALENDAR.md)`);
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(16));

  let finish!: (err?: Error) => void;
  const done = new Promise<void>((resolve, reject) => {
    finish = (err) => (err ? reject(err) : resolve());
  });
  done.catch(() => {}); // callers may ignore it

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/callback") return void res.writeHead(404).end();
    const reply = (ok: boolean, text: string) => {
      res.writeHead(ok ? 200 : 400, { "content-type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><meta charset="utf-8"><title>Panya</title><body style="font-family:system-ui;padding:3rem"><h2>${text}</h2><p>You can close this window.</p>`);
    };
    try {
      if (url.searchParams.get("state") !== state) throw new Error("State mismatch");
      const code = url.searchParams.get("code");
      if (!code) throw new Error(url.searchParams.get("error") ?? "No code");
      const t = await postForm(fetchFn, TOKEN_URL, {
        code,
        client_id: client.client_id,
        client_secret: client.client_secret,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: redirect,
      });
      if (typeof t.refresh_token !== "string") throw new Error("Google did not return a refresh token");
      saveToken(paths, {
        access_token: String(t.access_token),
        refresh_token: t.refresh_token,
        expires_at: Date.now() + Number(t.expires_in ?? 3600) * 1000,
      });
      reply(true, "Google Calendar connected");
      finish();
    } catch (e) {
      reply(false, "Could not connect Google Calendar");
      finish(e as Error);
    } finally {
      close();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const redirect = `http://127.0.0.1:${(server.address() as AddressInfo).port}/callback`;
  const timer = setTimeout(() => {
    finish(new Error("Timed out waiting for Google consent"));
    close();
  }, 5 * 60_000);
  timer.unref();
  function close() {
    clearTimeout(timer);
    server.close();
  }

  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: redirect,
    response_type: "code",
    scope: SCOPES.join(" "),
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    access_type: "offline",
    prompt: "consent",
  }).toString();
  return { url: url.toString(), done, cancel: () => (finish(new Error("Cancelled")), close()) };
}

export function loadToken(paths: GooglePaths): Token | null {
  return readJson<Token>(paths.token);
}

export function saveToken(paths: GooglePaths, token: Token): void {
  writeJson(paths.token, token);
}

/** Valid access token, refreshed when it expires within a minute. */
export async function accessToken(paths: GooglePaths, fetchFn: Fetch = fetch): Promise<string> {
  const token = loadToken(paths);
  if (!token) throw new Error("Google Calendar is not connected");
  if (token.expires_at - 60_000 > Date.now()) return token.access_token;
  const client = loadClient(paths);
  if (!client) throw new Error(`Google client file missing: ${paths.client}`);
  const t = await postForm(fetchFn, TOKEN_URL, {
    client_id: client.client_id,
    client_secret: client.client_secret,
    refresh_token: token.refresh_token,
    grant_type: "refresh_token",
  });
  const next = { ...token, access_token: String(t.access_token), expires_at: Date.now() + Number(t.expires_in ?? 3600) * 1000 };
  saveToken(paths, next);
  return next.access_token;
}

/** Revoke at Google (best effort) and forget the token and sync state. */
export async function disconnect(paths: GooglePaths, fetchFn: Fetch = fetch): Promise<void> {
  const token = loadToken(paths);
  if (token) await postForm(fetchFn, REVOKE_URL, { token: token.refresh_token }).catch(() => {});
  removeFile(paths.token);
  removeFile(paths.state);
}
