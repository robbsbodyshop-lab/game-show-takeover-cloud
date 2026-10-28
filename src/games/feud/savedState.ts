/**
 * Reading back what `onStateChange` saved. The stage stores the snapshot as plain JSON, so it is
 * checked structurally before use: a snapshot that does not fit starts a fresh game instead of
 * crashing a live show (TD-008).
 */
import type { FeudSavedState } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFamily = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.teamId === 'string' &&
  typeof value.podiumSize === 'number' &&
  typeof value.score === 'number';

export const parseSavedState = (raw: unknown): FeudSavedState | null => {
  if (!isRecord(raw) || raw.version !== 1) return null;
  const engine = raw.engine;
  if (!isRecord(engine)) return null;
  const families = engine.families;
  if (
    typeof engine.phase !== 'string' ||
    typeof engine.seq !== 'number' ||
    !Array.isArray(engine.board) ||
    !Array.isArray(engine.events) ||
    !Array.isArray(engine.history) ||
    !isRecord(engine.settings) ||
    !isRecord(families) ||
    !isFamily(families.A) ||
    !isFamily(families.B)
  ) {
    return null;
  }
  if (typeof raw.gameRev !== 'number' || !Array.isArray(raw.usedLocal)) return null;
  if (!isRecord(raw.clocks)) return null;
  return raw as unknown as FeudSavedState;
};
