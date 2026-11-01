set check_function_bodies = off;
-- 0040 · Planner measures accept "every two weeks". The measure form offers the same check rhythms as plans and goals
-- (none, weekly, fortnightly, monthly, quarterly), but planner_kpis only allowed four of them, so choosing "Every two weeks"
-- failed with a constraint error. Plans and goals already accept fortnightly; measures now do too.
alter table public.planner_kpis drop constraint planner_kpis_cadence_check;
alter table public.planner_kpis add constraint planner_kpis_cadence_check check (cadence in ('none', 'weekly', 'fortnightly', 'monthly', 'quarterly'));
