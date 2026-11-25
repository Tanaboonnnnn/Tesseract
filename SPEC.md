# Tesseract — Spec v0.1

> AI-native, local-first personal workspace. You set goals and decide; AI clients read and update one shared dataset; a clean dashboard shows progress.
> Status: **draft for review** · Last updated: 2026-11-23

---

## 1. Principles

- **Local-first** — data lives on this machine as plain files. Cloud/GitHub sync comes later.
- **AI-agnostic** — any MCP client (Claude Desktop, Claude Code, Codex, Antigravity; ChatGPT later) works on the same data.
- **Token-efficient** — compact summaries by default, details only on request.
- **Human-readable** — Markdown + YAML, readable without the app (Obsidian-compatible).
- **Honest metrics** — Progress (how much done) ≠ Proficiency (how good). No inflated levels.
- **Clean UI** — English only, minimal text. Home = previews; click through to Full View.

## 2. Scope

| v1 | Later |
|---|---|
| Goals (simple) | Health / Workout tracking |
| Projects (`coding`, `general` templates) + Tasks | GitHub integration (PR, Issues, Sync) |
| Learning: `roadmap` + `course` | LEB2 importer for university courses |
| Skills: taxonomy, levels, 2-level radar | Full Skill Tree (dependencies) |
| Assessments (AI quiz, web quiz, CTF, lab, exam…) + `inbox/` | Knowledge Graph view |
| Notes (`note`, `decision`, `log`) with `[[wikilinks]]` | ~~ChatGPT via remote MCP + auth~~ → Phase 8a (OpenAI tunnel) |
| Review queue (needs-review rules) | Fine-grained AI permissions |
| Activity log (last 20 changes, undo) | ~~Native desktop app (Tauri)~~ → desktop launcher (Phase 6a) |
| MCP server (stdio) | Cloud sync |
| Web UI as installable PWA (desktop + mobile) | Voice assistant (idea, below) |

**Idea: voice assistant (not scheduled).** Push-to-talk (Ctrl+Space), Thai + English. Known commands (open a page,
project, course or visual; "review"; next/previous step) run locally with 0 tokens. Questions go to an AI with
read-only tools + "open page" (Gemini Live API is the free-tier candidate; its free tier lets Google use the data).
Writes need a spoken or clicked confirm. "System assistant" persona ("Report: … / Answer: …"), a chime and a HUD
caption. Voices: (1) preset picker (Gemini / Edge) with speed, pitch and a "system voice" filter; (2) voice design
from a text description (e.g. ElevenLabs); (3) any voice ID from the user's own provider account. Only voices the
user has rights to: no cloning of actors or anime characters without consent. Keys live in `~/.tesseract`.

## 3. Layout

```
tesseract/
├── SPEC.md
├── AGENTS.md                # rules for AI coding agents
├── app/                      # code (TypeScript monorepo)
│   ├── packages/core/        # read/write/validate data, calculations — the ONLY writer
│   ├── apps/mcp/             # MCP server (stdio) → core
│   ├── apps/server/          # HTTP API + serves web → core
│   └── apps/web/             # React PWA
└── data/                     # your real data (sample data used during development)
    ├── goals/<id>.md
    ├── projects/<id>/project.md + tasks.yaml (+ map.yaml, §4.14)
    ├── learning/<id>/learning.md + topics.yaml
    ├── skills/taxonomy.yaml + adjustments.yaml
    ├── assessments/<yyyy-mm-dd>-<slug>.md
    ├── notes/<slug>.md
    ├── quizzes/<id>.yaml     # AI-written multiple-choice quizzes taken in the web app
    ├── schedule/events.yaml + google.yaml   # own events, Google Calendar settings (§4.13)
    ├── inbox/                # raw material you drop in (CTF/lab problems, text, links)
    └── .activity/log.jsonl   # change log
```

- Local `git init` from day one (safety net for vibe coding). No GitHub connection in v1.
- All writes go through `core`: schema-validated (Zod), logged, never raw file writes by AI.

## 4. Data Model

Common fields on every entity: `id` (kebab-case, unique), `title`, `tags[]`, `created`, `updated`.
Tags replace "Spaces" (e.g. `personal`, `work`, `research`). Views can depend on tags/type.

### 4.1 Goal
```yaml
id: full-stack-developer
title: Full-Stack Developer
target_date: 2027-12-31
status: active            # active | achieved | dropped
```
Progress = average progress of linked projects + learning items.

