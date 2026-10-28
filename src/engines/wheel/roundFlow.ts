/**
 * Rounds 1-4 and the Speed-Up: spins, letters, vowels, solves, specials, turn passing.
 * Rules: docs/WHEEL_OF_FORTUNE_RULES.md, "A turn", "Solving", "The wheel", "The Speed-Up".
 */
import {
  DROP_WINDOW_MS,
  HOUSE_MINIMUM,
  SPEEDUP_BONUS,
  VOWEL_PRICE,
  anyoneCanBuy,
  bankrupt,
  emit,
  isDry,
  isRoundLike,
  mapTeam,
  mapTeams,
  nextTeamId,
  prizeTotal,
  teamById,
  throwOutPuzzle,
} from './engineCore';
import { isVowel, parseLetter } from './letters';
import { insertSpeedUpAfter } from './plan';
import { callLetter, consonantsRemaining, revealAll, sameLetterBonus, vowelsRemaining } from './puzzleState';
import type { Phase, Prize, RoundNo, SpinInfo, TeamId, WheelState } from './types';
import { MYSTERY_PRIZE, TRIP_WEDGE_PRIZE, buildWheel, spinResult, wedgeValue } from './wheels';

/** Phases in which the team in control may be timed out, skipped or have its solve cancelled. */
const LIVE_PHASES: readonly Phase[] = [
  'choose',
  'call-consonant',
  'mystery-choice',
  'express-choice',
  'express-run',
  'solving',
  'speedup-act',
  'speedup-window',
];

/** True when this letter call came so soon after play passed that it must be dropped (FR-044). */
function droppedLetter(s: WheelState, at: number | undefined): boolean {
  return at !== undefined && s.passedAt !== null && at >= s.passedAt && at - s.passedAt < DROP_WINDOW_MS;
}

/** Moves play to the next team. A failed turn that began with nothing to spin for counts toward "all fail". */
export function passTurn(s: WheelState, at?: number): WheelState {
  if (s.turn === null) return s;
  let n: WheelState = s.turnDry ? { ...s, dryFails: s.dryFails + 1 } : s;
  const next = nextTeamId(n, s.turn);
  n = {
    ...n,
    turn: next,
    spin: null,
    lastConsonant: null,
    solve: null,
    phase: n.stage === 'speedup' ? 'speedup-act' : 'choose',
    passedAt: at ?? null,
  };
  n = { ...n, turnDry: isDry(n) };
  n = emit(n, 'turn', { team: next });
  // Every team failed in turn with no consonant to spin for and nobody can buy: thrown out.
  if (n.turnDry && n.dryFails >= n.teams.length && !anyoneCanBuy(n)) return throwOutPuzzle(n);
  return n;
}

/** A turn that ends in Bankrupt: wipe, then pass. */
function bankruptAndPass(s: WheelState, team: TeamId, at?: number): WheelState {
  return passTurn(bankrupt(s, team), at);
}

export function spin(s: WheelState, draw: number): WheelState {
  if (s.stage !== 'round' || s.phase !== 'choose' || s.turn === null || !s.puzzle) return s;
  if (!Number.isFinite(draw) || consonantsRemaining(s.puzzle) === 0) return s;
  const r = spinResult(buildWheel(s.round as RoundNo, s.specials), draw);
  const w = r.effective;
  const team = s.turn;
  const n = emit(s, 'spin', { team, index: r.index, label: w.kind });
  if (w.kind === 'bankrupt') return bankruptAndPass(n, team);
  if (w.kind === 'lose-turn') return passTurn(emit(n, 'lose-turn', { team }));
  const info: SpinInfo = {
    index: r.index,
    kind: w.kind,
    value: wedgeValue(w),
    third: r.third,
    wildCardCall: false,
    earned: 0,
  };
  return { ...n, phase: 'call-consonant', spin: info, lastConsonant: null };
}

