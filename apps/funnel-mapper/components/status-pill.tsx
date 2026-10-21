import { STATUS_LABEL } from "@/lib/schemas";

/** Status colours (V2): live and active are green, proposed blue, paused amber, everything finished or empty is grey. */
const DOT: Record<string, string> = {
  live: "#22c55e",
  active: "#22c55e",
  proposed: "#60a5fa",
  proposal: "#60a5fa",
  draft: "#94a3b8",
  lead: "#94a3b8",
  paused: "#fbbf24",
  past: "#64748b",
  archived: "#64748b",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span className="stp" data-status={status}>
      <i style={{ background: DOT[status] ?? "#94a3b8" }} aria-hidden="true" />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