### 4.2 Project — `projects/<id>/project.md`
```yaml
id: weather-app
title: Weather App
template: coding          # coding | general
status: active            # idea | active | paused | done | archived
goal: full-stack-developer
phases: [ideation, plan, build, test, release]   # default, editable per project
phase: build
progress_override: null   # number 0–100 to override auto progress
start: 2026-02-01
due: 2026-03-31
# coding only:
repo: github.com/you/weather-app
stack: [go, python, docker]
```
Body = free Markdown description.

| Template | Extra fields | Main view |
|---|---|---|
| `coding` | repo, stack | Kanban + phase stepper |
| `general` | — | Checklist + timeline |

**Progress** = done tasks / all tasks (auto), unless `progress_override` is set.

### 4.3 Task — `projects/<id>/tasks.yaml`
```yaml
- id: t-001
  title: Design the dashboard
  status: todo            # todo | doing | review | done
  priority: high          # low | medium | high | urgent
  due: 2026-03-10
  phase: build
  done_at: null
```

### 4.4 Learning — `learning/<id>/learning.md`
```yaml
id: kubernetes
title: Kubernetes
type: roadmap             # roadmap | course
goal: full-stack-developer
phases: [basics, workloads, networking, security, operations]
```
**`course` extra fields** (LEB2-ready):
```yaml
source: manual            # manual | leb2
external_id: null         # LEB2 course id later
term: 2/2026
schedule: [{ day: mon, time: "09:00-12:00", room: "..." }]
assignments: [{ id, title, due, status, score, max_score }]
exams: [{ id, title, date, weight, score, max_score }]
grade: null
```
Progress = topics with status `understood` / all topics.

### 4.5 Topic — `learning/<id>/topics.yaml`
```yaml
- id: pods
  title: Pods
  phase: basics
  status: learning        # not-started | learning | understood | needs-review
  skills: [kubernetes-ops, containers]
  depends_on: []
  last_reviewed: 2026-11-20
  last_score: 72
```

### 4.6 Review rules
Topic becomes `needs-review` if **either**:
- 🕐 **Stale** — not reviewed for > 14 days → "review to retain"
- 📉 **Weak** — last score < 60 → "re-learn"

Both → highest priority in review queue. Reason is stored and shown.

### 4.7 Skills — `skills/taxonomy.yaml`
Two levels: **domain → skill**. Radar top level = domains; click a domain = radar of its skills. Taxonomy is yours to edit anytime; the sample is a general tech/student example.

| Domain | Skills |
|---|---|
| **Programming** | Python, JavaScript & TypeScript, Go, Git, Data Structures & Algorithms, Testing |
| **Web Development** | HTML & CSS, Frontend Frameworks (React), Web APIs (REST), Databases & SQL, Web Security Basics |
| **Systems** | Linux Administration, Bash Scripting, OS Internals |
| **Networking** | Fundamentals (OSI/TCP-IP), Protocols (DNS/HTTP/TLS), Packet Analysis, Network Security, Wireless |
| **Cloud & DevOps** | Cloud Platforms (AWS/Azure/GCP), Docker & Containers, Kubernetes, Infrastructure as Code, CI/CD |
| **Security** | Security Concepts, Identity & Access Management, Cryptography |
| **AI & Data** | Statistics, Data Analysis, ML Fundamentals, LLM Apps & Prompting |
| **Math** | Calculus, Linear Algebra, Probability, Discrete Math |
| **English** | Reading, Listening, Speaking, Writing |

### 4.8 Assessment — `assessments/<date>-<slug>.md`
```yaml
id: 2026-11-21-ctf-web-01
title: CTF — SQLi challenge
source: ctf               # ai-quiz | web-quiz | ctf | lab | competition | exam | project
skills: { web-security: 0.7, web-apis: 0.3 }   # weights sum to 1
score: 75                 # 0–100
difficulty: hard          # easy | medium | hard
date: 2026-11-21
topic_refs: [learning/web-security#sqli]
raw: inbox/ctf-web-01.txt # original material, if any
```
Body = questions, your answers, AI analysis.

**Inbox flow:** you drop raw problems/results into `inbox/` → AI reads, structures into an assessment, links skills/topics → raw file kept as reference.

