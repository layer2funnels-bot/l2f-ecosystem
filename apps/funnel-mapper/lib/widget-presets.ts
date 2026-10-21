// The six approved widgets (V2 Blocks sidebar, last section). Widgets are NOT funnel blocks: they are one canvas element
// type ("widget", lib/widget-data.ts) that only reads engine results. Each preset is a starting display; scope, metrics
// and size are changed in the panel after placing.
import type { NodeParams } from "./catalog";

export interface WidgetPreset {
  key: string;
  label: string;
  help: string;
  p: NodeParams;
}

export const WIDGET_PRESETS: WidgetPreset[] = [
  { key: "w-number", label: "Number", help: "One headline number for the funnel, a stage or a selection.", p: { scope: "funnel", display: "number", metrics: ["revenue"], wsize: "M" } },
  { key: "w-trend", label: "Number + trend", help: "A number with Actual vs Plan for the period.", p: { scope: "funnel", display: "trend", metrics: ["revenue"], wsize: "M" } },
  { key: "w-chart", label: "Trend chart", help: "The 12-month projection of one figure.", p: { scope: "funnel", display: "chart", metrics: ["revenue"], wsize: "L" } },
  { key: "w-goal", label: "Goal progress", help: "How close the funnel is to its goal.", p: { scope: "funnel", display: "number", metrics: ["goal"], wsize: "M" } },
  { key: "w-mrr", label: "MRR projection", help: "Monthly recurring revenue now, at month 12, and subscribers.", p: { scope: "funnel", display: "chart", metrics: ["mrr"], wsize: "L" } },
  { key: "w-path", label: "Conversion path", help: "Conversion at each step of the main path.", p: { scope: "funnel", display: "path", metrics: ["conversion"], wsize: "M" } },
];
