/**
 * Family Feud game settings (FR-034, FR-035, FR-036). The engine owns the first five fields
 * (src/engines/feud/types.ts); `voice` and `answersFrom` are controller-level.
 * Defaults follow docs/reference/HOST_FEATURE_INVENTORY.md section 5.1.
 */
import { z } from 'zod';
import type { FeudSettings as EngineFeudSettings } from '@/engines/feud/types';

export const feudSettingsSchema = z.object({
  /** A family at or above this after a decided round wins. */
  targetScore: z.union([z.literal(200), z.literal(300), z.literal(400), z.literal(500)]),
  /** 'one-round' is the short bracket format. */
  format: z.enum(['full', 'one-round']),
  fastMoneyEnabled: z.boolean(),
  /** Host-only answer timer in seconds; 0 turns it off. */
  answerTimerSec: z.number().min(0).max(60),
  /** Steal huddle length; 0 means as long as the host allows. */
  stealTimerSec: z.union([z.literal(0), z.literal(15), z.literal(30)]),
  /** Web Speech for the face-off and control players (never the steal or Fast Money). */
  voice: z.enum(['off', 'on']),
  /** Who may type answers: the host, the answering team's phone, or both. */
  answersFrom: z.enum(['host', 'phones', 'both']),
});

export type FeudSettings = z.infer<typeof feudSettingsSchema>;

export const DEFAULT_FEUD_SETTINGS: FeudSettings = {
  targetScore: 300,
  format: 'full',
  fastMoneyEnabled: true,
  answerTimerSec: 5,
  stealTimerSec: 0,
  voice: 'off',
  answersFrom: 'host',
};

/** Reads whatever was saved: every valid field is kept, every missing or invalid one takes its default. */
export const parseFeudSettings = (raw: unknown): FeudSettings => {
  const source: Record<string, unknown> = typeof raw === 'object' && raw !== null ? { ...raw } : {};
  const result: Record<string, unknown> = { ...DEFAULT_FEUD_SETTINGS };
  for (const key of Object.keys(feudSettingsSchema.shape) as (keyof FeudSettings)[]) {
    const parsed = feudSettingsSchema.shape[key].safeParse(source[key]);
    if (parsed.success) result[key] = parsed.data;
  }
  return feudSettingsSchema.parse(result);
};

/** The slice of the settings the engine stores. */
export const toEngineSettings = (settings: FeudSettings): Partial<EngineFeudSettings> => ({
  targetScore: settings.targetScore,
  format: settings.format,
  fastMoneyEnabled: settings.fastMoneyEnabled,
  answerTimerSec: settings.answerTimerSec,
  stealTimerSec: settings.stealTimerSec,
});
