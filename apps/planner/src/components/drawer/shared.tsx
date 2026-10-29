// Small helpers shared by the goal drawer tabs.
import { useCallback, useState, type ReactNode } from 'react';
import type { ActionStatus, GoalDetail } from '../../api/types.ts';
import { usePlanner } from '../../state/PlannerContext.tsx';

export interface TabProps {
  d: GoalDetail;
  /** True when the plan is archived: everything is read-only. */
  locked: boolean;
}

export const LOCKED_REASON = 'This plan is archived. Restore it to make changes.';

/** Runs a change through the shared `run` helper; resolves true only when it really succeeded. */
export function useSave() {
  const { run } = usePlanner();
  const [busy, setBusy] = useState(false);
  const save = useCallback(async (fn: () => Promise<unknown>, success?: string): Promise<boolean> => {
    setBusy(true);
    try {
      const r = await run(async () => { await fn(); return true as const; }, { success });
      return r === true;
    } finally { setBusy(false); }
  }, [run]);
  return { busy, save };
}

export function LockedNote({ locked, children }: { locked: boolean; children?: ReactNode }) {
  if (!locked) return null;
  return <p className="gd-note" role="note">{children ?? LOCKED_REASON}</p>;
}

export const SEVERITY_BANDS = [
  { max: 4, label: 'Low', tone: 'neutral' },
  { max: 9, label: 'Medium', tone: 'accent' },
  { max: 14, label: 'High', tone: 'warn' },
  { max: 25, label: 'Critical', tone: 'bad' },
] as const;
export const severityBand = (n: number) => SEVERITY_BANDS.find((b) => n <= b.max) ?? SEVERITY_BANDS[3];

export const LIKELIHOOD = ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'];
export const IMPACT = ['Minor', 'Small', 'Moderate', 'Major', 'Severe'];

export const ACTION_STATUS: { value: ActionStatus; label: string }[] = [
  { value: 'todo', label: 'To do' }, { value: 'doing', label: 'In progress' }, { value: 'on_hold', label: 'On hold' }, { value: 'done', label: 'Done' }, { value: 'wont_do', label: 'Won’t do' },
];
export const RISK_STATUS: { value: 'open' | 'mitigating' | 'closed'; label: string }[] = [
  { value: 'open', label: 'Open' }, { value: 'mitigating', label: 'Mitigating' }, { value: 'closed', label: 'Closed' },
];
export const CONFIDENCE: { value: 'high' | 'medium' | 'low'; label: string }[] = [
  { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' },
];

export const isNum = (s: string) => s.trim() !== '' && Number.isFinite(Number(s));
