# Tesseract — Agent Guide

AI-native, local-first personal workspace: Projects, Learning, Skills, Goals, Notes.
**SPEC.md is the source of truth.** Read the relevant section before changing anything. If code and spec disagree, ask — don't guess.

## Layout
- `SPEC.md` — product spec (data model, rules, MCP tools, UI, build phases)
- `app/` — TypeScript monorepo (npm workspaces)
  - `packages/core` — schemas, read/write, calculations. **The only code that writes to `data/`.**
  - `packages/gcal` — Google Calendar OAuth + two-way sync (network code; writes data only via core Store)
  - `apps/mcp` — MCP server (stdio) → core. Tools in `src/server.ts`; compact views live in `packages/core/src/views.ts`
  - `apps/server` — HTTP API (Hono) → core. Localhost only; Host + same-origin JSON checks
  - `apps/web` — React + Vite + Tailwind 4 + TanStack Query. Types imported from core (type-only)
- `data/` — the user's data (Markdown + YAML). Not in git; `npm run setup` creates an empty workspace with the default skill taxonomy. Fixtures remain test-only.

## Commands (run in `app/`)
- `npm install`
- `npm start` — build web + serve app and API at http://localhost:4320 (this computer only)
- `npm run lan` — same, plus phone access with device pairing (docs/MOBILE.md)
- Dev: `npm run server` and `npm run web:dev` (http://localhost:5180, proxies /api) in two terminals
- `npm run desktop:install` — Windows desktop app (own window, opens at sign-in); `npm run build:desktop` after code changes
- `npm test` — all workspace tests (they read `app/fixtures/sample-data`, never the real `data/`)
- `npm run typecheck`
- Never point a dev/test server at the real `data/` while clicking around: use `--data <copy>`.

## Rules
1. **Never edit `data/` by hand from code paths that bypass `core`.** All writes: validate (Zod) → write → append `data/.activity/log.jsonl`.
2. **Tests use temp copies of data**, never the real `data/` folder for writes.
3. **Every change to `core` needs tests.** Keep `npm test` and `npm run typecheck` green.
4. **Schema changes** must update SPEC.md §4 in the same change.
5. Imports use explicit `.ts` extensions (Node runs TS directly, `noEmit`).
6. Keep it small: build one phase at a time (SPEC.md §9). Don't add features from "Later".
7. UI text: English only, minimal, clean.
8. Honest metrics: never inflate progress or skill levels (SPEC.md §4.9).

## Current phase
**v1 complete** (Phases 0–5). Next: use it for 1–2 weeks, then pick from SPEC §2 "Later". Don't build "Later" features unasked.
