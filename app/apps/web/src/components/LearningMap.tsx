/**
 * Learning map (SPEC §4.15): a roadmap or course drawn like the project system map.
 * Nothing is stored — phases are columns, topics are cards, depends_on are links, colors are honest topic status.
 * AI clients reshape it by editing topics (phase, depends_on); "You are here" follows the topic being learned.
 */
import { useQuery } from "@tanstack/react-query";
import { Crosshair, Sparkles } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api.ts";
import { label } from "../lib/format.ts";
import { Diagram, MapLegend, STATUS, type Status, useMotion } from "./SystemMap.tsx";
import { Card, Chip, ErrorNote, ProgressBar, SectionTitle } from "./ui.tsx";

const TEXT: Partial<Record<Status, string>> = { planned: "Not started", building: "Learning", done: "Understood", review: "Needs review" };
const STATUSES: Status[] = ["planned", "building", "review", "done"];
const REASON: Record<string, string> = { stale: "not reviewed for over 14 days", weak: "last score under 60%", manual: "marked for review" };

export function LearningMap({ id }: { id: string }) {
  const { data: map, error } = useQuery({ queryKey: ["learning", id, "map"], queryFn: () => api.learningMap(id) });
  const [selected, setSelected] = useState<string | null>(null);
  const [motion, setMotion] = useMotion();

  if (error) return <ErrorNote error={error} />;
  if (!map || map.nodes.length === 0) return null;

  const { summary } = map;
  const node = map.nodes.find((n) => n.id === selected) ?? null;
  const needs = map.edges.filter((e) => e.to === node?.id).map((e) => map.nodes.find((n) => n.id === e.from)!.label);

  return (
    <Card className="mb-6">
      <SectionTitle action={<MapLegend statuses={STATUSES} text={TEXT} motion={motion} setMotion={setMotion} />}>Learning map</SectionTitle>

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="flex items-center gap-1.5 text-sm">
          <Crosshair size={15} className="text-accent-600 dark:text-sky-300" />
          <span className="text-slate-500">Now:</span>
          <span className="font-semibold">{summary.focus?.label ?? (summary.done === summary.parts ? "All understood" : "—")}</span>
        </p>
        <div className="flex min-w-48 flex-1 items-center gap-2">
          <ProgressBar value={summary.parts ? (summary.done / summary.parts) * 100 : 0} color="green" />
          <span className="shrink-0 text-xs text-slate-500 tabular-nums">
            {summary.done}/{summary.parts} understood
          </span>
        </div>
        {summary.review > 0 && <Chip tone="amber">{summary.review} to review</Chip>}
      </div>

      <div className="map-stage overflow-x-auto rounded-lg">
        <Diagram map={map} motion={motion} text={TEXT} selected={selected} onSelect={(n) => setSelected(n === selected ? null : n)} />
      </div>

      {map.edges.length === 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
          <Sparkles size={13} />
          No links yet. Ask your AI: “Set depends_on for these topics so the learning map shows the order.”
        </p>
      )}

      {node && (
        <div className="mt-4 rounded-lg border border-[var(--line)] p-4 text-sm">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{node.label}</h3>
            <Chip tone={STATUS[node.effective_status].tone}>{TEXT[node.effective_status]}</Chip>
            <span className="text-xs text-slate-400">{label(node.lane)}</span>
          </div>
          <ul className="space-y-1 text-slate-500 dark:text-slate-400">
            <li>Last score: {node.last_score === null ? "—" : `${node.last_score}%`}</li>
            {node.review.length > 0 && <li>Review: {node.review.map((r) => REASON[r] ?? r).join(", ")}</li>}
            {needs.length > 0 && <li>Builds on: {needs.join(", ")}</li>}
          </ul>
        </div>
      )}
    </Card>
  );
}
