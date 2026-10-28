/**
 * Scoring for the capsule puzzle (FR-062; this project's design, the source had no score).
 * 100 per germ x (1 + cascade index) x speed factor; level clear bonus 1000 x level.
 */
import type { Speed } from './types';

export const GERM_BASE_POINTS = 100;
export const LEVEL_CLEAR_BONUS_PER_LEVEL = 1000;

export const SPEED_FACTOR: Record<Speed, number> = { low: 1, med: 1.5, hi: 2 };

/** Gravity interval per row in ms (docs section 2.4). */
export const GRAVITY_MS: Record<Speed, number> = { low: 1000, med: 500, hi: 250 };

/** Points for one germ cleared in the clear step with the given cascade index (0 = first step). */
export function pointsPerGerm(speed: Speed, cascadeIndex: number): number {
  return Math.round(GERM_BASE_POINTS * (1 + cascadeIndex) * SPEED_FACTOR[speed]);
}

export function clearPoints(germs: number, speed: Speed, cascadeIndex: number): number {
  return germs * pointsPerGerm(speed, cascadeIndex);
}

export function levelClearBonus(level: number): number {
  return LEVEL_CLEAR_BONUS_PER_LEVEL * level;
}
