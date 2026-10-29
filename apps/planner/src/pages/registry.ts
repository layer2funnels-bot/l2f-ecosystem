import type { ComponentType } from 'react';
import type { Page } from '../state/route.ts';
import OverviewPage from './OverviewPage.tsx';
import StrategyMapPage from './StrategyMapPage.tsx';
import GoalsPage from './GoalsPage.tsx';
import MyGoalsPage from './MyGoalsPage.tsx';
import MetricsPage from './MetricsPage.tsx';
import ReviewsPage from './ReviewsPage.tsx';
import ReportsPage from './ReportsPage.tsx';
import TemplatesPage from './TemplatesPage.tsx';
import PlanSettingsPage from './PlanSettingsPage.tsx';
import PlansPage from './PlansPage.tsx';
import AlignmentPage from './AlignmentPage.tsx';
import StrategyModelPage from './StrategyModelPage.tsx';

export const PAGE_COMPONENTS: Record<Page, ComponentType> = {
  overview: OverviewPage, mine: MyGoalsPage, plans: PlansPage, map: StrategyMapPage, reviews: ReviewsPage, settings: PlanSettingsPage,
  alignment: AlignmentPage, reports: ReportsPage, goals: GoalsPage, metrics: MetricsPage, model: StrategyModelPage, templates: TemplatesPage,
};