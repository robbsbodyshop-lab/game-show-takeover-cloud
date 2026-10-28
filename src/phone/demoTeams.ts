import type { TeamSummary } from '@/data/types';

/**
 * Demo mode has no rooms to look teams up in: the phone's in-memory data layer belongs to its own
 * tab and knows no room. So the phone offers these eight teams (the default 16-bit primaries) and
 * lets the stage's `teams` message rename them once connected.
 */
export const DEMO_TEAMS: readonly TeamSummary[] = [
  { id: 1, name: 'Team 1', color: '#e23b4a' },
  { id: 2, name: 'Team 2', color: '#2f6fe8' },
  { id: 3, name: 'Team 3', color: '#3dc24f' },
  { id: 4, name: 'Team 4', color: '#ffd23f' },
  { id: 5, name: 'Team 5', color: '#a845d8' },
  { id: 6, name: 'Team 6', color: '#5fe0ff' },
  { id: 7, name: 'Team 7', color: '#ff7a1f' },
  { id: 8, name: 'Team 8', color: '#ff7cc8' },
];
