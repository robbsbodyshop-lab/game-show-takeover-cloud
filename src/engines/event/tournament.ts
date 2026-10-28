/**
 * Single-elimination bracket for the Family Feud matches (HOST_FEATURE_INVENTORY.md 1.3).
 * Seeded by play order; non-powers of two give byes to the top seeds. Pure and serializable.
 */
import type { BracketMatch, BracketState } from './types';
import { MAX_TEAMS, MIN_TEAMS } from './types';

/** Standard bracket slot order: seed numbers for a bracket of `size` (power of two). */
function seedSlots(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

function cloneRounds(rounds: BracketMatch[][]): BracketMatch[][] {
  return rounds.map((round) => round.map((m) => ({ ...m })));
}

/** Place `team` into the next round's matching side, if there is a next round. */
function advance(rounds: BracketMatch[][], round: number, slot: number, team: number): void {
  const next = rounds[round + 1]?.[slot >> 1];
  if (!next) return;
  if (slot % 2 === 0) next.a = team;
  else next.b = team;
}

/**
 * Build a bracket for 2..8 teams (the event uses it for 3..8). `seeds` lists team ids best
 * seed first. Throws on an invalid list: callers (the reducer) validate first.
 */
export function createBracket(seeds: readonly number[]): BracketState {
  const n = seeds.length;
  if (n < MIN_TEAMS || n > MAX_TEAMS) throw new RangeError(`bracket needs ${MIN_TEAMS}-${MAX_TEAMS} teams`);
  if (new Set(seeds).size !== n) throw new RangeError('bracket seeds must be distinct');

  let size = 2;
  while (size < n) size *= 2;
  const slots = seedSlots(size);
  const teamAt = (seed: number): number | null => (seed <= n ? (seeds[seed - 1] ?? null) : null);

  const firstRound: BracketMatch[] = [];
  for (let slot = 0; slot < size / 2; slot++) {
    firstRound.push({
      round: 0,
      slot,
      a: teamAt(slots[slot * 2] ?? Infinity),
      b: teamAt(slots[slot * 2 + 1] ?? Infinity),
      winner: null,
      bye: false,
    });
  }
  const rounds: BracketMatch[][] = [firstRound];
  for (let size2 = size / 2, round = 1; size2 >= 2; size2 /= 2, round++) {
    rounds.push(
      Array.from({ length: size2 / 2 }, (_, slot) => ({
        round,
        slot,
        a: null,
        b: null,
        winner: null,
        bye: false,
      })),
    );
  }

  // Byes: a first-round match with one side empty is won by the other side at once.
  for (const m of firstRound) {
    const only = m.a !== null && m.b === null ? m.a : m.b !== null && m.a === null ? m.b : null;
    if (only !== null) {
      m.winner = only;
      m.bye = true;
      advance(rounds, 0, m.slot, only);
    }
  }
  return { seeds: [...seeds], rounds };
}

/** The match to play next: the first undecided match with both teams known, in round order. */
export function currentMatch(bracket: BracketState): BracketMatch | null {
  for (const round of bracket.rounds) {
    for (const m of round) {
      if (m.winner === null && m.a !== null && m.b !== null) return m;
    }
  }
  return null;
}

export function isComplete(bracket: BracketState): boolean {
  return champion(bracket) !== null;
}

export function champion(bracket: BracketState): number | null {
  const last = bracket.rounds[bracket.rounds.length - 1];
  return last?.[0]?.winner ?? null;
}

/**
 * Record the winner of the current match and advance them. Returns the same object when
 * there is no match to play or the winner is not one of its two teams.
 */
export function recordMatchWinner(bracket: BracketState, winnerId: number): BracketState {
  const match = currentMatch(bracket);
  if (!match || (winnerId !== match.a && winnerId !== match.b)) return bracket;
  const rounds = cloneRounds(bracket.rounds);
  const target = rounds[match.round]?.[match.slot];
  if (!target) return bracket;
  target.winner = winnerId;
  advance(rounds, match.round, match.slot, winnerId);
  return { seeds: bracket.seeds, rounds };
}

/** Teams knocked out so far (the loser of every played, non-bye match). */
export function eliminatedTeams(bracket: BracketState): number[] {
  const out: number[] = [];
  for (const round of bracket.rounds) {
    for (const m of round) {
      if (m.bye || m.winner === null) continue;
      const loser = m.winner === m.a ? m.b : m.a;
      if (loser !== null) out.push(loser);
    }
  }
  return out;
}