/** Pays a correct consonant and claims what its wedge carries. */
function payConsonant(
  s: WheelState,
  team: TeamId,
  letter: string,
  count: number,
  express: boolean,
): WheelState {
  const info = s.spin;
  if (!info || !s.puzzle) return s;
  const bonus = sameLetterBonus(s.puzzle, letter);
  const pay = info.value * count;
  let n = mapTeam(s, team, (t) => ({ ...t, roundCash: t.roundCash + pay + (bonus ? 1000 : 0) }));
  n = { ...n, spin: { ...info, earned: info.earned + pay } };
  n = emit(n, 'letter-correct', { team, letter, count, amount: pay });
  if (bonus) n = emit(n, 'same-letter', { team, letter, amount: 1000 });
  if (express || info.wildCardCall) return n;
  switch (info.kind) {
    case 'wild-card':
      n = mapTeam(n, team, (t) => ({ ...t, wildCard: true }));
      n = { ...n, specials: { ...n.specials, wildCard: false } };
      return emit(n, 'wild-card-claimed', { team });
    case 'million':
      n = mapTeam(n, team, (t) => ({ ...t, millionWedge: 'round' }));
      n = { ...n, specials: { ...n.specials, million: false } };
      return emit(n, 'million-claimed', { team });
    case 'trip':
      n = mapTeam(n, team, (t) => ({ ...t, roundPrizes: [...t.roundPrizes, { ...TRIP_WEDGE_PRIZE }] }));
      n = { ...n, specials: { ...n.specials, trip: false } };
      return emit(n, 'trip-claimed', { team });
    default:
      return n;
  }
}

function consonantCall(s: WheelState, letter: string, at: number | undefined, express: boolean): WheelState {
  const team = s.turn;
  if (team === null || !s.puzzle || !s.spin) return s;
  const r = callLetter(s.puzzle, letter);
  let n: WheelState = { ...s, puzzle: r.state };
  if (r.repeat || r.count === 0) {
    n = emit(n, r.repeat ? 'letter-repeat' : 'letter-miss', { team, letter });
    // On the Express any miss or repeat is a Bankrupt.
    return express ? bankruptAndPass(n, team, at) : passTurn(n, at);
  }
  n = payConsonant({ ...n, puzzle: s.puzzle }, team, letter, r.count, express);
  n = { ...n, puzzle: r.state, dryFails: 0 };
  const info = n.spin;
  if (!info) return n;
  if (express) return { ...n, phase: 'express-run' };
  if (info.wildCardCall) return { ...n, phase: 'choose', lastConsonant: null };
  if (info.kind === 'mystery') return { ...n, phase: 'mystery-choice' };
  if (info.kind === 'express') return { ...n, phase: 'express-choice' };
  return { ...n, phase: 'choose', lastConsonant: info.value > 0 ? info.value : null };
}

export function speedUpCall(s: WheelState, letter: string, at: number | undefined): WheelState {
  const team = s.turn;
  const base = s.speedUp?.value;
  if (team === null || !s.puzzle || base == null) return s;
  const r = callLetter(s.puzzle, letter);
  let n: WheelState = { ...s, puzzle: r.state };
  if (r.repeat || r.count === 0) {
    n = emit(n, r.repeat ? 'letter-repeat' : 'letter-miss', { team, letter });
    return passTurn(n, at);
  }
  // Consonants pay the wedge plus $1,000 each; vowels are free.
  const pay = isVowel(letter) ? 0 : base * r.count;
  const bonus = !isVowel(letter) && sameLetterBonus(s.puzzle, letter);
  n = mapTeam(n, team, (t) => ({ ...t, roundCash: t.roundCash + pay + (bonus ? 1000 : 0) }));
  n = emit(n, 'letter-correct', { team, letter, count: r.count, amount: pay });
  if (bonus) n = emit(n, 'same-letter', { team, letter, amount: 1000 });
  return { ...n, dryFails: 0, phase: 'speedup-window' };
}

export function callLetterAction(s: WheelState, raw: string, at: number | undefined): WheelState {
  const letter = parseLetter(raw);
  if (!isRoundLike(s) || letter === null || !s.puzzle || s.turn === null) return s;
  if (droppedLetter(s, at)) return s;
  switch (s.phase) {
    case 'call-consonant':
      // A vowel called right after a spin is ignored: the team is asked for a consonant.
      return isVowel(letter) ? s : consonantCall(s, letter, at, false);
    case 'express-run':
      return isVowel(letter) ? s : consonantCall(s, letter, at, true);
    case 'speedup-act':
      return speedUpCall(s, letter, at);
    default:
      return s;
  }
}

