/**
 * Wheel host settings (HOST_FEATURE_INVENTORY.md 5.2, design.md section 4 `host_settings.wheel`).
 * The engine owns the type; this module adds the zod schema every boundary parses with (TD-008) and
 * the "next game" form helpers. Each field falls back on its own, so one bad value keeps the rest.
 */
import { z } from 'zod';
import { DEFAULT_WHEEL_SETTINGS as ENGINE_DEFAULTS } from '@/engines/wheel/types';
import type { WheelSettings } from '@/engines/wheel/types';

export type { WheelSettings };

/** Opening classic, Speed-Up by the bell, full show, Bonus Round on, no turn timer. */
export const DEFAULT_WHEEL_SETTINGS: Readonly<WheelSettings> = ENGINE_DEFAULTS;

export const TURN_TIMER_CHOICES = [0, 5, 10] as const satisfies readonly WheelSettings['turnTimerSec'][];

export const wheelSettingsSchema = z.object({
  opening: z.enum(['classic', 'frenzy']).catch(DEFAULT_WHEEL_SETTINGS.opening),
  speedUpStart: z.enum(['bell', 'round4']).catch(DEFAULT_WHEEL_SETTINGS.speedUpStart),
  length: z.enum(['full', 'short']).catch(DEFAULT_WHEEL_SETTINGS.length),
  bonusRound: z.boolean().catch(DEFAULT_WHEEL_SETTINGS.bonusRound),
  turnTimerSec: z
    .union([z.literal(0), z.literal(5), z.literal(10)])
    .catch(DEFAULT_WHEEL_SETTINGS.turnTimerSec),
});

/** Unknown, missing or malformed input gives the defaults; extra keys are ignored. */
export function parseWheelSettings(raw: unknown): WheelSettings {
  const source = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : {};
  return wheelSettingsSchema.parse(source);
}

/** Only the four fields of the "next game" form (the turn timer is live and has its own buttons). */
export const NEXT_GAME_FIELDS = ['opening', 'speedUpStart', 'length', 'bonusRound'] as const;
