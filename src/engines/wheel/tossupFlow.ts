/**
 * Toss-ups, Fortune Frenzy, the Triple Toss-Up and the tiebreaker.
 * Rules: docs/WHEEL_OF_FORTUNE_RULES.md, "Toss-ups" and "Episode structure".
 */
import {
  emit,
  firstTeamId,
  installNextPuzzle,
  isTossupLike,
  mapTeam,
  mapTeams,
  requestPuzzles,
  resetForNewPuzzle,
  teamById,
  throwOutPuzzle,
} from './engineCore';
import { hiddenTileIndices, litCount, revealAll, revealTile } from './puzzleState';
import type { TeamId, WheelState } from './types';

function bankTossup(s: WheelState, team: TeamId, amount: number): WheelState {
  return mapTeam(s, team, (t) => ({ ...t, bank: t.bank + amount }));
}

/** Puts the first queued puzzle in play for the toss-up family and opens the reveal. */
export function beginTossupPuzzle(s: WheelState): WheelState {
  const installed = installNextPuzzle(s);
  if (!installed) return s;
  return resetForNewPuzzle(installed);
}

export function tossupRevealNext(s: WheelState, draw: number): WheelState {
  if (!isTossupLike(s) || s.phase !== 'tossup-reveal' || !s.puzzle || !Number.isFinite(draw)) return s;
  const hidden = hiddenTileIndices(s.puzzle);
  if (hidden.length === 0) return s;
  const pick = hidden[Math.min(Math.floor(Math.max(draw, 0) * hidden.length), hidden.length - 1)];
  if (pick === undefined) return s;
  let n: WheelState = { ...s, puzzle: revealTile(s.puzzle, pick) };
  n = emit(n, 'tile-revealed', { index: pick });
  if (n.stage === 'frenzy' && n.frenzy && !n.frenzy.started) {
    n = {
      ...n,
      frenzy: { ...n.frenzy, started: true, category: n.frenzy.category ?? s.puzzle.puzzle.category },
    };
  }
  if (n.puzzle && hiddenTileIndices(n.puzzle).length === 0) n = puzzleFilledIn(n);
  return n;
}

/** The puzzle filled in: nobody wins it. Frenzy moves on; every other toss-up is over. */
function puzzleFilledIn(s: WheelState): WheelState {
  const n = emit(s, 'tossup-filled');
  if (n.stage === 'frenzy') return frenzyMoveOn(n);
  return { ...n, phase: 'tossup-done' };
}

/** Reveal is complete when every tile is lit or queued; toss-up tiles are lit directly. */
export function tossupBuzz(s: WheelState, team: TeamId, at: number): WheelState {
  if (!isTossupLike(s) || s.phase !== 'tossup-reveal' || !s.puzzle || !s.tossup) return s;
  const t = teamById(s, team);
  if (!t || t.lockedOut) return s;
  // A buzz before the first letter shows does nothing.
  if (litCount(s.puzzle) === 0) return s;
  if (s.tossup.eligible && !s.tossup.eligible.includes(team)) return s;
  const n = emit(s, 'buzz', { team });
  return { ...n, phase: 'tossup-answer', tossup: { ...s.tossup, buzzed: team, buzzedAt: at } };
}

export function tossupAnswer(
  s: WheelState,
  team: TeamId,
  verdict: 'correct' | 'wrong',
  reversal = false,
): WheelState {
  if (!isTossupLike(s) || s.phase !== 'tossup-answer' || !s.puzzle || !s.tossup) return s;
  if (s.tossup.buzzed !== team) return s;
  let n: WheelState = {
    ...s,
    lastRuling: { team, verdict, step: s.step + 1 },
  };
  const value = s.stage === 'triple' && s.triple ? s.triple.value : s.tossup.value;

  if (verdict === 'correct') {
    n = bankTossup(n, team, value);
    n = emit(n, 'tossup-correct', { team, amount: value });
    n = { ...n, puzzle: revealAll(s.puzzle), tossup: { ...s.tossup, solver: team } };
    if (n.stage === 'frenzy' && n.frenzy) {
      n = { ...n, frenzy: { ...n.frenzy, lastSolver: team, solved: n.frenzy.solved + 1 } };
      return frenzyMoveOn(n);
    }
    if (n.stage === 'triple' && n.triple) {
      const tr = n.triple;
      const solvers = [...tr.solvers];
      solvers[tr.index] = team;
      n = { ...n, triple: { ...tr, solvers } };
      // Sweeping all three adds the $4,000.
      if (tr.index === 2 && solvers.every((x) => x === team)) {
        n = bankTossup(n, team, tr.sweep);
        n = emit(n, 'sweep', { team, amount: tr.sweep });
      }
    }
    return { ...n, phase: 'tossup-done' };
  }

  n = emit(n, 'tossup-wrong', { team });
  if (n.stage === 'frenzy') {
    // A wrong Frenzy answer throws the puzzle out and the next one starts.
    return frenzyMoveOn(emit(n, 'puzzle-thrown-out'));
  }
  n = mapTeam(n, team, (t) => ({ ...t, lockedOut: true }));
  n = { ...n, phase: 'tossup-reveal', tossup: { ...s.tossup, buzzed: null, buzzedAt: null } };
  // A reversed right ruling: every team has seen the answer, so the puzzle is thrown out.
  if (reversal) return throwOutPuzzle(n);
  if (n.puzzle && hiddenTileIndices(n.puzzle).length === 0) return puzzleFilledIn(n);
  return n;
}