### 4.9 Skill level (0–100)
1. **Effective score** = `score × difficulty factor` (easy 0.4, medium 0.7, hard 1.0)
2. **Computed level** = weighted average of effective scores for that skill, weight = `skill weight × recency`, recency half-life 90 days.
3. **AI adjustment** (`skills/adjustments.yaml`) — honest, no flattering:
   - Range: **±15** from computed level.
   - **Decrease** allowed when AI sees weaknesses in your answers.
   - **Increase** only with cited concrete evidence (assessment/note/project refs).
   - Every adjustment stores: `skill, delta, reason, evidence[], agent, date`. Visible in history.
4. **Final level** = clamp(computed + adjustment, 0, 100).
5. Never assessed = **0** (no hiding gaps). Domain level = mean of its skills.

### 4.10 Note — `notes/<slug>.md`
```yaml
id: why-react-for-weather-app
type: decision            # note | decision | log
links: [projects/weather-app, skills/web-apis]
```
Body Markdown with `[[wikilinks]]`.

### 4.10a Offline workspace snapshot

Workspace snapshots are a versioned JSON archive of validated managed records, protected against accidental corruption by SHA-256. The allow-list includes the primary Markdown/YAML records and local schedule, not machine settings, integrations, inbox, legacy undo log or the isolated Classroom database. Import creates a new data directory, never overwrites one, and is not a live-sync mechanism. The archive is private and unencrypted. See [BACKUP.md](docs/BACKUP.md).

### 4.11 Activity log — `.activity/log.jsonl`
Every write appends: `{ ts, agent, action, entity, before, after }`.
- UI shows **last 20 changes**, each with **undo**.
- Optional: git commit per change (`gitCommit` option, off by default) for full history beyond that.
- Updates that change nothing are skipped, so they never fill the undo history.
- `agent` comes from client config (e.g. `claude-code`, `codex`, `web-ui`).
- **Deleting a project or learning item** (web UI only, not MCP): a dry run shows what goes, then the whole folder
  (tasks, map, topics, visuals) is removed in **one** change, so one undo restores it. Links to it are removed from
  notes and events; open quizzes on a deleted course go too. Assessments, finished quizzes and skill history stay (§4.9).

### 4.12 Quiz — `quizzes/<id>.yaml`
An AI writes a quiz (via MCP `create_quiz`); you take it in the web app; the server grades it.
```yaml
id: 2026-11-23-kubernetes-deployments
title: Kubernetes Deployments
skills: { kubernetes-ops: 1 }   # weights sum to 1
difficulty: medium
topic_refs: [learning/kubernetes#deployments]
status: open              # open | done
assessment: null          # assessment id once taken
author: claude-code       # agent that wrote it
questions:
  - q: Which object does a Deployment create directly?
    choices: [StatefulSet, ReplicaSet, DaemonSet, Job]
    answer: 1             # index of the correct choice
    explain: A Deployment manages ReplicaSets.
  - type: multi           # select all that apply
    q: Which objects can own Pods?
    choices: [ReplicaSet, Service, Job, ConfigMap]
    answers: [0, 2]
  - type: short           # typed answer
    q: Default HTTPS port?
    accept: ["443"]
    tolerance: 0          # numbers only: allowed absolute difference
```
- **Answers never reach the browser** while a quiz is open; grading happens on the server.
- **One attempt.** Submitting writes a `web-quiz` assessment (id = quiz id), updates linked topics and closes the quiz, all as one change (one undo).
- **Question types:** `single` (default when `type` is missing, so older quizzes still load; `answer` = index),
  `multi` (`answers` = indexes; right only when exactly that set is picked — no partial credit), `short` (typed; right
  when it matches one of `accept` after ignoring case, extra spaces and a trailing period; if both are numbers they are
  compared as numbers within `tolerance`). 2–8 choices; open quizzes show only `type`, `q` and `choices`.
- Score = correct / total × 100, then the normal skill-level formula (§4.9) applies.