export function buyVowel(s: WheelState, raw: string, at: number | undefined): WheelState {
  const letter = parseLetter(raw);
  if (s.stage !== 'round' || letter === null || !isVowel(letter) || !s.puzzle || s.turn === null) return s;
  if (s.phase !== 'choose' && s.phase !== 'express-run') return s;
  if (droppedLetter(s, at)) return s;
  const team = teamById(s, s.turn);
  // When every vowel is revealed, vowels can no longer be bought.
  if (!team || team.roundCash < VOWEL_PRICE || vowelsRemaining(s.puzzle) === 0) return s;
  const express = s.phase === 'express-run';
  const r = callLetter(s.puzzle, letter);
  let n = mapTeam(s, team.id, (t) => ({ ...t, roundCash: t.roundCash - VOWEL_PRICE }));
  n = emit({ ...n, puzzle: r.state }, 'vowel-bought', { team: team.id, letter, amount: VOWEL_PRICE });
  if (r.repeat || r.count === 0) {
    n = emit(n, r.repeat ? 'letter-repeat' : 'letter-miss', { team: team.id, letter });
    return express ? bankruptAndPass(n, team.id, at) : passTurn(n, at);
  }
  n = emit(n, 'letter-correct', { team: team.id, letter, count: r.count });
  return { ...n, dryFails: 0, lastConsonant: null, phase: express ? 'express-run' : 'choose' };
}

export function solveStart(s: WheelState): WheelState {
  if (!isRoundLike(s) || s.turn === null || !s.puzzle) return s;
  const ok: Phase[] = ['choose', 'call-consonant', 'express-run', 'speedup-act', 'speedup-window'];
  if (!ok.includes(s.phase)) return s;
  const n = emit(s, 'solve-start', { team: s.turn });
  return { ...n, phase: 'solving', solve: { team: s.turn, from: s.phase } };
}

export function solveCancel(s: WheelState): WheelState {
  if (!isRoundLike(s) || s.phase !== 'solving' || !s.solve) return s;
  return { ...s, phase: s.solve.from, solve: null };
}

/** Banks the round for the solver: round cash plus prizes, raised to $1,000; everyone else is erased. */
function awardRound(s: WheelState, solver: TeamId): WheelState {
  const seg = s.plan[s.planIndex];
  const prizePuzzle = seg?.kind === 'round' && seg.prize ? s.puzzle?.puzzle.prize : undefined;
  const me = teamById(s, solver);
  if (!me) return s;
  const prizes: Prize[] = [...me.roundPrizes, ...(prizePuzzle ? [prizePuzzle] : [])];
  const amount = Math.max(me.roundCash + prizeTotal(prizes), HOUSE_MINIMUM);
  let n = mapTeams(s, (t) =>
    t.id === solver
      ? {
          ...t,
          bank: t.bank + amount,
          prizes: [...t.prizes, ...prizes.map((p) => p.name)],
          roundCash: 0,
          roundPrizes: [],
          millionWedge: t.millionWedge === 'round' ? 'kept' : t.millionWedge,
        }
      : {
          ...t,
          roundCash: 0,
          roundPrizes: [],
          millionWedge: t.millionWedge === 'round' ? 'none' : t.millionWedge,
        },
  );
  n = emit(n, 'round-solved', { team: solver, amount });
  if (me.millionWedge === 'round') n = emit(n, 'million-kept', { team: solver });
  const award = { team: solver, amount, prizes, round: s.round, speedUp: s.stage === 'speedup' };
  return finishRound({ ...n, award }, s);
}

/** Common tail of a solved or unsolved round: reveal, award card, Round 4's extra Speed-Up. */
function finishRound(n: WheelState, before: WheelState): WheelState {
  let out: WheelState = {
    ...n,
    puzzle: n.puzzle ? revealAll(n.puzzle) : n.puzzle,
    phase: 'round-award',
    spin: null,
    lastConsonant: null,
    solve: null,
  };
  const seg = before.plan[before.planIndex];
  // Round 4 finished before the bell: one more $5,000 round opens as the Speed-Up.
  if (before.stage === 'round' && seg?.kind === 'round' && seg.round === 4) {
    out = { ...out, plan: insertSpeedUpAfter(out.plan, out.planIndex) };
  }
  return out;
}

