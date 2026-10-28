/**
 * The episode plan (rules, "Episode structure") and the plan edits the bell causes.
 */
import type { RoundNo, Segment, WheelSettings } from './types';

export const TOSSUP_VALUE = 1000;
export const TOSSUP_STARTER_VALUE = 2000;
export const FRENZY_MS = 30000;
export const TRIPLE_VALUE = 2000;
export const TRIPLE_SWEEP = 4000;
export const TIEBREAK_VALUE = 1000;

const round = (n: RoundNo): Segment => ({ kind: 'round', round: n, prize: n === 3 });

/**
 * Full show: opening toss-ups (classic: $1,000 then $2,000 whose winner starts Round 1; or Fortune
 * Frenzy), Rounds 1-3, Triple Toss-Up, Round 4 (or a Speed-Up in its place), Bonus Round.
 * Short show: one $2,000 toss-up (or Frenzy), Rounds 1-2, then a $5,000 round that opens as the Speed-Up.
 * `finale` (consolation, tiebreaker) always follows the main game; `bonus` is left out by the setting.
 */
export function buildPlan(settings: WheelSettings): Segment[] {
  const plan: Segment[] = [];
  if (settings.opening === 'frenzy') {
    plan.push({ kind: 'frenzy', value: TOSSUP_VALUE, durationMs: FRENZY_MS });
  } else if (settings.length === 'short') {
    plan.push({ kind: 'tossup', value: TOSSUP_STARTER_VALUE, starter: true });
  } else {
    plan.push({ kind: 'tossup', value: TOSSUP_VALUE, starter: false });
    plan.push({ kind: 'tossup', value: TOSSUP_STARTER_VALUE, starter: true });
  }
  plan.push(round(1), round(2));
  if (settings.length === 'full') {
    plan.push(round(3), { kind: 'triple', value: TRIPLE_VALUE, sweep: TRIPLE_SWEEP });
    plan.push(settings.speedUpStart === 'round4' ? { kind: 'speedup' } : round(4));
  } else {
    plan.push({ kind: 'speedup' });
  }
  plan.push({ kind: 'finale' });
  if (settings.bonusRound) plan.push({ kind: 'bonus' });
  return plan;
}

/**
 * The bell: everything between `from` (inclusive) and the finale is replaced by one Speed-Up.
 * Used both between rounds ("makes the next round the Speed-Up") and mid-round.
 */
export function collapseToSpeedUp(plan: readonly Segment[], from: number): Segment[] {
  const finale = plan.findIndex((seg, i) => i >= from && seg.kind === 'finale');
  const tail = finale === -1 ? [] : plan.slice(finale);
  return [...plan.slice(0, from), { kind: 'speedup' }, ...tail];
}

/** Round 4 finished before the bell: one more $5,000 round opens as the Speed-Up. */
export function insertSpeedUpAfter(plan: readonly Segment[], index: number): Segment[] {
  return [...plan.slice(0, index + 1), { kind: 'speedup' }, ...plan.slice(index + 1)];
}
