// One provider owns the organization context, the selected plan and every mutation helper, so every screen
// reads the same data and a failure is always reported the same way.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Can, Identity, Member, NamedHorizon, PlanDetail, PlanSummary, Workspace } from '../api/types.ts';
import { PlannerError } from '../api/types.ts';
import type { PlannerClient } from '../api/client.ts';
import { todayIso } from '../lib/schedule.ts';
import { useRoute, type Page, type Route } from './route.ts';

export type ToastKind = 'success' | 'error' | 'info';
export interface ToastItem { id: number; kind: ToastKind; text: string }

export interface PlannerCtx {
  client: PlannerClient;
  me: Identity;
  today: string;
  workspace: Workspace | null;
  workspaces: Workspace[];
  switchWorkspace(id: string): Promise<void>;
  can: Can;
  members: Member[];
  /** Named time periods the organization defines (Q4 2026, Year 2027 ...). */
  horizons: NamedHorizon[];
  plans: PlanSummary[];
  showArchivedPlans: boolean;
  setShowArchivedPlans(v: boolean): void;
  planId: string | null;
  plan: PlanDetail | null;
  selectPlan(id: string): void;
  status: 'loading' | 'ready' | 'no-access' | 'error';
  planStatus: 'idle' | 'loading' | 'ready' | 'missing';
  errorText: string | null;
  /** Increments after every refresh so detail views (the goal drawer) reload too. */
  revision: number;
  themePref: 'auto' | 'light' | 'dark';
  setThemePref(v: 'auto' | 'light' | 'dark'): void;
  refresh(): Promise<void>;
  route: Route;
  navigate(page: Page, params?: Record<string, string | null | undefined>): void;
  openGoal(id: string | null, tab?: string): void;
  openGoalId: string | null;
  toasts: ToastItem[];
  toast(text: string, kind?: ToastKind): void;
  dismissToast(id: number): void;
  /** Runs a change: reports the plain-words error on failure, refreshes on success. Returns undefined when it failed. */
  run<T>(fn: () => Promise<T>, opts?: { success?: string; refresh?: boolean }): Promise<T | undefined>;
}

const Ctx = createContext<PlannerCtx | null>(null);
export const usePlanner = (): PlannerCtx => { const c = useContext(Ctx); if (!c) throw new Error('usePlanner outside PlannerProvider'); return c; };