### 4.13 Schedule — `schedule/events.yaml` + `schedule/google.yaml` (Phase 6b)
```yaml
# events.yaml — your own events
- id: 2026-11-24-study-kubernetes-pods   # <date>-<slug>, made unique
  title: Study Kubernetes pods
  date: 2026-11-24
  start: "14:00"          # HH:MM 24h; start + end both null = all-day
  end: "16:00"            # must be after start
  links: [learning/kubernetes]   # entity refs, must exist
  notes: ""
  google_id: null         # set once synced
  updated: 2026-11-24T07:00:00.000Z   # ISO timestamp, newer side wins on sync conflicts
```
```yaml
# google.yaml — settings only, no secrets
calendar_id: null         # the dedicated "Tesseract" calendar (created on first sync)
pull_calendars: [primary] # shown read-only, never stored
push: { events: true, task_dues: true, course_slots: true, exams: true }   # exams also covers assignments
```
- **Schedule view** = own events + weekly course `schedule` slots (courses without a `grade`) + open task `due` dates +
  open assignment `due` dates + exam dates (+ read-only Google events). Max range 92 days.
- **Google sync** (`packages/gcal`): own events two-way (Google/Notion Calendar edits and deletes come back; events created
  in the Tesseract calendar are imported); dues, exams, assignments and classes (weekly `RRULE`) one-way.
  Writes only the Tesseract calendar. Scopes `calendar.app.created` + `calendar.events.readonly`.
  OAuth: Desktop client, loopback + PKCE. Secrets, token and sync cursor live in `~/.tesseract/`, never in data/.
  Sync writes are logged as agent `google-sync`. Setup: docs/GOOGLE_CALENDAR.md.

### 4.14 System map — `projects/<id>/map.yaml` (optional, Phase 6c)
The whole system of a project at a glance (parts and how they connect), next to the linear phase stepper. Drawn and
reshaped by AI through MCP; you see it on the project page and move "you are here".
```yaml
focus: verification               # "you are here": a node id or null
lanes: [foundation, runtime, detection, interface]   # columns, left → right (kebab-case)
nodes:                            # max 60
  - id: dashboard
    label: Read-only dashboard
    lane: interface               # must be one of lanes
    status: null                  # planned | building | done | blocked; null = derive from tasks
    tasks: [t-008, t-010]         # task ids of this project; must exist
    note: ""
edges:
  - { from: incident, to: dashboard, label: findings }   # both ends must be nodes, no self-links
```
- **Honest status:** linked tasks decide: all done → `done`, any not `todo` → `building`, else `planned`.
  An explicit status is kept, except `done` is **refused** (RULE) while linked tasks are open, and ignored if a task is
  reopened later. Part progress = done linked tasks / linked tasks.
- Summary: parts, done, building, blocked, focus label ("Now: …  ·  5/8 parts done").
- **Look:** flow/state diagram: columns centered vertically, glass cards with status color, dotted links, light
  particles flowing along links from active parts, breathing "you are here" ring, ping on building parts.
- **Cheap animation:** static SVG base + an effects layer animated with transform/opacity only (GPU compositor, no repaint).
  Plays in bursts (8 s when the map scrolls into view, and on hover), then pauses: measured ~0.3% CPU at rest vs
  ~40% if it ran constantly. "Motion on/off" per device (default on, independent of the OS animation setting).

### 4.16 Learning visuals — `learning/<id>/visuals/<visual-id>.yaml` (Phase 7a)
Study pictures stored as **data** (never HTML) and drawn by the app; reopened from the topic's **▶ Review** button.
```yaml
id: rr-quantum-2                 # kebab-case; defaults to the title
title: Round Robin, quantum 2
topic: process-scheduling        # optional: topic id in this learning item
type: gantt                      # state | gantt | chart | grid | tree
data: { ... }                    # per type, below
steps:                           # optional walkthrough (≤ 40)
  - text: "P1 runs for one quantum"
    highlight: [b1]              # element ids, checked
step_mode: highlight             # highlight (dim the rest) | build (elements appear when first highlighted)
author: codex                    # agent that saved it (set by core)
created: 2026-11-24
updated: 2026-11-24
```
- **state** — `states [{id, label, output?, initial?, accept?}]` (≤ 30), `transitions [{id, from, to, label}]` (Moore output on the
  state, Mealy `1/0` in the label, self-loops allowed). Layout: columns by distance from the initial state.
- **gantt** — `unit`, `lanes [{id, label}]`, `bars [{id, lane, start, end, label?}]` (≤ 200, end > start),
  `signals [{id, label, changes [[t, 0|1]]}]` (timing diagrams), `markers [{id, at, label}]`.
- **chart** — `kind line|bar|scatter`, `x {label}`, `y {label}`, `series [{id, label, points [[x, y]]}]` (≤ 8, ≤ 500 points;
  negative bars = cash out), `annotations [{id, x, y?, label}]`.
