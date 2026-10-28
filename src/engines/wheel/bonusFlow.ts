/**
 * The Bonus Round. Rules: docs/WHEEL_OF_FORTUNE_RULES.md, "The Bonus Round".
 * The envelope stays sealed in state until it is opened; only host selectors expose it.
 */
import { bonusEnvelopes, bonusRemaining, checkBonusCall, spinBonus } from './bonus';
import { emit, installNextPuzzle, requestPuzzles, teamById } from './engineCore';
import { BONUS_GIVEN_LETTERS } from './letters';
import { callLetter, callLetters, createPuzzleState, revealAll } from './puzzleState';
import type { PuzzleState } from './puzzleState';
import type { BonusInfo, Phase, PuzzleInput, WheelState } from './types';

/** The team with the highest total plays; ties were broken by the tiebreaker. */
export function topTeamId(s: WheelState): number {
  let best = s.teams[0];
  for (const t of s.teams) if (best && t.bank > best.bank) best = t;
  return best?.id ?? 0;
}

export function beginBonus(s: WheelState, options: PuzzleInput[]): WheelState {
  const team = teamById(s, topTeamId(s));
  if (!team) return s;
  const info: BonusInfo = {
    team: team.id,
    options,
    category: null,
    envelope: null,
    picked: [],
    hasWildCard: team.wildCard,
    hasMillion: team.millionWedge !== 'none',
    won: null,
    opened: false,
    resume: null,
  };
  return {
    ...s,
    stage: 'bonus',
    phase: 'bonus-category',
    round: 0,
    turn: team.id,
    puzzle: null,
    queue: [],
    request: null,
    awaiting: null,
    bonus: info,
  };
}

function withGivenLetters(ps: PuzzleState, picked: readonly string[]): PuzzleState {
  return callLetters(ps, [...BONUS_GIVEN_LETTERS, ...picked]);
}

export function pickCategory(s: WheelState, category: string): WheelState {
  const b = s.bonus;
  if (s.stage !== 'bonus' || s.phase !== 'bonus-category' || !b) return s;
  const chosen = b.options.find((p) => p.category === category);
  if (!chosen) return s;
  const puzzle = createPuzzleState(chosen);
  if (!puzzle) return s;
  const n = emit(s, 'bonus-category', { label: category });
  return {
    ...n,
    puzzle,
    seen: n.seen.includes(chosen.id) ? n.seen : [...n.seen, chosen.id],
    phase: 'bonus-spin',
    bonus: { ...b, category },
  };
}

export function bonusSpin(s: WheelState, draw: number): WheelState {
  const b = s.bonus;
  if (s.stage !== 'bonus' || s.phase !== 'bonus-spin' || !b || !s.puzzle || !Number.isFinite(draw)) return s;
  const index = spinBonus(draw);
  const envelope = bonusEnvelopes(b.hasMillion)[index];
  if (!envelope) return s;
  // R, S, T, L, N and E are revealed once the envelope is chosen.
  const n = emit(s, 'bonus-spin', { index });
  return {
    ...n,
    puzzle: withGivenLetters(s.puzzle, []),
    phase: 'bonus-letters',
    bonus: { ...b, envelope },
  };
}

export function bonusCallLetter(s: WheelState, raw: string): WheelState {
  const b = s.bonus;
  if (s.stage !== 'bonus' || s.phase !== 'bonus-letters' || !b || !s.puzzle) return s;
  // Repeats and invalid calls are simply asked again.
  const check = checkBonusCall(raw, b.picked, b.hasWildCard);
  if (!check.ok) return s;
  const picked = [...b.picked, check.letter];
  const n = emit(s, 'bonus-letter', { letter: check.letter });
  return {
    ...n,
    puzzle: callLetter(s.puzzle, check.letter).state,
    phase: bonusRemaining(picked, b.hasWildCard).complete ? 'bonus-ready' : 'bonus-letters',
    bonus: { ...b, picked },
  };
}

/** Enter: the ten-second clock starts (the controller runs it). */
export function startBonusClock(s: WheelState): WheelState {
  if (s.stage !== 'bonus' || s.phase !== 'bonus-ready') return s;
  return { ...emit(s, 'bonus-clock'), phase: 'bonus-solving' };
}

export function bonusSolve(s: WheelState, verdict: 'correct' | 'wrong'): WheelState {
  const b = s.bonus;
  if (s.stage !== 'bonus' || !b || !s.puzzle) return s;
  // A correct answer before the clock starts also wins; any number of guesses.
  const open: Phase[] = ['bonus-letters', 'bonus-ready', 'bonus-solving'];
  if (!open.includes(s.phase)) return s;
  const marked: WheelState = { ...s, lastRuling: { team: b.team, verdict, step: s.step + 1 } };
  if (verdict === 'wrong') return emit(marked, 'bonus-wrong', { team: b.team });
  const n = emit(marked, 'bonus-solved', { team: b.team });
  return { ...n, puzzle: revealAll(s.puzzle), phase: 'bonus-won', bonus: { ...b, won: true } };
}

export function bonusTimeUp(s: WheelState): WheelState {
  const b = s.bonus;
  if (s.stage !== 'bonus' || s.phase !== 'bonus-solving' || !b || !s.puzzle) return s;
  const n = emit(s, 'bonus-time-up', { team: b.team });
  return { ...n, puzzle: revealAll(s.puzzle), phase: 'bonus-timeup', bonus: { ...b, won: false } };
}

/** Host: the answer started before the buzzer. */
export function bonusAcceptLate(s: WheelState): WheelState {
  const b = s.bonus;
  if (s.stage !== 'bonus' || s.phase !== 'bonus-timeup' || !b || b.opened) return s;
  const n = emit(s, 'bonus-solved', { team: b.team });
  return { ...n, phase: 'bonus-won', bonus: { ...b, won: true } };
}

export function openEnvelope(s: WheelState): WheelState {
  const b = s.bonus;
  if (s.stage !== 'bonus' || (s.phase !== 'bonus-won' && s.phase !== 'bonus-timeup') || !b?.envelope)
    return s;
  const n = emit(s, 'bonus-opened', { team: b.team, amount: b.envelope.value });
  return { ...n, phase: 'bonus-opened', bonus: { ...b, opened: true } };
}

/** Throw out the Bonus puzzle before it is solved: a replacement in the chosen category, same letters. */
export function bonusThrowOut(s: WheelState): WheelState {
  const b = s.bonus;
  const ok: Phase[] = ['bonus-spin', 'bonus-letters', 'bonus-ready'];
  if (s.stage !== 'bonus' || !b || !ok.includes(s.phase)) return s;
  const n = emit(s, 'puzzle-thrown-out');
  const resume = s.phase;
  const withBonus: WheelState = { ...n, bonus: { ...b, resume } };
  const installed = installNextPuzzle(withBonus);
  if (installed) return resumeBonusWithNewPuzzle(installed);
  return requestPuzzles(
    withBonus,
    { use: 'bonus', count: 1, ...(b.category ? { category: b.category } : {}) },
    'replace',
    resume,
  );
}

export function resumeBonusWithNewPuzzle(s: WheelState): WheelState {
  const b = s.bonus;
  if (!b || !s.puzzle) return s;
  const given = b.envelope ? withGivenLetters(s.puzzle, b.picked) : s.puzzle;
  return {
    ...s,
    request: null,
    awaiting: null,
    resumePhase: null,
    puzzle: given,
    phase: b.resume ?? s.phase,
    bonus: { ...b, resume: null },
  };
}
