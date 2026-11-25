/**
 * Guide (SPEC §6): how the app works with AI, shown as boxes.
 * 1. How it works: the same animated diagram as the maps (you → AI → tools → core → files → app).
 * 2. Feature by feature: you say → AI calls → saved as → you see.
 * 3. Token cost: measured live on the user's data by the real MCP server (GET /api/guide/tokens).
 */
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowRight, Coins, FileText, MessageSquare, Monitor, Wrench } from "lucide-react";
import { useState } from "react";
import { Diagram, type DiagramMap, useMotion } from "../components/SystemMap.tsx";
import { Card, ErrorNote, Loading, PageHeader, SectionTitle, Segmented } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { cn } from "../lib/format.ts";

/* ---------------- 1. How it works ---------------- */

const PARTS: Record<string, { what: string; input: string; output: string }> = {
  you: { what: "You ask in plain words, in any AI app connected to Tesseract.", input: "Your message", output: "A request to the AI" },
  ai: {
    what: "Codex, Claude or ChatGPT (Work mode). It reads the tool list once per session, then picks the tool that fits.",
    input: "Your message + the tool list",
    output: "A tool call with fields (JSON)",
  },
  tools: {
    what: "The MCP server: one tool per action (get_overview, add_task, set_project_map…). Each tool says which fields it needs.",
    input: "Tool name + fields",
    output: "A short summary back to the AI",
  },
  core: {
    what: "The only code that writes data. It checks every field and the honesty rules, then saves. Bad input is refused with a clear error the AI can fix.",
    input: "Checked fields",
    output: "Saved files + an Activity entry",
  },
  files: { what: "Your data as plain Markdown + YAML in the data/ folder. Readable without this app.", input: "Validated data", output: "Files on your disk" },
  log: { what: "Every change: who (which AI or you), what, when. The last 20 can be undone.", input: "Each change", output: "Activity page, undo" },
  app: { what: "This app reads the same files through core, so AI changes show up here right away. Your edits here go through core too.", input: "Files", output: "Pages, maps, charts" },
};

function flowMap(tools: number | null): DiagramMap {
  const n = (id: string, label: string, lane: string, sub: string) => ({ id, label, lane, sub, effective_status: "info" as const, progress: null });
  return {
    lanes: ["you", "ai", "core", "result"],
    focus: null,
    nodes: [
      n("you", "You", "you", "ask in plain words"),
      n("ai", "AI client", "ai", "Codex · Claude · ChatGPT"),
      n("tools", "MCP tools", "ai", tools ? `${tools} tools` : "tools"),
      n("core", "Core", "core", "check → save → log"),
      n("files", "data/ files", "result", "Markdown + YAML"),
      n("log", "Activity log", "result", "who · what · undo"),
      n("app", "This app", "result", "pages · maps · charts"),
    ],
    edges: [
      { from: "you", to: "ai", label: "asks" },
      { from: "ai", to: "tools", label: "calls" },
      { from: "tools", to: "core", label: "fields" },
      { from: "core", to: "files", label: "saves" },
      { from: "core", to: "log", label: "logs" },
      { from: "files", to: "app", label: "shows" },
    ],
  };
}

/* ---------------- 2. Feature by feature ---------------- */

type Feature = { say: string; tools: string[]; file: string; example: string; see: string; rule: string };

