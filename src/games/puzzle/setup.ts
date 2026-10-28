/**
 * The setup screen's state: one cursor per player over a grid of memory-card tiles
 * (two rows of levels 1-20, speed, music for player 1, then START).
 */
import { MAX_LEVEL } from '@/engines/puzzle';
import type { Mode, Speed } from '@/engines/puzzle';
import type { MusicChoice } from './cues';

export type SetupRow = 'level-lo' | 'level-hi' | 'speed' | 'music' | 'start';
export type NavDir = 'up' | 'down' | 'left' | 'right';

export const SPEEDS: readonly Speed[] = ['low', 'med', 'hi'];
export const MUSIC_CHOICES: readonly MusicChoice[] = ['a', 'b', 'off'];
export const LEVELS_PER_ROW = MAX_LEVEL / 2;

export interface PlayerSetup {
  level: number;
  speed: Speed;
  ready: boolean;
  /** Index into `rowsFor(player)`. */
  row: number;
  col: number;
}

export interface SetupState {
  mode: Mode;
  players: PlayerSetup[];
  /** Chosen by player 1 and shared by the match. */
  music: MusicChoice;
}

export type SetupAction =
  | { type: 'move'; player: number; dir: NavDir }
  | { type: 'press'; player: number }
  | { type: 'unready'; player: number }
  | { type: 'click'; player: number; row: number; col: number };

/** Only player 1 owns the music row. */
export const rowsFor = (player: number): readonly SetupRow[] =>
  player === 0
    ? ['level-lo', 'level-hi', 'speed', 'music', 'start']
    : ['level-lo', 'level-hi', 'speed', 'start'];

export const rowLength = (row: SetupRow): number => {
  switch (row) {
    case 'level-lo':
    case 'level-hi':
      return LEVELS_PER_ROW;
    case 'speed':
    case 'music':
      return 3;
    case 'start':
      return 1;
  }
};

const levelCol = (level: number): number => (level - 1) % LEVELS_PER_ROW;
const levelRow = (level: number): number => (level > LEVELS_PER_ROW ? 1 : 0);

export const createSetup = (mode: Mode, previous?: SetupState): SetupState => {
  const count = mode === '2p' ? 2 : 1;
  const players: PlayerSetup[] = Array.from({ length: count }, (_, i) => {
    const before = previous?.players[i];
    const level = before?.level ?? 1;
    return { level, speed: before?.speed ?? 'low', ready: false, row: levelRow(level), col: levelCol(level) };
  });
  return { mode, players, music: previous?.music ?? 'a' };
};

export const allReady = (state: SetupState): boolean =>
  state.players.length > 0 && state.players.every((p) => p.ready);

const withPlayer = (state: SetupState, index: number, patch: Partial<PlayerSetup>): SetupState => ({
  ...state,
  players: state.players.map((p, i) => (i === index ? { ...p, ...patch } : p)),
});

/** Column to land on when the cursor enters a row, so it starts on the current value. */
const enterCol = (state: SetupState, player: PlayerSetup, rowName: SetupRow, previousCol: number): number => {
  if (rowName === 'speed') return SPEEDS.indexOf(player.speed);
  if (rowName === 'music') return MUSIC_CHOICES.indexOf(state.music);
  if (rowName === 'start') return 0;
  const wantedRow = rowName === 'level-lo' ? 0 : 1;
  if (levelRow(player.level) === wantedRow) return levelCol(player.level);
  return Math.min(previousCol, LEVELS_PER_ROW - 1);
};

const press = (state: SetupState, index: number, rowName: SetupRow, col: number): SetupState => {
  const player = state.players[index];
  if (!player) return state;
  switch (rowName) {
    case 'level-lo':
    case 'level-hi': {
      const level = (rowName === 'level-hi' ? LEVELS_PER_ROW : 0) + col + 1;
      return level === player.level ? state : withPlayer(state, index, { level });
    }
    case 'speed': {
      const speed = SPEEDS[col];
      return speed === undefined || speed === player.speed ? state : withPlayer(state, index, { speed });
    }
    case 'music': {
      const music = MUSIC_CHOICES[col];
      return music === undefined || music === state.music ? state : { ...state, music };
    }
    case 'start':
      return withPlayer(state, index, { ready: !player.ready });
  }
};

export const reduceSetup = (state: SetupState, action: SetupAction): SetupState => {
  const player = state.players[action.player];
  if (!player) return state;
  const rows = rowsFor(action.player);
  switch (action.type) {
    case 'unready':
      return player.ready ? withPlayer(state, action.player, { ready: false }) : state;
    case 'move': {
      if (player.ready) return state;
      if (action.dir === 'left' || action.dir === 'right') {
        const rowName = rows[player.row];
        if (!rowName) return state;
        const col = Math.max(
          0,
          Math.min(rowLength(rowName) - 1, player.col + (action.dir === 'left' ? -1 : 1)),
        );
        return col === player.col ? state : withPlayer(state, action.player, { col });
      }
      const row = Math.max(0, Math.min(rows.length - 1, player.row + (action.dir === 'up' ? -1 : 1)));
      const target = rows[row];
      if (row === player.row || !target) return state;
      return withPlayer(state, action.player, { row, col: enterCol(state, player, target, player.col) });
    }
    case 'press': {
      const rowName = rows[player.row];
      if (!rowName) return state;
      if (player.ready && rowName !== 'start') return state;
      return press(state, action.player, rowName, player.col);
    }
    case 'click': {
      const rowName = rows[action.row];
      if (!rowName || action.col < 0 || action.col >= rowLength(rowName)) return state;
      const moved = withPlayer(state, action.player, { row: action.row, col: action.col });
      if (player.ready && rowName !== 'start') return moved;
      return press(moved, action.player, rowName, action.col);
    }
  }
};