- **grid** — `columns` (≤ 16), `rows [{label?, cells}]` (≤ 32, one cell per column), `groups [{id, cells [[row, col]], label?}]`
  (K-map loops). Cell ids are `r<row>c<col>`.
- **tree** — `orientation down|right`, `root {id, label, note?, gate? and|or, children}` (≤ 80 nodes, depth ≤ 7).
- Validation: unique element ids, every reference resolves (states, lanes, group cells, step ids, topic), size ≤ 64 KB.
- Token-aware MCP: the tool list carries no per-type schema; `visual_formats(type)` returns fields + an example on demand.
- Rendering: hand-written SVG, same look as the maps; steps only toggle opacity/glow (CSS transitions), nothing runs at rest.
- **Round 2 (Phase 7b):** three more types.
  - **plot**: matplotlib/Desmos-style graphs: `function` (expression of x), `parametric`, `scatter` (groups/labels),
    `line`, `step`, `bar`, `histogram`, `area` (fill-between), `errorbar`, `vline`/`hline`, `region`, `arrow`,
    `text`, `heatmap` (z = f(x, y) or a grid, optional banded contours); axes (ranges, log, equal), up to 6 **sliders**
    (`params`) used by expressions; hover readout; legend toggles. Expressions use the safe parser in core
    (`expr.ts`: numbers, variables, + − × ÷ ^, fixed functions, pi, e; no eval, unknown names rejected).
  - **lesson**: `data.blocks` (≤ 40) of `text` (Markdown), `formula` (LaTeX rendered as MathML by Temml, lazy-loaded;
    `\term{id}{…}` parts must match `terms`; links/raw-HTML commands refused), `trace` (vars + steps with `state` —
    step-by-step with the current value of every variable; state carries forward), `plot`, `sim` (`kmeans`,
    `scheduling` FCFS/SJF/SRTF/RR/Priority, `gradient`, `value-iteration`, `q-learning`: engines in core
    `sims.ts`, deterministic/seeded, run in the browser from the inputs, live controls), `visual` (embed another visual
    of the same item), `check` (question + hidden answer, not graded), `html`. No top-level steps.
  - **html**: self-contained HTML/JS in `<iframe sandbox="allow-scripts">` (opaque origin) with a CSP that blocks all
    network, forms and frames; scripts inline only — `<script src="/vendor/…">` for Chart.js, D3 or Plotly basic is inlined by the app (copied from
    node_modules at build). Size caps: lesson 250 KB, html 450 KB, others 64 KB.
  - AI guidance: lessons for formulas/calculations/algorithms; plot for any graph; diagrams for structure only; html last.

### 4.15 Learning map — derived, nothing stored (Phase 6d)
Each roadmap/course is shown with the same diagram as §4.14, built from its topics (§4.5):
- Columns = `phases` that have topics (roadmap order). Cards = topics. Links = `depends_on` (prerequisite → topic).
- Color = honest effective topic status: not-started → planned, learning → building, understood → done,
  needs-review (stale/weak/manual) → amber "Needs review". Never shown as done while it needs review.
- "You are here" = first topic being learned, else first needing review, else first not-started topic whose
  prerequisites are understood. Summary: "x/y understood", "n to review".
- AI reshapes it with the topic tools (`add_topic`, `update_topic` phase / depends_on). API: `GET /api/learning/:id/map`.

## 5. MCP Tools (v1)

All AI clients get full read/write; every write is logged with the agent name.

| Area | Tools |
|---|---|
| Overview | `get_overview` (compact summary of everything), `search` |
| Goals | `list_goals`, `upsert_goal` |
| Projects | `list_projects`, `get_project`, `create_project`, `update_project` |
| Tasks | `add_task`, `update_task`, `delete_task` |
| Learning | `list_learning`, `get_learning`, `create_roadmap` (with phases + topics + skills), `create_course`, `update_learning`, `add_topic`, `update_topic` |
| Skills | `get_skill_profile`, `adjust_skill_level` (enforces ±15 + evidence rule) |
| Assessments | `list_inbox`, `read_inbox`, `record_assessment`, `list_assessments`, `generate_quiz_context` |
| Quizzes | `create_quiz` (multiple choice, taken in the web app), `list_quizzes` |
| Review | `get_review_queue` |
| Notes | `list_notes`, `create_note`, `update_note`, `get_note` |
| History | `get_activity`, `undo_change` |
| System map | `get_project_map`, `set_project_map` (whole map), `update_map_node` (patch or add one part), `set_map_focus` |
| Schedule | `get_schedule` (default 7 days), `add_event`, `update_event`, `delete_event`, `sync_calendar` |
| Visuals | `visual_formats` (format + example per type), `save_visual` (create/replace), `get_visuals` (list or one), `delete_visual` |