const FEATURES: Record<string, Feature> = {
  tasks: {
    say: "“Add a task to weather-app: design the dashboard, due Dec 1”",
    tools: ["add_task", "update_task", "get_project"],
    file: "projects/<id>/tasks.yaml",
    example: "- id: t-013\n  title: Design the dashboard\n  status: todo   # todo|doing|review|done\n  due: 2026-12-01",
    see: "Kanban card, project progress",
    rule: "Progress = done tasks ÷ all tasks. Never typed by hand.",
  },
  "project map": {
    say: "“Draw the system map for this project, link parts to tasks, focus on what I'm doing”",
    tools: ["set_project_map", "update_map_node", "set_map_focus", "get_project_map"],
    file: "projects/<id>/map.yaml",
    example:
      "focus: forecast           # You are here\nlanes: [input, core, output]\nnodes:\n  - id: forecast\n    label: Forecast API\n    lane: core\n    tasks: [t-003]     # status from tasks\nedges:\n  - { from: collector, to: detection }",
    see: "Animated system map on the project page",
    rule: "A part can't be Done while its tasks are open. Particles flow from active parts.",
  },
  "learning map": {
    say: "“Link the topics of my OS course in learning order”",
    tools: ["update_topic", "add_topic", "create_roadmap", "create_course"],
    file: "learning/<id>/topics.yaml",
    example: "- id: moore-fsm\n  title: Moore State Machines\n  phase: fsm              # column\n  depends_on: [state-tables]  # arrow\n  status: learning",
    see: "Learning map: phases = columns, depends_on = arrows",
    rule: "Stale (>14 days) or weak (<60%) topics show amber, never green.",
  },
  skills: {
    say: "“Quiz me on virtual memory” · “Record my lab result”",
    tools: ["generate_quiz_context", "create_quiz", "record_assessment", "adjust_skill_level"],
    file: "quizzes/*.yaml · assessments/*.md",
    example: "score: 72\nskills: [os-internals]\nevidence: lab report link",
    see: "Quiz page, Skills radar",
    rule: "Levels come from assessments. AI may only nudge a little, with a reason.",
  },
  notes: {
    say: "“Save a note about React hooks, link it to my web roadmap”",
    tools: ["create_note", "update_note", "upsert_goal"],
    file: "notes/<id>.md · goals/<id>.md",
    example: "---\ntitle: React hooks\nlinks: [learning/web-development]\n---\nNotes in Markdown…",
    see: "Notes page, goal progress",
    rule: "Goal progress comes from its linked projects and learning.",
  },
  visuals: {
    say: "“Make a lesson for K-means: the formula, a worked example step by step, and a simulation I can play with”",
    tools: ["visual_formats", "save_visual", "get_visuals"],
    file: "learning/<id>/visuals/<visual>.yaml",
    example:
      "type: gantt        # state|gantt|chart|grid|tree\ntopic: process-scheduling\ndata:\n  lanes: [{ id: p1, label: P1 }]\n  bars: [{ id: b1, lane: p1, start: 0, end: 2 }]\nsteps:\n  - text: P1 runs for one quantum\n    highlight: [b1]",
    see: "▶ Review → a lesson page: real math, step-by-step state, live graphs and simulations",
    rule: "Lesson blocks: text, formula, trace, plot, sim, check, visual, html (sandboxed). Data, not HTML: far fewer tokens; sims are computed by the app, so results are always correct.",
  },
  chatgpt: {
    say: "In ChatGPT on the phone: “What should I review today?”",
    tools: ["get_review_queue", "get_overview", "update_topic"],
    file: "same data, via the tunnel",
    example: "Sidebar → Remote access → On for 8 h\n# ChatGPT reaches this PC through OpenAI's\n# outbound-only tunnel; read-mostly tool set",
    see: "Answers in ChatGPT; changes in Activity as remote-chatgpt",
    rule: "Off by default, stops by itself. No deletes, undo or skill changes remotely. Setup: docs/REMOTE_ACCESS.md.",
  },
  schedule: {
    say: "“Block 2 hours on Friday afternoon for MT2 networking”",
    tools: ["add_event", "update_event", "get_schedule"],
    file: "schedule/events.yaml",
    example: "- id: ev-2026-11-27-mt2\n  title: MT2 networking\n  date: 2026-11-27\n  start: \"14:00\"\n  end: \"16:00\"",
    see: "Schedule (day / week)",
    rule: "Times are HH:MM 24h. Google sync is optional.",
  },
};

