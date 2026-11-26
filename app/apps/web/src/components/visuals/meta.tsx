/** Type names and icons for visuals, shared by the list, the topic rows and the visual page. */
import { BookOpenText, ChartGantt, ChartLine, ChartSpline, Code, Grid3x3, ListTree, Workflow } from "lucide-react";
import type { VisualSummary } from "../../lib/api.ts";

export const VISUAL_META: Record<VisualSummary["type"], { label: string; icon: typeof Workflow }> = {
  state: { label: "State machine", icon: Workflow },
  gantt: { label: "Timeline", icon: ChartGantt },
  chart: { label: "Chart", icon: ChartLine },
  grid: { label: "Grid", icon: Grid3x3 },
  tree: { label: "Tree", icon: ListTree },
  plot: { label: "Plot", icon: ChartSpline },
  lesson: { label: "Lesson", icon: BookOpenText },
  html: { label: "HTML", icon: Code },
  scene: { label: "Interactive scene", icon: Workflow },
};