**Remote profile** (`--profile remote`, Phase 8a): only these tools are registered for cloud chat through the tunnel.
Reads: get_overview, search, list_goals, list_projects, get_project, get_project_map, list_learning, get_learning,
get_review_queue, get_skill_profile, list_assessments, list_notes, get_note, list_quizzes, get_schedule, get_visuals,
visual_formats, generate_quiz_context, get_activity. Undoable writes: add_task, update_task, add_topic, update_topic, add_event,
update_event, create_note, create_quiz, save_visual, set_map_focus. Never: deletes, undo, map redraws, project/learning
create/update, skill adjustments, assessments, inbox, calendar sync. Agent name `remote-chatgpt`.

List/get tools return compact summaries by default; `detail: true` for full data.

## 6. UI

- **English only, minimal text, clean.**
- **Theme: "System window"** — holographic HUD panels (glowing frame, corner brackets), grid background, Rajdhani display font (self-hosted, OFL) for headings, Today as a notification window. Original design; no characters, logos or assets from any existing work.
- **Light / Dark / System** toggle (sidebar; More page on mobile), saved per device, applied before first paint. Tokens in `apps/web/src/index.css` (`:root` / `.dark`).
- **Home (preview), top → bottom:**
  1. **Today** — today's classes/events, due/overdue tasks + review queue
  2. **Projects** — cards: phase + %
  3. **Learning** — cards: roadmap/course % + upcoming exams
  4. **Skills** — mini radar
  5. **Goals** — progress bars
- **Full views:** Project (Kanban / checklist, phase stepper, system map, timeline, notes) · Learning (roadmap path by phase, topic status, course assignments/exams) · Skills (2-level radar, level history, AI adjustments with reasons) · Quizzes · Notes (Markdown, resolved `[[wikilinks]]`, backlinks; raw HTML never rendered) · Activity (last 20 changes, undo) · Visual (one study visual, step player: ◀ ▶, keys ← →, autoplay; topic rows show ▶ Review, learning pages list visuals) · **Settings** (`/settings`, ⚙ in every nav): **Layout** (UI theme, `data-ui`: Solo Leveling System = HUD sidebar (default), Minimal = top bar + hairlines, Bento = icon rail + rounded tiles + progress rings + hero clock, Notebook = paper index cards + bookmark tabs, Terminal = monospace panes + tmux status bar), **Colours** (`data-palette`: System Blue, Aurora, Crimson, Sepia, Neutral, Amber CRT; any with any layout), light/dark/system, one **Transparency** slider (0–80%, per device, “auto” = theme default) for the cards and, in the Windows desktop app, the window itself at half strength (80% → window 60%, never below 50%) via a layered window (`scripts/window-opacity.ps1`, saved in `~/.tesseract/window.json`, applied by the launcher; `PUT /api/window` is this-machine-only) · Guide (how AI works with the data as boxes: flow diagram, per-feature input → tool → file → screen, live token cost measured by running the MCP server in memory on read-only tools, ≈ chars ÷ 4).
- **Additional Layouts:** Linear (compact grouped navigation on the left), Notion (workspace sidebar and breadcrumb with a narrow content column), and Warm Editorial (centred masthead and horizontal desktop index). The five original layouts remain available. The three new choices apply a matching Indigo, Paper, or Terracotta palette on selection; Colours overrides it without changing layout. Phones keep the accessible bottom navigation. These are independently implemented adaptations of the OpenDesign references in docs/DESIGN_LAYOUTS.md.
- **Pairing appearance:** the desktop QR snapshots this browser’s current layout and colour in its URL fragment. A paired device applies recognized values only after successful token pairing; rescanning copies a new snapshot. There is no continuous sync of UI preferences and manual-token pairing does not overwrite appearance.
- **Schedule:** Day / Week (agenda columns, color by kind), add/edit events, Google Calendar panel (connect, sync now, what to push).
- **Mobile nav:** Home, Schedule, Projects, Learning, More (Skills, Quizzes, Notes, Activity, Guide).
- **Web quiz:** take an AI-written quiz in the UI → graded on the server → recorded as a `web-quiz` assessment (§4.12).
- **Charts:** single-series radar, `#1f6fe5` light / `#1592de` dark + cyan glow (each validated on its surface), 2px line, hover tooltip, list beside it as the table view.

