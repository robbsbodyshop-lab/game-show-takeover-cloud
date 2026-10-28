/**
 * Rules: docs/WHEEL_OF_FORTUNE_RULES.md, "Episode structure" and "The Bonus Round" (tiebreaker, consolation).
 * Moving through the plan: entering a segment (which asks for puzzles), starting it once they arrive,
 * the finale (consolation, tiebreaker) and the end of the game.
 */
import { beginBonus, topTeamId } from './bonusFlow';
import {
  emit,
  firstTeamId,
  installNextPuzzle,
  isDry,
  mapTeams,
  nextTeamId,
  requestPuzzles,
  resetForNewPuzzle,
} from './engineCore';
import { collapseToSpeedUp, TIEBREAK_VALUE } from './plan';
import type { Segment, WheelState } from './types';

function pickStarter(s: WheelState): number {
  if (s.nextStarter !== null) return s.nextStarter;
  // Round 2 starts with the team after the Round 1 starter, Round 3 with the team after that.
  if (s.lastStarter !== null) return nextTeamId(s, s.lastStarter);
  return firstTeamId(s);
}

/** Clears everything that belongs to the previous segment. */
function clearedForSegment(s: WheelState): WheelState {
  return {
    ...s,
    puzzle: null,
    queue: [],
    spin: null,
    lastConsonant: null,
    solve: null,
    speedUp: null,
    award: null,
    lastRuling: null,
    tossup: null,
    frenzy: null,
    triple: null,
    turn: null,
    turnDry: false,
    dryFails: 0,
    passedAt: null,
    round: 0,
  };
}

export function enterSegment(state: WheelState): WheelState {
  let s = state;
  let seg: Segment | undefined = s.plan[s.planIndex];
  if (!seg) return gameOver(s);
  // The bell: a round or the Triple Toss-Up still to come becomes the Speed-Up.
  if (s.bell && (seg.kind === 'round' || seg.kind === 'triple')) {
    s = { ...s, plan: collapseToSpeedUp(s.plan, s.planIndex), bell: false };
    seg = s.plan[s.planIndex];
    if (!seg) return gameOver(s);
  }
  s = emit(clearedForSegment(s), 'segment', {
    label: seg.kind,
    index: s.planIndex,
    ...(seg.kind === 'round' ? { count: seg.round } : {}),
  });

  switch (seg.kind) {
    case 'tossup':
      return requestPuzzles(
        {
          ...s,
          stage: 'tossup',
          tossup: {
            value: seg.value,
            starter: seg.starter,
            buzzed: null,
            buzzedAt: null,
            eligible: null,
            solver: null,
          },
        },
        { use: 'tossup', count: 2 },
        'start',
        null,
      );
    case 'frenzy':
      return requestPuzzles(
        {
          ...s,
          stage: 'frenzy',
          tossup: {
            value: seg.value,
            starter: true,
            buzzed: null,
            buzzedAt: null,
            eligible: null,
            solver: null,
          },
          frenzy: {
            durationMs: seg.durationMs,
            msLeft: seg.durationMs,
            started: false,
            expired: false,
            lastSolver: null,
            solved: 0,
            category: null,
          },
        },
        // The first six puzzles plus four spares, all from one category.
        { use: 'tossup', count: 10 },
        'start',
        null,
      );
    case 'triple':
      return requestPuzzles(
        {
          ...s,
          stage: 'triple',
          tossup: {
            value: seg.value,
            starter: true,
            buzzed: null,
            buzzedAt: null,
            eligible: null,
            solver: null,
          },
          triple: { index: 0, solvers: [null, null, null], sweep: seg.sweep, value: seg.value },
        },
        { use: 'triple', count: 3 },
        'start',
        null,
      );
    case 'round': {
      const specials = seg.round === 2 ? { ...s.specials, mysteryFlipped: null } : s.specials;
      return requestPuzzles(
        { ...s, stage: 'round', round: seg.round, specials },
        { use: seg.prize ? 'prize' : 'round', count: 2 },
        'start',
        null,
      );
    }
    case 'speedup':
      return requestPuzzles({ ...s, stage: 'speedup', round: 4 }, { use: 'round', count: 2 }, 'start', null);
    case 'finale':
      return finale(s);
    case 'tiebreak': {
      const top = Math.max(...s.teams.map((t) => t.bank));
      const tied = s.teams.filter((t) => t.bank === top).map((t) => t.id);
      if (tied.length < 2) return advance(s);
      return requestPuzzles(
        {
          ...s,
          stage: 'tiebreak',
          tossup: {
            value: seg.value,
            starter: false,
            buzzed: null,
            buzzedAt: null,
            eligible: tied,
            solver: null,
          },
        },
        { use: 'tiebreak', count: 2 },
        'start',
        null,
      );
    }
    case 'bonus':
      return requestPuzzles({ ...s, stage: 'bonus' }, { use: 'bonus', count: 3 }, 'start', null);
  }
}

/** Consolation: a team that won nothing gets $1,000. Then a tie for first is broken by a toss-up. */
function finale(s: WheelState): WheelState {
  let n = s;
  for (const t of s.teams) {
    if (t.bank === 0) {
      n = mapTeams(n, (x) => (x.id === t.id ? { ...x, bank: 1000 } : x));
      n = emit(n, 'consolation', { team: t.id, amount: 1000 });
    }
  }
  const plan = [...n.plan];
  plan.splice(n.planIndex + 1, 0, { kind: 'tiebreak', value: TIEBREAK_VALUE });
  return advance({ ...n, plan });
}

export function advance(s: WheelState): WheelState {
  return enterSegment({ ...s, planIndex: s.planIndex + 1 });
}

/** The requested puzzles arrived: put the first one in play and open the segment. */
export function beginSegment(s: WheelState): WheelState {
  const base: WheelState = { ...s, request: null, awaiting: null, resumePhase: null };
  switch (s.stage) {
    case 'tossup':
    case 'frenzy':
    case 'triple':
    case 'tiebreak': {
      const installed = installNextPuzzle(base);
      return installed ? resetForNewPuzzle(installed) : s;
    }
    case 'round':
    case 'speedup': {
      const installed = installNextPuzzle(base);
      if (!installed) return s;
      const starter = pickStarter(installed);
      let n: WheelState = {
        ...installed,
        turn: starter,
        lastStarter: starter,
        nextStarter: null,
        phase: s.stage === 'speedup' ? 'speedup-spin' : 'choose',
        speedUp: s.stage === 'speedup' ? { value: null } : null,
        spin: null,
        lastConsonant: null,
        solve: null,
        award: null,
        dryFails: 0,
        passedAt: null,
      };
      n = { ...n, turnDry: isDry(n) };
      return emit(n, 'turn', { team: starter });
    }
    case 'bonus': {
      const options = base.queue;
      if (options.length === 0) return s;
      return emit(beginBonus({ ...base, queue: [] }, options), 'turn', { team: topTeamId(base) });
    }
    default:
      return s;
  }
}

export function gameOver(s: WheelState): WheelState {
  const winnerId = topTeamId(s);
  const n = emit(
    {
      ...s,
      stage: 'game-over',
      phase: 'done',
      request: null,
      awaiting: null,
      resumePhase: null,
      outcome: { winnerId },
    },
    'game-over',
    { team: winnerId },
  );
  return n;
}
