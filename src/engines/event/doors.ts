/**
 * Door game that decides the play order (HOST_FEATURE_INVENTORY.md 1.2, FR-050).
 *
 * DESIGN CHANGE: the old game had teams guess a number 1-100 and the closest team chose a door.
 * This version replaces that with direct picks: every team picks a distinct door 1..N (N = team
 * count) and the injected draw decides which play position hides behind each door. The choice is
 * visible to the audience and there is no closest-guess tiebreaker to rule on. Open question for
 * the owner: keep the old guess-then-pick variant instead?
 *
 * Stages: picking (teams choose) -> revealing (all picked, flourish pending) -> done (order set).
 */
import type { DoorsState } from './types';

export function createDoors(doorCount: number): DoorsState {
  return { stage: 'picking', doorCount, picks: [], positions: null };
}

function isDraw(draw: readonly number[], n: number): boolean {
  return draw.length >= n && draw.every((d) => Number.isFinite(d) && d >= 0 && d < 1);
}

/**
 * Deterministic shuffle of play positions 1..n over doors 1..n (Fisher-Yates driven by `draw`,
 * which needs at least n numbers in [0, 1)). Result index d - 1 holds the position behind door d.
 * Returns null for an unusable draw.
 */
export function doorPositions(draw: readonly number[], n: number): number[] | null {
  if (!Number.isInteger(n) || n < 1 || !isDraw(draw, n)) return null;
  const positions = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor((draw[i] ?? 0) * (i + 1));
    const a = positions[i] ?? 0;
    positions[i] = positions[j] ?? 0;
    positions[j] = a;
  }
  return positions;
}

/**
 * Record a team's pick. A team may change its pick while picking is open, but never onto a
 * door another team holds. Illegal picks return the same object. The last pick moves the
 * stage to `revealing`.
 */
export function pickDoor(
  doors: DoorsState,
  teamIds: readonly number[],
  team: number,
  door: number,
): DoorsState {
  if (doors.stage !== 'picking') return doors;
  if (!teamIds.includes(team)) return doors;
  if (!Number.isInteger(door) || door < 1 || door > doors.doorCount) return doors;
  if (doors.picks.some((p) => p.door === door && p.team !== team)) return doors;
  const existing = doors.picks.find((p) => p.team === team);
  if (existing?.door === door) return doors;
  const picks = [...doors.picks.filter((p) => p.team !== team), { team, door }].sort(
    (a, b) => a.team - b.team,
  );
  const everyoneIn = teamIds.every((id) => picks.some((p) => p.team === id));
  return { ...doors, picks, stage: everyoneIn ? 'revealing' : 'picking' };
}

export interface DoorsReveal {
  doors: DoorsState;
  /** Team ids first player first. */
  playOrder: number[];
}

/** Reveal what is behind the doors. Null unless every team has picked and the draw is usable. */
export function revealDoors(doors: DoorsState, draw: readonly number[]): DoorsReveal | null {
  if (doors.stage !== 'revealing') return null;
  const positions = doorPositions(draw, doors.doorCount);
  if (!positions) return null;
  const playOrder = [...doors.picks]
    .sort((a, b) => (positions[a.door - 1] ?? 0) - (positions[b.door - 1] ?? 0))
    .map((p) => p.team);
  return { doors: { ...doors, stage: 'done', positions }, playOrder };
}
