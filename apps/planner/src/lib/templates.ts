// Built-in plan templates. Goals reference focus areas, parents and values by index and goal types by name.
// A parent always comes before its children in the list so the plan can be created in order.
import type { Cadence, FocusColor, Priority, ProgressMode } from '../api/types.ts';

export type TemplateGoalType = 'Objective' | 'KPI' | 'Initiative' | 'Project';
export interface TemplateMeasure { name: string; unit: string; start: number; target: number; direction: 'increase' | 'decrease'; cadence: Cadence }
export interface TemplateGoal {
  title: string; type: TemplateGoalType; focus: number; parent?: number; priority?: Priority; mode?: ProgressMode;
  startDays?: number; dueDays: number; value?: number; measure?: TemplateMeasure;
}
export interface PlanTemplate {
  id: string; name: string; description: string; bestFor: string; durationDays: number; cadence: Cadence; vision: string;
  values: { name: string; description: string }[];
  focusAreas: { name: string; description: string; color: FocusColor }[];
  goals: TemplateGoal[];
}

const m = (name: string, unit: string, start: number, target: number, cadence: Cadence = 'monthly'): TemplateMeasure =>
  ({ name, unit, start, target, direction: target >= start ? 'increase' : 'decrease', cadence });

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: 'annual-strategy', name: 'Annual company strategy', bestFor: 'Whole-company direction for a year',
    description: 'A year-long plan with four focus areas: growth, customers, operations and people. Each has an objective with measurable results and a few initiatives.',
    durationDays: 364, cadence: 'quarterly',
    vision: 'A company our customers rely on and our team is proud to build, growing steadily without losing what makes us good.',
    values: [
      { name: 'Customers first', description: 'We decide with the customer outcome in mind.' },
      { name: 'Honest by default', description: 'We share bad news early and numbers as they are.' },
      { name: 'Built to last', description: 'We prefer sound foundations over quick wins.' },
      { name: 'Own the outcome', description: 'Everyone follows a goal through to the result.' },
    ],
    focusAreas: [
      { name: 'Growth', description: 'Win new business and grow recurring revenue.', color: 'blue' },
      { name: 'Customers', description: 'Keep customers longer and make them successful.', color: 'teal' },
      { name: 'Operations', description: 'Run a calmer, faster, better-measured business.', color: 'amber' },
      { name: 'People', description: 'Hire well, grow people and keep them.', color: 'violet' },
    ],
    goals: [
      { title: 'Grow recurring revenue', type: 'Objective', focus: 0, mode: 'children', priority: 'high', dueDays: 364, value: 2 },
      { title: 'Annual recurring revenue', type: 'KPI', focus: 0, parent: 0, mode: 'measure', dueDays: 364, measure: m('Annual recurring revenue', '$', 500000, 750000) },
      { title: 'New customers won', type: 'KPI', focus: 0, parent: 0, mode: 'measure', dueDays: 364, measure: m('New customers this year', '', 0, 60) },
      { title: 'Launch a customer referral programme', type: 'Initiative', focus: 0, parent: 0, mode: 'actions', dueDays: 180 },
      { title: 'Keep customers for longer', type: 'Objective', focus: 1, mode: 'children', priority: 'high', dueDays: 364, value: 0 },
      { title: 'Customer retention', type: 'KPI', focus: 1, parent: 4, mode: 'measure', dueDays: 364, measure: m('Customers retained', '%', 86, 92) },
      { title: 'Customer satisfaction', type: 'KPI', focus: 1, parent: 4, mode: 'measure', dueDays: 364, measure: m('Satisfaction score', 'score', 7.4, 8.5, 'quarterly') },
      { title: 'Write a customer onboarding guide', type: 'Initiative', focus: 1, parent: 4, mode: 'actions', dueDays: 120 },
      { title: 'Run a calmer, faster operation', type: 'Objective', focus: 2, mode: 'children', dueDays: 364, value: 3 },
      { title: 'Move reporting into one system', type: 'Project', focus: 2, parent: 8, mode: 'actions', dueDays: 240 },
      { title: 'Support response time', type: 'KPI', focus: 2, parent: 8, mode: 'measure', dueDays: 300, measure: m('Average first response', 'hours', 24, 8, 'weekly') },
      { title: 'Build a team that stays and grows', type: 'Objective', focus: 3, mode: 'children', dueDays: 364, value: 1 },
      { title: 'Create a development plan for every person', type: 'Initiative', focus: 3, parent: 11, mode: 'actions', dueDays: 200 },
      { title: 'Team engagement', type: 'KPI', focus: 3, parent: 11, mode: 'measure', dueDays: 364, measure: m('Engagement score', 'score', 6.8, 8, 'quarterly') },
    ],
  },
  {
    id: 'quarterly-focus', name: 'Quarterly focus cycle', bestFor: 'A small set of priorities for one quarter',
    description: 'A lightweight 13-week plan: three priorities plus a place for keeping the business running. Reviewed every two weeks.',
    durationDays: 91, cadence: 'fortnightly',
    vision: 'By the end of the quarter the three things that matter most are finished, not just started.',
    values: [
      { name: 'Focus', description: 'We say no to good ideas so great ones get done.' },
      { name: 'Clarity', description: 'Everyone can say what we are doing and why.' },
      { name: 'Momentum', description: 'We ship small and often.' },
    ],
    focusAreas: [
      { name: 'Priority one', description: 'The most important outcome this quarter.', color: 'blue' },
      { name: 'Priority two', description: 'The second outcome we commit to.', color: 'coral' },
      { name: 'Priority three', description: 'The third outcome, if capacity allows.', color: 'green' },
      { name: 'Keep the lights on', description: 'Routine work that must not slip.', color: 'slate' },
    ],
    goals: [
      { title: 'Deliver the main outcome of the quarter', type: 'Objective', focus: 0, mode: 'children', priority: 'critical', dueDays: 90, value: 0 },
      { title: 'Agree scope and success measure', type: 'Initiative', focus: 0, parent: 0, mode: 'actions', dueDays: 14 },
      { title: 'Deliver in weekly steps', type: 'Project', focus: 0, parent: 0, mode: 'actions', dueDays: 80 },
      { title: 'Deliver the second outcome of the quarter', type: 'Objective', focus: 1, mode: 'children', priority: 'high', dueDays: 90, value: 2 },
      { title: 'Second priority result', type: 'KPI', focus: 1, parent: 3, mode: 'measure', dueDays: 90, measure: m('Result to reach', '', 0, 100, 'fortnightly') },
      { title: 'Make progress on the third outcome', type: 'Objective', focus: 2, mode: 'manual', dueDays: 90, value: 1 },
      { title: 'Review and fix the routine work', type: 'Initiative', focus: 3, mode: 'actions', dueDays: 45 },
      { title: 'Overdue tasks in the backlog', type: 'KPI', focus: 3, mode: 'measure', dueDays: 90, measure: m('Overdue tasks', '', 30, 5, 'weekly') },
      { title: 'Run the end-of-quarter retrospective', type: 'Initiative', focus: 3, mode: 'actions', dueDays: 91 },
    ],
  },
  {
    id: 'agency-growth', name: 'Agency growth plan', bestFor: 'Service businesses balancing clients, delivery and margin',
    description: 'For an agency or consultancy: win the right clients, deliver great work, grow the team and protect profit.',
    durationDays: 364, cadence: 'monthly',
    vision: 'A profitable agency known for results, where good people do their best work at a sustainable pace.',
    values: [
      { name: 'Client results', description: 'We are measured by what changes for the client.' },
      { name: 'Craft', description: 'We care how the work is made.' },
      { name: 'Sustainable pace', description: 'Great work does not need burnout.' },
      { name: 'Open books', description: 'The team sees how the business is doing.' },
    ],
    focusAreas: [
      { name: 'Win clients', description: 'A steady, well-qualified pipeline.', color: 'coral' },
      { name: 'Deliver great work', description: 'Quality, on time, with happy clients.', color: 'teal' },
      { name: 'Grow the team', description: 'Hiring, onboarding and development.', color: 'violet' },
      { name: 'Healthy margins', description: 'Pricing, utilisation and cash.', color: 'green' },
    ],
    goals: [
      { title: 'Build a reliable pipeline', type: 'Objective', focus: 0, mode: 'children', priority: 'high', dueDays: 364, value: 0 },
      { title: 'Qualified leads each month', type: 'KPI', focus: 0, parent: 0, mode: 'measure', dueDays: 364, measure: m('Qualified leads per month', '', 8, 20) },
      { title: 'Publish three client case studies', type: 'Initiative', focus: 0, parent: 0, mode: 'actions', dueDays: 150, value: 1 },
      { title: 'Deliver work clients rave about', type: 'Objective', focus: 1, mode: 'children', dueDays: 364, value: 1 },
      { title: 'Client satisfaction', type: 'KPI', focus: 1, parent: 3, mode: 'measure', dueDays: 364, measure: m('Client satisfaction', 'score', 7.5, 9, 'quarterly') },
      { title: 'Projects delivered on time', type: 'KPI', focus: 1, parent: 3, mode: 'measure', dueDays: 364, measure: m('On-time delivery', '%', 70, 90) },
      { title: 'Introduce a delivery playbook', type: 'Project', focus: 1, parent: 3, mode: 'actions', dueDays: 120 },
      { title: 'Grow a team that can deliver more', type: 'Objective', focus: 2, mode: 'children', dueDays: 364, value: 2 },
      { title: 'Hire two senior people', type: 'Initiative', focus: 2, parent: 7, mode: 'actions', dueDays: 240 },
      { title: 'Create a structured onboarding path', type: 'Initiative', focus: 2, parent: 7, mode: 'actions', dueDays: 150 },
      { title: 'Protect profit', type: 'Objective', focus: 3, mode: 'children', priority: 'high', dueDays: 364, value: 3 },
      { title: 'Profit margin', type: 'KPI', focus: 3, parent: 10, mode: 'measure', dueDays: 364, measure: m('Profit margin', '%', 12, 22) },
      { title: 'Billable utilisation', type: 'KPI', focus: 3, parent: 10, mode: 'measure', dueDays: 364, measure: m('Billable utilisation', '%', 58, 70) },
    ],
  },
  {
    id: 'product-launch', name: 'Product launch', bestFor: 'Taking a new product from build to first customers',
    description: 'Six months from build to launch to first customers, with a weekly review and a readiness checklist.',
    durationDays: 180, cadence: 'weekly',
    vision: 'Launch a product that real customers choose, pay for and recommend within three months of release.',
    values: [
      { name: 'Learn fast', description: 'We test assumptions with real customers early.' },
      { name: 'Ship the essential', description: 'We launch with what matters and improve from use.' },
      { name: 'Stay reachable', description: 'Customers can always talk to a person.' },
    ],
    focusAreas: [
      { name: 'Product', description: 'Build the first release and make it dependable.', color: 'blue' },
      { name: 'Go to market', description: 'Position, price and reach the first customers.', color: 'coral' },
      { name: 'Customer success', description: 'Onboarding, support and feedback loops.', color: 'teal' },
      { name: 'Launch readiness', description: 'Everything needed to launch safely.', color: 'amber' },
    ],
    goals: [
      { title: 'Release a dependable first version', type: 'Objective', focus: 0, mode: 'children', priority: 'critical', dueDays: 110, value: 1 },
      { title: 'Build the core features', type: 'Project', focus: 0, parent: 0, mode: 'actions', dueDays: 90 },
      { title: 'Open defects at launch', type: 'KPI', focus: 0, parent: 0, mode: 'measure', dueDays: 110, measure: m('Open serious defects', '', 25, 0, 'weekly') },
      { title: 'Reach the first paying customers', type: 'Objective', focus: 1, mode: 'children', priority: 'high', dueDays: 180, value: 0 },
      { title: 'Agree positioning and pricing', type: 'Initiative', focus: 1, parent: 3, mode: 'actions', dueDays: 60 },
      { title: 'Paying customers', type: 'KPI', focus: 1, parent: 3, mode: 'measure', dueDays: 180, measure: m('Paying customers', '', 0, 50, 'weekly') },
      { title: 'Customers feel looked after', type: 'Objective', focus: 2, mode: 'children', dueDays: 180, value: 2 },
      { title: 'Write the onboarding and help guides', type: 'Initiative', focus: 2, parent: 6, mode: 'actions', dueDays: 100 },
      { title: 'Customers active after 30 days', type: 'KPI', focus: 2, parent: 6, mode: 'measure', dueDays: 180, measure: m('Active after 30 days', '%', 0, 60, 'weekly') },
      { title: 'Be ready to launch safely', type: 'Objective', focus: 3, mode: 'children', dueDays: 120 },
      { title: 'Security and privacy review', type: 'Project', focus: 3, parent: 9, mode: 'actions', dueDays: 90 },
      { title: 'Plan the launch day', type: 'Initiative', focus: 3, parent: 9, mode: 'actions', dueDays: 115 },
    ],
  },
];

const MS_DAY = 86_400_000;
const parse = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** ISO date plus whole days. */
export const addDays = (iso: string, days: number) => fmt(parse(iso) + days * MS_DAY);

/** ISO date plus calendar months; a 31st lands on the last day of a shorter month. */
export function addMonths(iso: string, months: number): string {
  const y = +iso.slice(0, 4), mo = +iso.slice(5, 7) - 1, d = +iso.slice(8, 10);
  const total = y * 12 + mo + months;
  const ny = Math.floor(total / 12), nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return fmt(Date.UTC(ny, nm, Math.min(d, last)));
}