## 7. Access: desktop + mobile

- Web app built as a **PWA**: manifest, icons, service worker that caches the app shell only (never `/api` data).
- `npm start`: listens on 127.0.0.1 only. `npm run lan`: also listens on the PC's network addresses (Wi‑Fi, Tailscale).
- **Trust model:** only this machine (loopback address *and* loopback Host) is trusted without login. Every other
  device, and any local proxy forwarding a different Host (e.g. `tailscale serve`), must **pair once** with an access
  token → httpOnly, SameSite=Strict cookie (or `Authorization: Bearer`). Token lives in `~/.tesseract/token`,
  rotate with `--reset-token`.
- **Phone & tablet switch** (Settings, desktop app only): saves `lan` in `~/.tesseract/desktop.json`, the running server applies it in place (rebuilds its host list and token, re-listens on 0.0.0.0 or 127.0.0.1; no restart, Remote access stays on; the launcher passes `--lan` at the next start), and Settings shows a pairing **QR** (`http://ip:port/#pair=<token>`; the fragment never reaches the server; the token is only returned to this PC). Home Wi‑Fi (plain http, home network only) or **Tailscale** (encrypted, anywhere; HTTPS via `tailscale serve` for full install). See docs/MOBILE.md.
- **Desktop app (Windows, Phase 6a):** `scripts/launch.ps1` starts the server if needed (pre-built esbuild bundle,
  `--max-old-space-size=48 --max-semi-space-size=1`, BelowNormal priority, hidden) and opens `msedge --app=…`.
  `--idle-exit 15`: the server exits 15 min after the last request; open windows ping `/api/session` every 4 min.
  `scripts/desktop.ps1` adds Start menu + Startup shortcuts (`conhost --headless`, no console flash).
- **Remote access (Phase 8a):** OpenAI Secure MCP Tunnel. The server runs `~/.tesseract/bin/tunnel-client` (outbound
  only, no public URL) which starts the MCP server with `--profile remote --agent remote-chatgpt`. Off by default; on for
  1 / 8 / 24 h from this PC only (`POST /api/remote/start|stop`, local-only); stops at expiry and with the server;
  `--idle-exit` is suspended while on. Key in `~/.tesseract/openai-tunnel-key` (Tunnels: Read + Use), passed only in
  the child's env, never logged or returned. Setup: docs/REMOTE_ACCESS.md.
  Measured (private memory): ~120 MB before → ~60 MB API only, ~70–95 MB with the app open (Phase 6 features included). Tauri/Electron rejected: no memory gain (same WebView2 + Node) or more (Chromium).

## 8. Tech stack

- TypeScript monorepo (npm workspaces; Node 24 runs `.ts` directly, tsc is type-check only)
- `core`: Zod schemas, gray-matter (frontmatter), yaml, simple-git
- `mcp`: official MCP TypeScript SDK, stdio transport
- `server`: Hono on 127.0.0.1:4320 (Host-header check, same-origin JSON-only writes)
- `web`: Vite 8 + React 19 + Tailwind 4 + TanStack Query + lucide icons (no shadcn: small hand-written UI kit). Recharts (radar) and PWA plugin come in Phases 4–5
- Tests: Vitest 5 (required for `core`)

## 9. Build phases

