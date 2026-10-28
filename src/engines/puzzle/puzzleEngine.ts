/**
 * Capsule puzzle reducer: `(state, action) => state`. Implements the corrected reference tick of
 * docs/PUZZLE_GAME_MECHANICS.md section 11 with time-based gravity (FR-061) and this project's
 * scoring and versus design (FR-062, design.md 8.4).
 *
 * One gravity step per player does exactly one of: clear matches, drop loose pieces one row, lock
 * the capsule, or move it down one row (priority clear > fall > lock > move, section 2.5). The same
 * order is used in both modes (the source's versus ordering was broken, section 7.5). A new capsule
 * spawns as soon as the board has nothing left to resolve. All randomness comes from the seeded
 * generator whose state lives in `rngState`, so a replay from a seed is bit-identical.
 */
import {
  applyGravityStep,
  clearCells,
  countGerms,
  createEmptyBoard,
  findRuns,
  hasPendingWork,
  isCapsuleSupported,
  lockCapsule,
  placeGerms,
  rotateCapsule,
  runCells,
  spawnCapsule,
  tryMove,
} from './board';
import { createStatefulRng } from './rng';
import type { StatefulRng } from './rng';
import { GRAVITY_MS, clearPoints, levelClearBonus } from './scoring';
import { MAX_LEVEL } from './types';
import type {
  Capsule,
  Color,
  MatchState,
  PlayerState,
  PuzzleAction,
  PuzzleEvent,
  PuzzleEventBody,
  Speed,
} from './types';
import { dropGarbage, garbageForRuns, hasWonMatch, pickGarbageColumns } from './versus';

const MAX_EVENTS = 128;
const MAX_STEPS_PER_TICK = 5000;
const SPEEDS: readonly Speed[] = ['low', 'med', 'hi'];

interface Draft {
  m: MatchState;
  rng: StatefulRng;
}

export function createPuzzleState(): MatchState {
  return {
    mode: '1p',
    players: [],
    roundWins: [],
    round: 0,
    status: 'idle',
    roundWinner: null,
    matchWinner: null,
    seed: 0,
    rngState: 0,
    events: [],
    nextSeq: 1,
  };
}

// ---------------------------------------------------------------------------------------------
// Draft helpers
// ---------------------------------------------------------------------------------------------

function begin(state: MatchState): Draft {
  const m = JSON.parse(JSON.stringify(state)) as MatchState;
  return { m, rng: createStatefulRng(state.rngState) };
}

function finish(d: Draft): MatchState {
  d.m.rngState = d.rng.getState();
  return d.m;
}

function emit(d: Draft, body: PuzzleEventBody): void {
  const event: PuzzleEvent = { ...body, seq: d.m.nextSeq };
  d.m.nextSeq += 1;
  d.m.events.push(event);
  if (d.m.events.length > MAX_EVENTS) d.m.events.splice(0, d.m.events.length - MAX_EVENTS);
}

/** Function form so control flow does not assume the status is unchanged after a reducer step. */
function isPlaying(d: Draft): boolean {
  return d.m.status === 'playing';
}

function player(d: Draft, index: number): PlayerState {
  const p = d.m.players[index];
  if (!p) throw new Error(`no player ${index}`);
  return p;
}

function drawColor(d: Draft): Color {
  return (1 + Math.floor(d.rng.next() * 3)) as Color;
}

/** Two independent uniform draws, main half first (docs section 1). */
function drawColors(d: Draft): [Color, Color] {
  const a = drawColor(d);
  const b = drawColor(d);
  return [a, b];
}

