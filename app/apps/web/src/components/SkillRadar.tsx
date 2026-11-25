import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";

export interface RadarPoint {
  id: string;
  title: string;
  level: number;
}

/** Short axis labels for the default domains; others use their first word(s). */
const SHORT: Record<string, string> = {
  web: "Web",
  "cloud-devops": "Cloud",
  "ai-data": "AI & Data",
  programming: "Programming",
};

/** Compact radar: one short word per axis. */
export function shortLabel(p: RadarPoint, max = 12): string {
  const s = SHORT[p.id] ?? p.title.replace(/\s*\(.*\)$/, "").split(/\s+&\s+/)[0]!;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Full radar: the whole name (minus parentheses) wrapped onto at most two lines. */
export function wrapLabel(title: string, width = 16): string[] {
  const words = title.replace(/\s*\(.*\)$/, "").split(/\s+/);
  const lines: string[] = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last !== undefined && `${last} ${w}`.length <= width) lines[lines.length - 1] = `${last} ${w}`;
    else lines.push(w);
  }
  if (lines.length > 2) lines.splice(1, lines.length - 1, `${lines.slice(1).join(" ").slice(0, width - 1)}…`);
  return lines;
}

/**
 * Single-series radar, 0–100. One accent color (no legend needed — the card title names it),
 * 2px stroke, light fill, recessive grid, hover tooltip per vertex.
 */
export function SkillRadar({
  data,
  height = 320,
  compact = false,
  onSelect,
}: {
  data: RadarPoint[];
  height?: number;
  compact?: boolean;
  onSelect?: (id: string) => void;
}) {
  const rows = data.map((d) => ({ ...d, label: compact ? shortLabel(d) : d.title }));
  return (
    <div style={{ height }} role="img" aria-label={`Radar: ${data.map((d) => `${d.title} ${d.level}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={rows} outerRadius={compact ? "68%" : "72%"} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
          <PolarGrid stroke="var(--chart-grid)" />
          <PolarRadiusAxis domain={[0, 100]} tickCount={5} tick={false} axisLine={false} />
          <PolarAngleAxis
            dataKey="label"
            tick={(tickProps) => {
              const props = tickProps as unknown as {
                x: number;
                y: number;
                textAnchor?: "start" | "middle" | "end";
                payload: { value: string; index: number };
              };
              const row = rows[props.payload.index];
              const lines = compact ? [props.payload.value] : wrapLabel(props.payload.value);
              const lineHeight = 14;
              return (
                <text
                  x={props.x}
                  y={props.y - ((lines.length - 1) * lineHeight) / 2}
                  textAnchor={props.textAnchor ?? "middle"}
                  dominantBaseline="central"
                  fill="var(--chart-text)"
                  fontSize={compact ? 10 : 12}
                  style={{ cursor: onSelect ? "pointer" : undefined }}
                  onClick={() => row && onSelect?.(row.id)}
                >
                  {lines.map((line, i) => (
                    <tspan key={i} x={props.x} dy={i === 0 ? 0 : lineHeight}>
                      {line}
                    </tspan>
                  ))}
                </text>
              );
            }}
          />
          <Radar
            dataKey="level"
            stroke="var(--chart-accent)"
            strokeWidth={2}
            fill="var(--chart-accent)"
            fillOpacity={0.15}
            dot={{ r: compact ? 3 : 4, fill: "var(--chart-accent)", strokeWidth: 0 }}
            activeDot={{ r: 6, stroke: "var(--chart-accent)", strokeWidth: 2, fill: "white" }}
            isAnimationActive={false}
            style={{ filter: "var(--chart-glow)" }}
          />
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as RadarPoint | undefined) : undefined;
              if (!p) return null;
              return (
                <div className="panel-solid rounded-md px-3 py-2 text-xs">
                  <p className="font-medium text-slate-900 dark:text-white">{p.title}</p>
                  <p className="text-slate-500">
                    Level <span className="font-semibold text-slate-900 tabular-nums dark:text-white">{p.level}</span> / 100
                  </p>
                </div>
              );
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