| # | Phase | Done when |
|---|---|---|
| 0 | Setup: git init, monorepo, AGENTS.md, sample data | `npm test` runs ✅ |
| 1 | Core: schemas, read/write, progress, levels, review rules, activity log | Tests pass on sample data ✅ |
| 2 | MCP server + config for Claude Code / Claude Desktop | "Create a Kubernetes roadmap…" works end to end ✅ |
| 3 | Server + Web: Home + Projects | Cards and Kanban show real data ✅ |
| 4 | Learning + Skills radar + Assessments + web quiz | Radar updates after an assessment ✅ |
| 5 | Notes, Activity/undo, PWA + mobile access | Opens on phone ✅ (pairing flow tested; real phone not yet) |
| 6a | Desktop launcher: own window, open at sign-in, low resources | Opens at sign-in, ~60–95 MB (was ~120), exits when closed ✅ (sign-in reboot not yet tested) |
| 6b | Schedule + two-way Google Calendar sync (§4.13) | Event made in app shows in Google/Notion Calendar and edits come back ✅ (mocked Google; live account not yet) |
| 6c | System Map: AI-editable project diagram with "you are here" (§4.14) | AI draws a map via MCP; it shows on the project page ✅ |
| 8a | ChatGPT web/phone via OpenAI Secure MCP Tunnel, remote least-privilege profile (§5, §7) | ChatGPT (Plus) answers from real data through the tunnel ✅ (2026-11-25; remote write + phone not yet tested) |
| 7b | Learning visuals round 2: lesson pages (formula, step-by-step state, plot, simulations, self-check), plot engine, sandboxed HTML (§4.16) | AI saves a lesson; Review opens it with real math, live graphs and sims ✅ |
| 7a | Learning visuals round 1: state, gantt, chart, grid, tree + steps (§4.16) | AI saves a visual via MCP; ▶ Review opens it ✅ |
| 6e | Guide page with live token cost (§6) | Numbers match a real MCP client ✅ |
| 6d | Learning map: roadmaps/courses drawn the same way from topics (§4.15) | Shows on every learning page with topics ✅ |

## 10. Open questions

- Codex / Antigravity MCP config — verify per client during Phase 2.
- Recency half-life (90 days) and difficulty factors — tune after real use.

## 11. Tesseract foundation and Classroom draft contract

This fork keeps existing Projects, Goals, Learning, Skills, Notes, Quizzes, Activity, Calendar, themes, Windows launcher, phone pairing, local MCP and legacy remote MCP. New installations have no sample courses; fixtures are private to tests. Host settings, tokens and service credentials are isolated under `~/.tesseract/`; the fork never automatically reads or moves upstream credentials.

### Classroom data (v1)

Classrooms are separate from the existing Markdown/YAML workspace tools. A course bundle uses schema_version 1, stable course/lesson/question IDs, source links and rights status, Markdown or typed visuals, optional manual labs, and multiple-choice or explanation questions. Raw HTML, executable lesson content, imported scripts, cross-workspace embeds and remote asset loading are not part of this contract. The app does not run lab commands, verify factual claims, or auto-score an explanation.

Core alone writes the local `data/.classroom/classroom.sqlite`. Revisions are immutable; published pointer changes, the history and an audit journal are transactional. Attempts reference the exact revision/question and do not inherit scores from another version. This independent SQLite store does not alter legacy files or the legacy activity log. Neither SQLite nor personal workspace data goes in Git. In this foundation, publish/restore/revision-bound attempts are exercised in private core tests only. There is no new HTTP or user-facing Classroom route. Later, paired devices must use the shared host HTTP server, never direct DB file sharing; draft administration must stay on host loopback.

### Isolated MCP profile

`npm run mcp -- --profile classroom --data <isolated-data-directory>` exposes only `classroom_format`, `submit_course_draft`, `get_draft_receipt`, and `get_draft_status`. Validation is before writes, input is capped at 256 KiB, a retry of the same request returns the original receipt, and conflicting IDs/stale revisions fail explicitly. Submission never publishes. A client that requests MCP progress sees `running` when the submission handler starts. The read-only status looks up the same request ID and returns a durable `staged` receipt or `unknown` (no durable receipt; not proof that a request never ran, and not permission to replay). Queries do not repeat the write. The existing remote mode remains available for legacy workspace features but has no write path into Classroom. No production tunnel is configured by this work. The classroom profile is for isolated test data; it is not routed by the normal app or legacy tunnel. User-facing classroom implementation and real classroom creation are later steps, separate from foundation verification.

### Performance verification

Build the pinned upstream and fork with the same toolchain. Sum the JS and CSS reachable from the production Vite entry using only static imports; do not count lazy pages as first-load JS. Run `node scripts/perf-web.ts <upstream-dist> <fork-dist>` in app/. Run `node apps/mcp/src/benchmark.ts` for in-process MCP latencies: list tools, stage a synthetic draft, and read a receipt. These numbers exclude tunnel/network, rendering time, RAM and browser caches; do not present them as such. Measure desktop UI and live tunnel separately before making end-to-end claims.