const NO_ACCESS: Can = { 'plan.view': false, 'plan.manage': false, 'goal.create': false, 'goal.edit': false, 'goal.archive': false, 'goal.delete': false, 'update.post': false, 'measure.edit': false, 'action.manage': false, 'review.manage': false, 'comment.create': false };
const planStore = (userId: string, wsId: string) => `planner.plan.${userId}.${wsId}`;
const wsStore = (userId: string) => `planner.workspace.${userId}`;
const safeGet = (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const safeSet = (k: string, v: string) => { try { window.localStorage.setItem(k, v); } catch { /* storage unavailable: the choice just is not remembered */ } };

export function PlannerProvider({ client, me, children }: { client: PlannerClient; me: Identity; children: ReactNode }) {
  const { route, navigate, patch } = useRoute();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [wsId, setWsId] = useState<string | null>(null);
  const [can, setCan] = useState<Can>(NO_ACCESS);
  const [members, setMembers] = useState<Member[]>([]);
  const [horizons, setHorizons] = useState<NamedHorizon[]>([]);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [showArchivedPlans, setShowArchivedPlans] = useState(false);
  const [planId, setPlanId] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [status, setStatus] = useState<PlannerCtx['status']>('loading');
  const [planStatus, setPlanStatus] = useState<PlannerCtx['planStatus']>('idle');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastId = useRef(0);
  const planSeq = useRef(0);
  const generation = useRef(0);   // drops answers that arrive after the person switched organization or plan
  const today = useMemo(() => todayIso(), []);

  const toast = useCallback((text: string, kind: ToastKind = 'info') => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 8000 : 4500);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  // organizations the person belongs to
  useEffect(() => {
    let live = true;
    planSeq.current++;   // a plan still loading for the previous person or organization must not land
    setStatus('loading'); setWorkspaces([]); setWsId(null); setPlan(null); setPlans([]); setPlanId(null);
    client.workspaces().then((list) => {
      if (!live) return;
      setWorkspaces(list);
      if (!list.length) { setStatus('no-access'); return; }
      const remembered = safeGet(wsStore(me.id));
      setWsId(list.find((w) => w.id === remembered)?.id ?? list[0]!.id);
    }).catch(() => { if (live) { setStatus('error'); setErrorText('The organizations could not be loaded.'); } });
    return () => { live = false; };
  }, [client, me.id]);

  const workspace = useMemo(() => workspaces.find((w) => w.id === wsId) ?? null, [workspaces, wsId]);
  // Design v4: data-org picks the organization palette, data-theme the light or dark scheme (system by default, overridable).
  const [themePref, setThemePrefState] = useState<'auto' | 'light' | 'dark'>(() => { const v = safeGet('planner.theme'); return v === 'light' || v === 'dark' ? v : 'auto'; });
  const setThemePref = useCallback((v: 'auto' | 'light' | 'dark') => { setThemePrefState(v); safeSet('planner.theme', v); }, []);
  useEffect(() => { document.documentElement.dataset.org = workspace?.slug === 'aurj' ? 'aurj' : 'l2f'; }, [workspace?.slug]);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = themePref === 'auto' ? (mq.matches ? 'dark' : 'light') : themePref; };
    apply(); mq.addEventListener('change', apply); return () => mq.removeEventListener('change', apply);
  }, [themePref]);

  const loadWorkspace = useCallback(async (ws: string, keepPlan: string | null, archived: boolean, urlPlan: string | null = null) => {
    const gen = ++generation.current;
    const [access, mem, firstList, model] = await Promise.all([client.access(ws), client.members(ws), client.plans(ws, archived), client.model(ws).catch(() => null)]);
    let list = firstList;
    if (gen !== generation.current) return;
    setCan(access); setMembers(mem); setPlans(list); setHorizons(model?.horizons ?? []);
    if (!access['plan.view']) { setStatus('no-access'); setPlanId(null); setPlan(null); return; }
    setStatus('ready');
    if (urlPlan && !list.some((p) => p.id === urlPlan)) {   // an address pointing at a plan that is not there (or not visible) is reported, never silently replaced
      setPlanId(null); setPlan(null); setPlanStatus('missing'); return;
    }
    // the plan you were on was just archived: stay on it (read-only) instead of jumping to another plan
    if (keepPlan && !archived && !list.some((p) => p.id === keepPlan)) {
      const kept = (await client.plans(ws, true).catch(() => [])).find((p) => p.id === keepPlan);
      if (gen !== generation.current) return;
      if (kept) { list = [...list, kept]; setPlans(list); }
    }
    const wanted = keepPlan && list.some((p) => p.id === keepPlan) ? keepPlan : (list.find((p) => p.favorite) ?? list.find((p) => !p.archived_at) ?? list[0])?.id ?? null;
    setPlanId(wanted);
    if (!wanted) { setPlan(null); setPlanStatus('idle'); }
  }, [client]);

  useEffect(() => {
    if (!wsId) return;
    planSeq.current++;
    setStatus('loading');
    const fromUrl = route.params.plan ?? safeGet(planStore(me.id, wsId));
    loadWorkspace(wsId, fromUrl, showArchivedPlans, route.params.plan ?? null).catch(() => { setStatus('error'); setErrorText('Planner could not be loaded. Try again in a moment.'); });
    // route.params.plan is read once per organization switch on purpose; plan selection afterwards is explicit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId, loadWorkspace, showArchivedPlans, me.id]);

  const loadPlan = useCallback(async (id: string) => {
    const seq = ++planSeq.current;   // only the newest plan request may write; an organization reload in between must not drop it
    const detail = await client.plan(id);
    if (seq !== planSeq.current) return;
    setPlan(detail); setPlanStatus(detail ? 'ready' : 'missing');
  }, [client]);

  useEffect(() => {
    if (!planId) return;
    setPlanStatus('loading');
    loadPlan(planId).catch(() => { setPlanStatus('missing'); });
  }, [planId, loadPlan]);

  // keep the URL pointing at the selected plan so a refresh or shared link opens the same one
  useEffect(() => {
    if (planId && wsId && route.params.plan !== planId) { safeSet(planStore(me.id, wsId), planId); patch({ plan: planId }, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, wsId]);

  // the address is the source of truth for the selected plan: following a link while the app is open switches plan (or says it is missing)
  useEffect(() => {
    const want = route.params.plan;
    if (status !== 'ready' || !want || want === planId) return;
    if (plans.some((p) => p.id === want)) { setPlan(null); setPlanId(want); }
    else { setPlanId(null); setPlan(null); setPlanStatus('missing'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params.plan, status]);

  const refresh = useCallback(async () => {
    if (!wsId) return;
    await loadWorkspace(wsId, planId, showArchivedPlans);
    if (planId) await loadPlan(planId);
    setRevision((r) => r + 1);
  }, [wsId, planId, showArchivedPlans, loadWorkspace, loadPlan]);

  const switchWorkspace = useCallback(async (id: string) => {
    if (id === wsId) return;
    try { await client.setActiveWorkspace(id); } catch { toast('You can only switch to an organization you belong to.', 'error'); return; }
    safeSet(wsStore(me.id), id);
    generation.current++;
    setPlan(null); setPlans([]); setPlanId(null); setMembers([]); setCan(NO_ACCESS);
    patch({ plan: null, goal: null }, { replace: true });
    setWsId(id);
  }, [client, wsId, me.id, patch, toast]);

  const selectPlan = useCallback((id: string) => {
    if (!wsId) return;
    safeSet(planStore(me.id, wsId), id);
    setPlan(null); setPlanId(id); setPlanStatus('loading');
    patch({ plan: id, goal: null });
  }, [wsId, me.id, patch]);

  const run = useCallback<PlannerCtx['run']>(async (fn, opts = {}) => {
    try {
      const r = await fn();
      // the change is saved; a failed reload must not make it look as if nothing happened (a retry would duplicate it)
      if (opts.refresh !== false) await refresh().catch(() => toast('Saved, but the screen could not be refreshed. Reload the page to see the change.', 'error'));
      if (opts.success) toast(opts.success, 'success');
      return r;
    } catch (e) {
      const err = e instanceof PlannerError ? e : new PlannerError('failed', 'Something went wrong. Nothing was changed.');
      toast(err.message, 'error');
      if (err.code === 'conflict' || err.code === 'not_found') await refresh().catch(() => {});
      return undefined;
    }
  }, [refresh, toast]);

  const openGoal = useCallback((id: string | null, tab?: string) => patch({ goal: id, gtab: id ? (tab ?? null) : null }), [patch]);

  const value: PlannerCtx = {
    client, me, today, workspace, workspaces, switchWorkspace, can, members, horizons, plans, showArchivedPlans, setShowArchivedPlans, planId, plan, selectPlan,
    status, planStatus, errorText, revision, themePref, setThemePref, refresh, route, navigate, openGoal, openGoalId: route.params.goal ?? null, toasts, toast, dismissToast, run,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

