# Panya

*Panya* (ปัญญา) is Thai for wisdom.

AI-native, local-first personal workspace: projects, learning, skills, goals and notes in plain Markdown/YAML, shared by you (web UI) and your AI clients (MCP).

- **Spec:** [SPEC.md](SPEC.md) · **Agent rules:** [AGENTS.md](AGENTS.md) · **Connect AI clients:** [docs/MCP_SETUP.md](docs/MCP_SETUP.md) · **ChatGPT web/phone:** [docs/REMOTE_ACCESS.md](docs/REMOTE_ACCESS.md) · **Phone:** [docs/MOBILE.md](docs/MOBILE.md) · **Google Calendar:** [docs/GOOGLE_CALENDAR.md](docs/GOOGLE_CALENDAR.md)

![Panya home page in five layouts and six colour palettes](docs/assets/screenshots/themes.png)

## What it looks like

| | |
|---|---|
| ![Learning roadmap with a learning map and progress](docs/assets/screenshots/learning.png) | ![Project with phases and a task board](docs/assets/screenshots/project.png) |
| **Learning:** roadmaps and courses, a map of topics, what to review next | **Projects:** phases, tasks, a system map your AI draws |
| ![Quiz written by an AI, graded in the app](docs/assets/screenshots/quiz.png) | ![Lesson with typeset formula, step-by-step trace and live k-means simulation](docs/assets/screenshots/lesson.png) |
| **Quizzes:** your AI writes them, the app grades them honestly | **Lessons:** real math, step-by-step state, simulations you can play with |

Screenshots use the sample data that ships with the repo.

## Run

Requires Node 22.18+ and Git.

```powershell
git clone <this repo url> panya
cd panya/app
npm install
npm start          # → http://localhost:4310 (this computer only)
npm run lan        # + phone access with one-time pairing, see docs/MOBILE.md
```

On the first run, `data/` is created from the sample data (`npm run setup` does only that step). Delete the sample
projects and topics when you start adding your own. `data/` is in `.gitignore`: your notes never go into git.

## Your data and privacy

- Everything lives in `data/` on your computer as Markdown + YAML. Back it up like any folder.
- The server listens on this computer only. Phone access (`npm run lan`) needs one-time device pairing.
- Optional extras use your own accounts and keys, kept outside the repo in `~/.panya/`:
  Google Calendar ([docs/GOOGLE_CALENDAR.md](docs/GOOGLE_CALENDAR.md)) and ChatGPT remote access
  ([docs/REMOTE_ACCESS.md](docs/REMOTE_ACCESS.md)). With remote access on, the data ChatGPT reads passes through OpenAI.
- AI clients connect over local MCP: [docs/MCP_SETUP.md](docs/MCP_SETUP.md) (replace the example paths with yours).

## Desktop app (Windows)

Opens in its own window (Edge app mode, no tabs or address bar) and starts with Windows.

```powershell
cd app
npm run desktop:install    # build + Start menu shortcut + open at sign-in
npm run autostart:off      # keep the shortcut, stop opening at sign-in
npm run desktop:uninstall  # remove both shortcuts
```

Light on resources: the server is a pre-built bundle with small memory limits (~60 MB idle, up to ~95 MB in use; was ~120 MB),
runs at low CPU priority, and exits 15 minutes after the last window closes (0 MB).
The shortcut starts it again in about 2 seconds. Logs: `~/.panya/server.log`.
After pulling code changes, run `npm run build:desktop` again.

## Layout

```
app/packages/core   schemas, rules, calculations — the only writer to data/
app/packages/gcal   Google Calendar OAuth + two-way sync (writes only through core)
app/apps/mcp        MCP server for AI clients
app/apps/server     HTTP API (localhost only)
app/apps/web        React web app
data/               your data (Markdown + YAML), not in git
```

## License

[MIT](LICENSE)