export function solveRuling(s: WheelState, verdict: 'correct' | 'wrong', reversal = false): WheelState {
  if (!isRoundLike(s) || s.phase !== 'solving' || !s.solve || !s.puzzle) return s;
  const { team, from } = s.solve;
  const marked: WheelState = { ...s, lastRuling: { team, verdict, step: s.step + 1 } };
  if (verdict === 'correct') return awardRound(emit(marked, 'solve-correct', { team }), team);
  let n = emit(marked, 'solve-wrong', { team });
  n = { ...n, solve: null };
  // A wrong solve on the Express is a Bankrupt.
  n = from === 'express-run' ? bankruptAndPass(n, team) : passTurn(n);
  // A reversed right ruling: every team has seen the answer, so the puzzle is thrown out.
  return reversal ? throwOutPuzzle(n) : n;
}

export function playWildCard(s: WheelState): WheelState {
  if (s.stage !== 'round' || s.phase !== 'choose' || s.turn === null || !s.puzzle) return s;
  const team = teamById(s, s.turn);
  // Once, after a correct consonant on a dollar value; never on the Express, never in the Speed-Up.
  if (!team?.wildCard || s.lastConsonant === null || consonantsRemaining(s.puzzle) === 0) return s;
  const info: SpinInfo = {
    index: -1,
    kind: 'cash',
    value: s.lastConsonant,
    third: null,
    wildCardCall: true,
    earned: 0,
  };
  const n = mapTeam(s, team.id, (t) => ({ ...t, wildCard: false }));
  return {
    ...emit(n, 'wild-card-played', { team: team.id }),
    phase: 'call-consonant',
    spin: info,
    lastConsonant: null,
  };
}

export function mystery(s: WheelState, choice: 'keep' | 'flip', draw: number | undefined): WheelState {
  if (s.stage !== 'round' || s.phase !== 'mystery-choice' || s.turn === null || !s.spin) return s;
  const team = s.turn;
  const info = s.spin;
  if (choice === 'keep') {
    const n = emit(s, 'mystery-keep', { team, amount: info.earned });
    return { ...n, phase: 'choose', lastConsonant: info.value };
  }
  if (draw === undefined || !Number.isFinite(draw)) return s;
  // The flip gives up the money earned on the wedge. One side hides $10,000, the other Bankrupt.
  let n = mapTeam(s, team, (t) => ({ ...t, roundCash: Math.max(0, t.roundCash - info.earned) }));
  n = { ...n, specials: { ...n.specials, mysteryFlipped: info.index }, spin: null };
  if (draw < 0.5) {
    n = mapTeam(n, team, (t) => ({ ...t, roundPrizes: [...t.roundPrizes, { ...MYSTERY_PRIZE }] }));
    n = emit(n, 'mystery-flip', { team, amount: MYSTERY_PRIZE.value });
    return { ...n, phase: 'choose', lastConsonant: null };
  }
  n = emit(n, 'mystery-flip', { team, amount: 0 });
  return bankruptAndPass(n, team);
}

export function express(s: WheelState, choice: 'play' | 'pass'): WheelState {
  if (s.stage !== 'round' || s.phase !== 'express-choice' || s.turn === null || !s.spin) return s;
  if (choice === 'pass') {
    return { ...emit(s, 'express-pass', { team: s.turn }), phase: 'choose', lastConsonant: s.spin.value };
  }
  return { ...emit(s, 'express-play', { team: s.turn }), phase: 'express-run', lastConsonant: null };
}