function newPlayer(d: Draft, level: number, speed: Speed, previous?: PlayerState): PlayerState {
  const board = createEmptyBoard();
  const placed = placeGerms(board, level, () => d.rng.next());
  const next = drawColors(d);
  const prevStats = previous?.stats;
  return {
    board,
    active: null,
    next,
    level,
    speed,
    score: previous?.score ?? 0,
    germsLeft: placed,
    status: 'clearing',
    gravityMs: GRAVITY_MS[speed],
    gravityAcc: 0,
    pendingGarbage: [],
    cascadeIndex: 0,
    stats: {
      germsStart: placed,
      capsulesLocked: prevStats?.capsulesLocked ?? 0,
      germsCleared: prevStats?.germsCleared ?? 0,
      clearSteps: prevStats?.clearSteps ?? 0,
      maxCascade: prevStats?.maxCascade ?? 0,
      garbageSent: prevStats?.garbageSent ?? 0,
      garbageReceived: prevStats?.garbageReceived ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Round flow
// ---------------------------------------------------------------------------------------------

function finishRound(d: Draft, winner: number): void {
  const m = d.m;
  m.roundWinner = winner;
  m.roundWins[winner] = (m.roundWins[winner] ?? 0) + 1;
  emit(d, { type: 'round-won', player: winner, round: m.round });
  if (m.mode === '2p' && hasWonMatch(m.roundWins[winner] ?? 0)) {
    m.matchWinner = winner;
    m.status = 'match-over';
    emit(d, { type: 'match-won', player: winner });
  } else {
    m.status = 'round-over';
  }
}

/** Ends the round or match when player `index` has just topped out or cleared every germ. */
function evaluateRound(d: Draft, index: number): void {
  if (d.m.status !== 'playing') return;
  const pl = player(d, index);
  if (pl.status === 'topped-out') {
    if (d.m.mode === '1p') {
      d.m.roundWinner = null;
      d.m.status = 'match-over';
    } else {
      finishRound(d, index === 0 ? 1 : 0);
    }
  } else if (pl.status === 'cleared') {
    finishRound(d, index);
  }
}

function spawnFor(d: Draft, index: number): void {
  const pl = player(d, index);
  // Top-out is decided here: a locked half left on either spawn cell blocks the new capsule
  // (the source only tested one cell in 1P and never tested overlap at spawn).
  const cap = spawnCapsule(pl.board, pl.next);
  if (!cap) {
    pl.active = null;
    pl.status = 'topped-out';
    emit(d, { type: 'top-out', player: index });
    return;
  }
  pl.active = cap;
  pl.next = drawColors(d);
  pl.status = 'playing';
  emit(d, { type: 'spawn', player: index, capsule: cap });
}

/** After any action on a player: spawn when nothing is left to resolve, else mark clearing. */
function settle(d: Draft, index: number): void {
  const pl = player(d, index);
  if (pl.status === 'topped-out' || pl.status === 'cleared') return;
  if (pl.active) {
    pl.status = 'playing';
    return;
  }
  if (hasPendingWork(pl.board)) {
    pl.status = 'clearing';
    return;
  }
  spawnFor(d, index);
}

// ---------------------------------------------------------------------------------------------
// One gravity step
// ---------------------------------------------------------------------------------------------

function clearStep(d: Draft, index: number): boolean {
  const pl = player(d, index);
  const runs = findRuns(pl.board);
  if (runs.length === 0) return false;
  const cells = runCells(pl.board, runs);
  const cascadeIndex = pl.cascadeIndex;
  const germs = clearCells(pl.board, cells);
  emit(d, { type: 'clear', player: index, cells, cascadeIndex });
  if (cascadeIndex > 0) emit(d, { type: 'cascade', player: index, index: cascadeIndex });
  pl.cascadeIndex += 1;
  pl.stats.clearSteps += 1;
  pl.stats.maxCascade = Math.max(pl.stats.maxCascade, cascadeIndex);
  pl.germsLeft = countGerms(pl.board);
  if (germs > 0) {
    const points = clearPoints(germs, pl.speed, cascadeIndex);
    pl.score += points;
    pl.stats.germsCleared += germs;
    emit(d, { type: 'germ-cleared', player: index, count: germs, points, germsLeft: pl.germsLeft });
  }
  if (d.m.mode === '2p') {
    const colors = garbageForRuns(runs);
    if (colors.length > 0) {
      const to = index === 0 ? 1 : 0;
      player(d, to).pendingGarbage.push(...colors);
      pl.stats.garbageSent += colors.length;
      emit(d, { type: 'garbage-sent', player: index, to, colors });
    }
  }
  if (germs > 0 && pl.germsLeft === 0) {
    const bonus = levelClearBonus(pl.level);
    pl.score += bonus;
    pl.active = null;
    pl.status = 'cleared';
    emit(d, { type: 'level-clear', player: index, level: pl.level, bonus });
  }
  return true;
}

function lockActive(d: Draft, index: number, hard: boolean): void {
  const pl = player(d, index);
  const cap = pl.active;
  if (!cap) return;
  const cells = lockCapsule(pl.board, cap);
  pl.active = null;
  pl.cascadeIndex = 0;
  pl.stats.capsulesLocked += 1;
  emit(d, { type: 'lock', player: index, cells, hard });
  if (pl.pendingGarbage.length > 0) {
    const colors = pl.pendingGarbage.splice(0, pl.pendingGarbage.length);
    const columns = pickGarbageColumns(colors.length, () => d.rng.next());
    const placed = dropGarbage(pl.board, colors, columns);
    if (placed.length > 0) {
      pl.stats.garbageReceived += placed.length;
      emit(d, {
        type: 'garbage-received',
        player: index,
        colors: placed.map((p) => p.color),
        columns: placed.map((p) => p.col),
      });
    }
  }
}

function stepPlayer(d: Draft, index: number): void {
  const pl = player(d, index);
  if (pl.status !== 'playing' && pl.status !== 'clearing') return;
  if (clearStep(d, index)) {
    // handled
  } else if (applyGravityStep(pl.board) > 0) {
    emit(d, { type: 'fall', player: index });
  } else if (pl.active) {
    if (isCapsuleSupported(pl.board, pl.active)) {
      lockActive(d, index, false);
    } else {
      const moved = tryMove(pl.board, pl.active, 1, 0);
      if (moved) {
        pl.active = moved;
        emit(d, { type: 'move', player: index, dir: 'down', auto: true, capsule: moved });
      }
    }
  }
  settle(d, index);
}

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------

function validLevel(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= MAX_LEVEL;
}

function newMatch(state: MatchState, action: Extract<PuzzleAction, { type: 'NEW_MATCH' }>): MatchState {
  const count = action.mode === '2p' ? 2 : 1;
  if (!Number.isInteger(action.seed)) return state;
  if (action.levels.length < count || action.speeds.length < count) return state;
  for (let i = 0; i < count; i++) {
    const level = action.levels[i];
    const speed = action.speeds[i];
    if (level === undefined || !validLevel(level)) return state;
    if (speed === undefined || !SPEEDS.includes(speed)) return state;
  }
  const d: Draft = {
    m: {
      ...createPuzzleState(),
      mode: action.mode,
      seed: action.seed,
      roundWins: Array.from({ length: count }, () => 0),
      round: 1,
    },
    rng: createStatefulRng(action.seed),
  };
  for (let i = 0; i < count; i++) {
    d.m.players.push(newPlayer(d, action.levels[i] ?? 1, action.speeds[i] ?? 'low'));
  }
  return finish(d);
}

function startRound(state: MatchState): MatchState {
  if (state.status !== 'idle' || state.players.length === 0) return state;
  const d = begin(state);
  d.m.status = 'playing';
  for (let i = 0; i < d.m.players.length; i++) {
    spawnFor(d, i);
    evaluateRound(d, i);
    if (!isPlaying(d)) break;
  }
  return finish(d);
}

function nextRound(state: MatchState): MatchState {
  if (state.status !== 'round-over') return state;
  const d = begin(state);
  d.m.round += 1;
  d.m.roundWinner = null;
  d.m.status = 'idle';
  d.m.players = d.m.players.map((p) => {
    // 1P: level +1 after a clear, capped at the top level; versus replays the same levels.
    const level = d.m.mode === '1p' ? Math.min(MAX_LEVEL, p.level + 1) : p.level;
    return newPlayer(d, level, p.speed, p);
  });
  return finish(d);
}

function applyInput(state: MatchState, action: Extract<PuzzleAction, { type: 'INPUT' }>): MatchState {
  if (state.status !== 'playing') return state;
  const pl = state.players[action.player];
  const cap = pl?.active;
  if (!pl || !cap || pl.status !== 'playing') return state;

  let result: Capsule | null = null;
  let landed = cap;
  switch (action.input) {
    case 'left':
      result = tryMove(pl.board, cap, 0, -1);
      break;
    case 'right':
      result = tryMove(pl.board, cap, 0, 1);
      break;
    case 'down':
      result = tryMove(pl.board, cap, 1, 0);
      break;
    case 'rotate-cw':
      result = rotateCapsule(pl.board, cap, 'cw');
      break;
    case 'rotate-ccw':
      result = rotateCapsule(pl.board, cap, 'ccw');
      break;
    case 'hard-drop': {
      let next = tryMove(pl.board, landed, 1, 0);
      while (next) {
        landed = next;
        next = tryMove(pl.board, landed, 1, 0);
      }
      result = landed;
      break;
    }
  }
  if (!result) return state;

  const d = begin(state);
  const target = player(d, action.player);
  target.active = result;
  switch (action.input) {
    case 'left':
    case 'right':
    case 'down':
      emit(d, { type: 'move', player: action.player, dir: action.input, auto: false, capsule: result });
      break;
    case 'rotate-cw':
    case 'rotate-ccw':
      emit(d, {
        type: 'rotate',
        player: action.player,
        dir: action.input === 'rotate-cw' ? 'cw' : 'ccw',
        capsule: result,
      });
      break;
    case 'hard-drop':
      lockActive(d, action.player, true);
      settle(d, action.player);
      evaluateRound(d, action.player);
      break;
  }
  return finish(d);
}

function tick(state: MatchState, ms: number): MatchState {
  if (state.status !== 'playing' || !Number.isFinite(ms) || ms <= 0) return state;
  const d = begin(state);
  for (const pl of d.m.players) {
    if (pl.status === 'playing' || pl.status === 'clearing') pl.gravityAcc += ms;
  }
  let steps = 0;
  let progressed = true;
  // Players take turns one step at a time so a long frame does not favour player 0.
  while (progressed && isPlaying(d) && steps < MAX_STEPS_PER_TICK) {
    progressed = false;
    for (let i = 0; i < d.m.players.length; i++) {
      const pl = player(d, i);
      if ((pl.status !== 'playing' && pl.status !== 'clearing') || pl.gravityAcc < pl.gravityMs) continue;
      pl.gravityAcc -= pl.gravityMs;
      stepPlayer(d, i);
      evaluateRound(d, i);
      steps++;
      progressed = true;
      if (!isPlaying(d)) break;
    }
  }
  return finish(d);
}

export function reducePuzzle(state: MatchState, action: PuzzleAction): MatchState {
  switch (action.type) {
    case 'NEW_MATCH':
      return newMatch(state, action);
    case 'START_ROUND':
      return startRound(state);
    case 'INPUT':
      return applyInput(state, action);
    case 'TICK':
      return tick(state, action.ms);
    case 'PAUSE': {
      if (state.status !== 'playing') return state;
      const d = begin(state);
      d.m.status = 'paused';
      emit(d, { type: 'paused' });
      return finish(d);
    }
    case 'RESUME': {
      if (state.status !== 'paused') return state;
      const d = begin(state);
      d.m.status = 'playing';
      emit(d, { type: 'resumed' });
      return finish(d);
    }
    case 'NEXT_ROUND':
      return nextRound(state);
  }
}