/** Frenzy: after a solve, a wrong answer or a filled-in puzzle, the next puzzle or the end. */
function frenzyMoveOn(s: WheelState): WheelState {
  const f = s.frenzy;
  if (!f) return s;
  if (f.expired || f.msLeft <= 0) return endFrenzy(s);
  const installed = installNextPuzzle(s);
  if (installed) return resetForNewPuzzle(installed);
  const category = f.category ?? s.puzzle?.puzzle.category;
  return requestPuzzles(
    s,
    { use: 'tossup', count: 4, ...(category ? { category } : {}) },
    'replace',
    'tossup-reveal',
  );
}

function endFrenzy(s: WheelState): WheelState {
  const f = s.frenzy;
  if (!f) return s;
  const n = emit(s, 'frenzy-end', { count: f.solved });
  return {
    ...n,
    puzzle: n.puzzle ? revealAll(n.puzzle) : n.puzzle,
    request: null,
    awaiting: null,
    resumePhase: null,
    phase: 'tossup-done',
    frenzy: { ...f, msLeft: 0 },
    tossup: n.tossup ? { ...n.tossup, buzzed: null, buzzedAt: null, solver: f.lastSolver } : n.tossup,
  };
}

/** The 30-second clock; it keeps running while a team answers (the answer in flight still counts). */
export function frenzyTick(s: WheelState, ms: number): WheelState {
  const f = s.frenzy;
  if (s.stage !== 'frenzy' || !f || !f.started || f.expired || s.phase === 'tossup-done') return s;
  if (!Number.isFinite(ms) || ms <= 0) return s;
  const msLeft = Math.max(0, f.msLeft - ms);
  if (msLeft > 0) return { ...s, frenzy: { ...f, msLeft } };
  if (s.phase === 'tossup-answer') return { ...s, frenzy: { ...f, msLeft: 0, expired: true } };
  return endFrenzy({ ...s, frenzy: { ...f, msLeft: 0 } });
}

/** Host: End unsolved on a toss-up, triple or tiebreaker puzzle (no winner). */
export function endTossupUnsolved(s: WheelState): WheelState {
  if (!isTossupLike(s) || !s.puzzle || s.stage === 'frenzy') return s;
  if (s.phase !== 'tossup-reveal' && s.phase !== 'tossup-answer') return s;
  const n = emit(s, 'tossup-filled');
  return {
    ...n,
    puzzle: n.puzzle ? revealAll(n.puzzle) : n.puzzle,
    phase: 'tossup-done',
    tossup: n.tossup ? { ...n.tossup, buzzed: null, buzzedAt: null } : n.tossup,
  };
}

/** After a Triple Toss-Up puzzle: the next of the three, or null when all three were played. */
export function nextTriplePuzzle(s: WheelState): WheelState | null {
  const tr = s.triple;
  if (s.stage !== 'triple' || !tr || tr.index >= 2) return null;
  let n: WheelState = { ...s, triple: { ...tr, index: tr.index + 1 } };
  const installed = installNextPuzzle(n);
  if (installed) return resetForNewPuzzle(installed);
  n = requestPuzzles(
    n,
    { use: 'triple', count: 1, ...(s.puzzle ? { category: s.puzzle.puzzle.category } : {}) },
    'replace',
    'tossup-reveal',
  );
  return n;
}

/** Who starts the next round after a toss-up family stage: the solver, else the first team in play order. */
export function starterAfter(s: WheelState): TeamId {
  if (s.stage === 'triple' && s.triple) return s.triple.solvers[2] ?? firstTeamId(s);
  return s.tossup?.solver ?? firstTeamId(s);
}

export function unlockAll(s: WheelState): WheelState {
  return mapTeams(s, (t) => (t.lockedOut ? { ...t, lockedOut: false } : t));
}