function Box({ icon: Icon, title, children, className }: { icon: typeof Wrench; title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--lane)] p-3", className)}>
      <p className="mb-1.5 flex items-center gap-1.5 font-display text-[11px] font-semibold tracking-[0.15em] text-slate-500 uppercase">
        <Icon size={13} className="text-accent-600 dark:text-sky-300" /> {title}
      </p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex shrink-0 items-center justify-center text-slate-400">
      <ArrowRight size={18} className="hidden lg:block" />
      <ArrowDown size={18} className="lg:hidden" />
    </div>
  );
}

/* ---------------- page ---------------- */

export function Guide() {
  const tokens = useQuery({ queryKey: ["guide-tokens"], queryFn: api.guideTokens, staleTime: 60_000 });
  const [motion] = useMotion();
  const [part, setPart] = useState<string | null>("core");
  const [feature, setFeature] = useState<keyof typeof FEATURES>("project map");
  const f = FEATURES[feature]!;
  const p = part ? PARTS[part] : null;

  return (
    <>
      <PageHeader title="Guide" subtitle="How AI works with your data: what goes in, what comes out, and what it costs." />

      {/* 1 */}
      <Card className="mb-6">
        <SectionTitle>How it works</SectionTitle>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">AI never edits your files directly. Click a box to see its input and output.</p>
        <div className="map-stage overflow-x-auto rounded-lg">
          <Diagram map={flowMap(tokens.data?.session.tools ?? null)} motion={motion} selected={part} onSelect={(id) => setPart(id === part ? null : id)} />
        </div>
        {p && (
          <div className="mt-4 flex flex-col gap-2 lg:flex-row">
            <Box icon={ArrowRight} title="Input">{p.input}</Box>
            <Box icon={Wrench} title="What it does" className="lg:flex-[2]">{p.what}</Box>
            <Box icon={ArrowRight} title="Output">{p.output}</Box>
          </div>
        )}
      </Card>

      {/* 2 */}
      <Card className="mb-6">
        <SectionTitle>Feature by feature</SectionTitle>
        <div className="mb-4 overflow-x-auto">
          <Segmented options={Object.keys(FEATURES).map((k) => ({ id: k, label: k[0]!.toUpperCase() + k.slice(1) }))} value={feature} onChange={(v) => setFeature(v)} />
        </div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
          <Box icon={MessageSquare} title="You say">{f.say}</Box>
          <Arrow />
          <Box icon={Wrench} title="AI calls">
            <div className="flex flex-wrap gap-1">
              {f.tools.map((t) => (
                <code key={t} className="rounded bg-[var(--panel-solid)] px-1.5 py-0.5 text-xs text-accent-700 ring-1 ring-[var(--line)] dark:text-sky-300">
                  {t}
                </code>
              ))}
            </div>
          </Box>
          <Arrow />
          <Box icon={FileText} title="Saved as" className="lg:flex-[1.6]">
            <p className="mb-1 font-mono text-xs text-slate-500">data/{f.file}</p>
            <pre className="overflow-x-auto rounded bg-[var(--panel-solid)] p-2 text-[11px] leading-relaxed ring-1 ring-[var(--line)]">{f.example}</pre>
          </Box>
          <Arrow />
          <Box icon={Monitor} title="You see">{f.see}</Box>
        </div>
        <p className="mt-3 text-xs text-slate-500">Rule: {f.rule}</p>
      </Card>

      {/* 3 */}
      <Card className="mb-6">
        <SectionTitle>Token cost</SectionTitle>
        {tokens.error ? <ErrorNote error={tokens.error} /> : !tokens.data ? <Loading /> : <TokenCost r={tokens.data} />}
      </Card>
    </>
  );
}

