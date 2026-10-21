import { FunnelPreview } from "./funnel-preview";

/**
 * Funnel thumbnail: the live preview drawn from the funnel's saved canvas (components/funnel-preview.tsx). Kept under
 * this name so every card, table row and tile uses the one renderer.
 */
export function GraphThumb({ graph, settings, name, className = "", width = 320, height = 150, pad = 8, archived = false }: { graph: unknown; settings?: unknown; name?: string; className?: string; width?: number; height?: number; pad?: number; archived?: boolean }) {
  return <FunnelPreview graph={graph} settings={settings} name={name} width={width} height={height} pad={pad} archived={archived} className={className} />;
}
