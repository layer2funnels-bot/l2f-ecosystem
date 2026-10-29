import type { Priority, Status } from '../api/types.ts';

/** Status never relies on colour alone: every status has a glyph and a word. */
export const STATUS_ORDER: Status[] = ['not_started', 'on_track', 'at_risk', 'off_track', 'on_hold', 'completed'];
export const STATUS_META: Record<Status, { label: string; glyph: string; tone: 'neutral' | 'good' | 'warn' | 'bad' | 'info' }> = {
  not_started: { label: 'Not started', glyph: '○', tone: 'neutral' },
  on_track: { label: 'On track', glyph: '▲', tone: 'good' },
  at_risk: { label: 'At risk', glyph: '◆', tone: 'warn' },
  off_track: { label: 'Off track', glyph: '▼', tone: 'bad' },
  on_hold: { label: 'On hold', glyph: '❚❚', tone: 'info' },
  completed: { label: 'Completed', glyph: '✓', tone: 'good' },
};
export const PRIORITY_ORDER: Priority[] = ['critical', 'high', 'medium', 'low'];
export const PRIORITY_META: Record<Priority, { label: string; glyph: string; rank: number }> = {
  critical: { label: 'Critical', glyph: '⬆⬆', rank: 4 },
  high: { label: 'High', glyph: '⬆', rank: 3 },
  medium: { label: 'Medium', glyph: '▬', rank: 2 },
  low: { label: 'Low', glyph: '⬇', rank: 1 },
};
export const CADENCE_LABEL: Record<string, string> = { none: 'No schedule', weekly: 'Weekly', fortnightly: 'Every two weeks', monthly: 'Monthly', quarterly: 'Quarterly' };
export const MODE_LABEL: Record<string, string> = {
  manual: 'Entered by hand', measure: 'From its measure', children: 'From child goals (weighted)', actions: 'From completed actions',
};
export const isOpenStatus = (s: Status) => s !== 'completed';
