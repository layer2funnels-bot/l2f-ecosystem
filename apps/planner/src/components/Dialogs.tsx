// One place that owns the shared dialogs. Any screen opens them with useDialogs(); none mounts its own copy.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import type { FocusArea, Goal, Plan, PlanSummary } from '../api/types.ts';
import { GoalFormDialog, type GoalFormMode } from './GoalFormDialog.tsx';
import { PlanFormDialog, type PlanFormMode } from './PlanFormDialog.tsx';
import { FocusAreaDialog, type FocusFormMode } from './FocusAreaDialog.tsx';
import { TurnIntoWorkDialog, type WorkMode } from './TurnIntoWorkDialog.tsx';
import { ConfirmDialog } from '../ui/overlay.tsx';

export interface ConfirmOptions { title: string; body: ReactNode; confirmLabel?: string; danger?: boolean }
export interface Dialogs {
  newGoal(opts?: { parentId?: string | null; focusAreaId?: string | null; typeId?: string | null }): void;
  editGoal(goal: Goal): void;
  newPlan(opts?: { strategyId?: string }): void;
  editPlan(plan: Plan | PlanSummary): void;
  newFocus(): void;
  turnIntoWork(opts?: WorkMode): void;
  editFocus(area: FocusArea): void;
  /** Resolves true when the person confirms. */
  confirm(opts: ConfirmOptions): Promise<boolean>;
}
const Ctx = createContext<Dialogs | null>(null);
export const useDialogs = (): Dialogs => { const c = useContext(Ctx); if (!c) throw new Error('useDialogs outside DialogsProvider'); return c; };

export function DialogsProvider({ children }: { children: ReactNode }) {
  const [goalMode, setGoalMode] = useState<GoalFormMode | null>(null);
  const [planMode, setPlanMode] = useState<PlanFormMode | null>(null);
  const [focusMode, setFocusMode] = useState<FocusFormMode | null>(null);
  const [workMode, setWorkMode] = useState<WorkMode | null>(null);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const pending = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => { pending.current = resolve; setConfirmState({ ...opts, resolve }); }), []);
  const settle = (v: boolean) => { pending.current?.(v); pending.current = null; setConfirmState(null); };

  const api: Dialogs = {
    newGoal: (opts = {}) => setGoalMode({ kind: 'create', ...opts }),
    editGoal: (goal) => setGoalMode({ kind: 'edit', goal }),
    newPlan: (opts = {}) => setPlanMode({ kind: 'create', ...opts }),
    editPlan: (plan) => setPlanMode({ kind: 'edit', plan }),
    newFocus: () => setFocusMode({ kind: 'create' }),
    turnIntoWork: (opts = {}) => setWorkMode(opts),
    editFocus: (area) => setFocusMode({ kind: 'edit', area }),
    confirm,
  };
  return (
    <Ctx.Provider value={api}>
      {children}
      <GoalFormDialog mode={goalMode} onClose={() => setGoalMode(null)} />
      <PlanFormDialog mode={planMode} onClose={() => setPlanMode(null)} />
      <FocusAreaDialog mode={focusMode} onClose={() => setFocusMode(null)} />
      <TurnIntoWorkDialog mode={workMode} onClose={() => setWorkMode(null)} />
      <ConfirmDialog open={!!confirmState} title={confirmState?.title ?? ''} confirmLabel={confirmState?.confirmLabel} danger={confirmState?.danger} onConfirm={() => settle(true)} onClose={() => settle(false)}>
        {confirmState?.body}
      </ConfirmDialog>
    </Ctx.Provider>
  );
}
