/**
 * Read-only views for the renderer and HUD. Nothing here mutates state.
 */
import { capsuleHalves, cellAt } from './board';
import type { Color, Dir, MatchState, PlayerState, PlayerStatus, Speed } from './types';
import { COLS, ROWS } from './types';

export type CellView =
  | { kind: 'empty' }
  | { kind: 'germ'; color: Color }
  | { kind: 'half'; color: Color; partnerDir: Dir | null; active: boolean };

/** `view[row][col]`: the locked board with the falling capsule drawn on top. */
export function boardView(player: PlayerState): CellView[][] {
  const view: CellView[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: CellView[] = [];
    for (let c = 0; c < COLS; c++) {
      const cell = cellAt(player.board, r, c);
      if (!cell || cell.kind === 'empty') row.push({ kind: 'empty' });
      else if (cell.kind === 'germ') row.push({ kind: 'germ', color: cell.color });
      else row.push({ kind: 'half', color: cell.color, partnerDir: cell.partnerDir, active: false });
    }
    view.push(row);
  }
  if (player.active) {
    for (const h of capsuleHalves(player.active)) {
      const line = view[h.row];
      if (line && h.col >= 0 && h.col < COLS) {
        line[h.col] = { kind: 'half', color: h.color, partnerDir: h.partnerDir, active: true };
      }
    }
  }
  return view;
}

export interface Hud {
  level: number;
  speed: Speed;
  score: number;
  germsLeft: number;
  germsStart: number;
  next: [Color, Color];
  status: PlayerStatus;
  pendingGarbage: number;
  cascadeIndex: number;
}

export function hud(player: PlayerState): Hud {
  return {
    level: player.level,
    speed: player.speed,
    score: player.score,
    germsLeft: player.germsLeft,
    germsStart: player.stats.germsStart,
    next: player.next,
    status: player.status,
    pendingGarbage: player.pendingGarbage.length,
    cascadeIndex: player.cascadeIndex,
  };
}

export function isRoundOver(match: MatchState): boolean {
  return match.status === 'round-over' || match.status === 'match-over';
}

export function isMatchOver(match: MatchState): boolean {
  return match.status === 'match-over';
}

/** Index of the player who won the finished round; null while playing or after a 1P top-out. */
export function winnerOfRound(match: MatchState): number | null {
  return isRoundOver(match) ? match.roundWinner : null;
}

export function winnerOfMatch(match: MatchState): number | null {
  return match.matchWinner;
}

/** Events the renderer has not seen yet (`seq` greater than the last one it handled). */
export function eventsSince(match: MatchState, lastSeq: number): MatchState['events'] {
  return match.events.filter((e) => e.seq > lastSeq);
}
