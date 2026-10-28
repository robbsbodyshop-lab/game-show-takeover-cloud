/** Keyboard layout: player 1 on WASD + Space, player 2 on the arrows + Enter, Esc to go back. */
import type { PuzzleInput } from '@/engines/puzzle';
import type { NavDir } from './setup';

export interface KeyLike {
  key: string;
  repeat?: boolean;
}

export type KeyIntent =
  | { kind: 'nav'; player: number; dir: NavDir }
  | { kind: 'confirm'; player: number }
  | { kind: 'back' }
  | { kind: 'pause' }
  | { kind: 'move'; player: number; input: PuzzleInput };

const name = (key: string): string => (key.length === 1 ? key.toLowerCase() : key);

const P1_NAV: Record<string, NavDir> = { w: 'up', s: 'down', a: 'left', d: 'right' };
const P2_NAV: Record<string, NavDir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

const P1_MOVE: Record<string, PuzzleInput> = {
  a: 'left',
  d: 'right',
  s: 'down',
  w: 'rotate-cw',
  e: 'rotate-cw',
  q: 'rotate-ccw',
  ' ': 'hard-drop',
};
const P2_MOVE: Record<string, PuzzleInput> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'down',
  ArrowUp: 'rotate-cw',
  '/': 'rotate-ccw',
  '.': 'rotate-ccw',
  Enter: 'hard-drop',
};

/**
 * Menus: `soloFallback` makes the second player's keys drive player 1 when only one player is
 * in the game (title screen, 1P setup, 1P match).
 */
export const menuIntent = (event: KeyLike, soloFallback: boolean): KeyIntent | null => {
  const key = name(event.key);
  if (key === 'Escape') return { kind: 'back' };
  const p1 = P1_NAV[key];
  if (p1) return { kind: 'nav', player: 0, dir: p1 };
  const p2 = P2_NAV[key];
  if (p2) return { kind: 'nav', player: soloFallback ? 0 : 1, dir: p2 };
  if (key === ' ') return { kind: 'confirm', player: 0 };
  if (key === 'Enter') return { kind: 'confirm', player: soloFallback ? 0 : 1 };
  return null;
};

export const matchIntent = (event: KeyLike, players: number): KeyIntent | null => {
  const key = name(event.key);
  if (key === 'p' || key === 'Escape') return { kind: 'pause' };
  const p1 = P1_MOVE[key];
  if (p1) return { kind: 'move', player: 0, input: p1 };
  const p2 = P2_MOVE[key];
  if (p2) return { kind: 'move', player: players > 1 ? 1 : 0, input: p2 };
  return null;
};

/** The "Press Start" key on the round and match banners (either player). */
export const isStartKey = (event: KeyLike): boolean => event.key === 'Enter' || event.key === ' ';
