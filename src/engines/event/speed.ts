/**
 * Speed Round clock (FR-052, HOST_FEATURE_INVENTORY.md 1.6 / 2.11). `now` is injected (epoch ms);
 * the clock is stored as { endsAt | null, remainingMs } so a reload resumes with the right time
 * (FR-005). Every function returns the same object for an illegal transition.
 */
import type { SpeedState } from './types';

export const SPEED_ROUND_MS = 60_000;

export function createSpeedState(durationMs: number = SPEED_ROUND_MS): SpeedState {
  return { status: 'idle', durationMs, endsAt: null, remainingMs: durationMs };
}

const validNow = (now: number): boolean => Number.isFinite(now);

export function startSpeed(s: SpeedState, now: number): SpeedState {
  if (s.status !== 'idle' || !validNow(now)) return s;
  return { ...s, status: 'running', endsAt: now + s.remainingMs };
}

export function pauseSpeed(s: SpeedState, now: number): SpeedState {
  if (s.status !== 'running' || s.endsAt === null || !validNow(now)) return s;
  return { ...s, status: 'paused', endsAt: null, remainingMs: Math.max(0, s.endsAt - now) };
}

export function resumeSpeed(s: SpeedState, now: number): SpeedState {
  if (s.status !== 'paused' || s.remainingMs <= 0 || !validNow(now)) return s;
  return { ...s, status: 'running', endsAt: now + s.remainingMs };
}

/** Only legal once the clock has actually reached zero, so an early TIME_UP is ignored. */
export function timeUpSpeed(s: SpeedState, now: number): SpeedState {
  if (s.status !== 'running' || s.endsAt === null || !validNow(now) || now < s.endsAt) return s;
  return { ...s, status: 'timeUp', endsAt: null, remainingMs: 0 };
}

/** Time left at `now` for display and for deciding whether to dispatch TIME_UP. */
export function speedRemainingMs(s: SpeedState, now: number): number {
  if (s.status === 'running' && s.endsAt !== null) return Math.max(0, s.endsAt - now);
  return s.remainingMs;
}