export function timeOut(s: WheelState, team: TeamId, at: number | undefined): WheelState {
  if (!isRoundLike(s) || s.turn !== team || !s.puzzle) return s;
  const ok: Phase[] = [
    'choose',
    'call-consonant',
    'mystery-choice',
    'express-choice',
    'express-run',
    'speedup-act',
    'speedup-window',
  ];
  if (!ok.includes(s.phase)) return s;
  const ctx = { team, from: s.phase, spin: s.spin, lastConsonant: s.lastConsonant, dryFails: s.dryFails };
  const n = passTurn(emit(s, 'time-out', { team }), at);
  // If passing threw the puzzle out there is nothing to give back.
  if (n.puzzle !== s.puzzle) return n;
  return { ...n, timedOut: team, timedOutCtx: ctx };
}

/** Gives the solve back to the team that timed out, until the team that got the turn acts. */
export function lateSolve(s: WheelState): WheelState {
  const ctx = s.timedOutCtx;
  if (!isRoundLike(s) || s.timedOut === null || !ctx || s.turn === null || s.turn === ctx.team) return s;
  if (s.phase !== 'choose' && s.phase !== 'speedup-act') return s;
  return {
    ...s,
    turn: ctx.team,
    spin: ctx.spin,
    lastConsonant: ctx.lastConsonant,
    dryFails: ctx.dryFails,
    solve: { team: ctx.team, from: ctx.from },
    phase: 'solving',
    timedOut: null,
    timedOutCtx: null,
  };
}

export function skipTurn(s: WheelState, at?: number): WheelState {
  if (!isRoundLike(s) || s.turn === null || !LIVE_PHASES.includes(s.phase)) return s;
  return passTurn(s, at);
}

export function setTurn(s: WheelState, team: TeamId): WheelState {
  if (!isRoundLike(s) || !teamById(s, team) || !LIVE_PHASES.includes(s.phase)) return s;
  const fresh = s.stage === 'speedup' ? 'speedup-act' : 'choose';
  if (s.turn === team && s.phase === fresh) return s;
  let n: WheelState = {
    ...s,
    turn: team,
    spin: null,
    lastConsonant: null,
    solve: null,
    phase: fresh,
    passedAt: null,
  };
  n = { ...n, turnDry: isDry(n) };
  return emit(n, 'turn', { team });
}

export function throwOutInPlay(s: WheelState): WheelState {
  if (!isRoundLike(s) || !s.puzzle) return s;
  if (s.phase === 'awaiting-puzzles' || s.phase === 'round-award') return s;
  return throwOutPuzzle(s);
}

export function endRoundUnsolved(s: WheelState): WheelState {
  if (!isRoundLike(s) || !s.puzzle) return s;
  if (s.phase === 'awaiting-puzzles' || s.phase === 'round-award') return s;
  let n = mapTeams(s, (t) => ({
    ...t,
    roundCash: 0,
    roundPrizes: [],
    millionWedge: t.millionWedge === 'round' ? 'none' : t.millionWedge,
  }));
  n = emit(n, 'round-unsolved');
  return finishRound(
    { ...n, award: { team: null, amount: 0, prizes: [], round: s.round, speedUp: s.stage === 'speedup' } },
    s,
  );
}

/** Speed-Up: the team in control spins once; non-cash results are spun again. */
export function speedUpSpin(s: WheelState, draw: number): WheelState {
  if (s.stage !== 'speedup' || s.phase !== 'speedup-spin' || s.turn === null || !Number.isFinite(draw))
    return s;
  const r = spinResult(buildWheel(4), draw);
  const w = r.effective;
  const team = s.turn;
  if (w.kind !== 'cash') return emit(s, 'respin', { team, index: r.index, label: w.kind });
  const value = w.value + SPEEDUP_BONUS;
  const n = emit(s, 'spin', { team, index: r.index, amount: value, label: 'cash' });
  return { ...n, speedUp: { value }, phase: 'speedup-act' };
}

/** Converts a round in play into the Speed-Up once the bell has rung and play is at a choice point. */
export function speedUpFromRound(s: WheelState, plan: WheelState['plan']): WheelState {
  const n = emit(
    {
      ...s,
      plan,
      bell: false,
      stage: 'speedup',
      round: 4,
      phase: 'speedup-spin',
      speedUp: { value: null },
      spin: null,
      lastConsonant: null,
    },
    'speedup',
  );
  return n;
}
