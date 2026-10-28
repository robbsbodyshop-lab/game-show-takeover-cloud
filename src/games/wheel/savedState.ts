/**
 * Reading a saved Wheel engine state back (FR-005, TD-003). The save is plain JSON that this app wrote,
 * but a stale or foreign document must never crash a live show (TD-008), so the shape the controller
 * relies on is checked and anything else is ignored (the game then starts fresh).
 */
import { z } from 'zod';
import type { WheelState } from '@/engines/wheel/types';

const team = z.looseObject({ id: z.number().int(), name: z.string() });

const savedSchema = z.looseObject({
  version: z.literal(1),
  teams: z.array(team).min(1),
  plan: z.array(z.looseObject({ kind: z.string() })).min(1),
  planIndex: z.number().int().nonnegative(),
  stage: z.string(),
  phase: z.string(),
  settings: z.looseObject({}),
  queue: z.array(z.unknown()),
  history: z.array(z.unknown()),
  events: z.array(z.unknown()),
  eventSeq: z.number().int().nonnegative(),
  step: z.number().int().nonnegative(),
  seen: z.array(z.string()),
});

export function parseSavedWheelState(raw: unknown): WheelState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  return savedSchema.safeParse(raw).success ? (raw as WheelState) : null;
}