function TokenCost({ r }: { r: NonNullable<Awaited<ReturnType<typeof api.guideTokens>>> }) {
  const session = r.session.tool_list + r.session.instructions;
  const overview = r.calls.find((c) => c.tool === "get_overview")?.tokens ?? 0;
  const max = Math.max(...r.calls.map((c) => c.tokens), 1);
  const fmt = (n: number) => n.toLocaleString("en-US");

  return (
    <div className="space-y-6 text-sm">
      <p className="flex items-start gap-2 text-slate-500 dark:text-slate-400">
        <Coins size={15} className="mt-0.5 shrink-0 text-accent-600 dark:text-sky-300" />
        Measured just now on your data by running the real MCP server. Tokens ≈ characters ÷ {r.chars_per_token} (exact counts vary a little by model).
      </p>

      {/* the formula as boxes */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
        <Box icon={Wrench} title="Once per session">
          <p className="font-display text-xl font-bold tabular-nums">~{fmt(session)}</p>
          <p className="text-xs text-slate-500">
            tool list ({r.session.tools} tools) {fmt(r.session.tool_list)} + instructions {fmt(r.session.instructions)}
          </p>
        </Box>
        <div className="flex items-center justify-center font-display text-xl text-slate-400">+</div>
        <Box icon={MessageSquare} title="Each tool call">
          <p className="font-display text-xl font-bold tabular-nums">~{fmt(overview)}</p>
          <p className="text-xs text-slate-500">e.g. get_overview: everything at a glance</p>
        </Box>
        <div className="flex items-center justify-center font-display text-xl text-slate-400">=</div>
        <Box icon={Coins} title="First question" className="border-accent-300 dark:border-sky-500/40">
          <p className="font-display text-xl font-bold tabular-nums">~{fmt(session + overview)}</p>
          <p className="text-xs text-slate-500">+ your message and the AI's reply</p>
        </Box>
      </div>

      {/* per call */}
      <div>
        <p className="mb-2 font-display text-[11px] font-semibold tracking-[0.15em] text-slate-500 uppercase">Tool answers on your data</p>
        <ul className="space-y-1.5">
          {r.calls.map((c) => (
            <li key={c.tool} className="flex items-center gap-3">
              <code className="w-40 shrink-0 truncate text-xs" title={JSON.stringify(c.args)}>
                {c.tool}
              </code>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-400/15">
                <div className="h-full rounded-full bg-gradient-to-r from-accent-500 to-sky-300" style={{ width: `${(c.tokens / max) * 100}%` }} />
              </div>
              <span className="w-14 shrink-0 text-right text-xs text-slate-500 tabular-nums">~{fmt(c.tokens)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {r.compare && (
          <div>
            <p className="mb-2 font-display text-[11px] font-semibold tracking-[0.15em] text-slate-500 uppercase">Why tools are cheaper than files</p>
            <div className="flex items-stretch gap-2">
              <Box icon={FileText} title="Raw files">
                <p className="font-display text-lg font-bold tabular-nums">~{fmt(r.compare.raw_files)}</p>
                <p className="text-xs text-slate-500">{r.compare.project}: project.md + tasks.yaml</p>
              </Box>
              <Arrow />
              <Box icon={Wrench} title="get_project">
                <p className="font-display text-lg font-bold tabular-nums">~{fmt(r.compare.tool_answer)}</p>
                <p className="text-xs text-slate-500">summary + tasks, progress already computed</p>
              </Box>
            </div>
          </div>
        )}
        <div>
          <p className="mb-2 font-display text-[11px] font-semibold tracking-[0.15em] text-slate-500 uppercase">Biggest tool definitions</p>
          <ul className="space-y-1 text-xs">
            {r.session.biggest.map((b) => (
              <li key={b.name} className="flex justify-between">
                <code>{b.name}</code>
                <span className="text-slate-500 tabular-nums">~{fmt(b.tokens)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500 dark:text-slate-400">
        <li>Start with “Using tesseract tools, …”. One get_overview answers most questions.</li>
        <li>Stay in one chat for related work: the tool list is paid once per session, not per question.</li>
        <li>Ask for a specific project or course instead of “show me everything”.</li>
      </ul>
    </div>
  );
}
