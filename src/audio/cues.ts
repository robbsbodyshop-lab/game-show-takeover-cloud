/**
 * Cue registry for docs/reference/AUDIO_CUES_V1.md: every cue name maps to its MP3 under `public/audio/`.
 * The `SoundName` union makes a typo a compile error. Timed beds and loops are listed below so a
 * controller can start a bed in the same tick as its game clock.
 */
export const SOUND_FILES = {
  // Shared
  hub_theme: '/audio/hub_theme.mp3',
  applause: '/audio/applause.mp3',
  winner_fanfare: '/audio/winner_fanfare.mp3',
  countdown_theme: '/audio/countdown_theme.mp3',
  alarm: '/audio/alarm.mp3',
  // Family Feud
  ff_round_sting: '/audio/ff_round_sting.mp3',
  ff_buzzer: '/audio/ff_buzzer.mp3',
  ff_reveal: '/audio/ff_reveal.mp3',
  ff_crowd_cheer: '/audio/ff_crowd_cheer.mp3',
  ff_strike: '/audio/ff_strike.mp3',
  ff_crowd_aww: '/audio/ff_crowd_aww.mp3',
  ff_bank_award: '/audio/ff_bank_award.mp3',
  ff_time_warn: '/audio/ff_time_warn.mp3',
  ff_sudden_death: '/audio/ff_sudden_death.mp3',
  ff_game_win: '/audio/ff_game_win.mp3',
  ff_fm_clock_20: '/audio/ff_fm_clock_20.mp3',
  ff_fm_clock_25: '/audio/ff_fm_clock_25.mp3',
  ff_fm_duplicate: '/audio/ff_fm_duplicate.mp3',
  ff_fm_done: '/audio/ff_fm_done.mp3',
  ff_fm_blip: '/audio/ff_fm_blip.mp3',
  ff_fm_points: '/audio/ff_fm_points.mp3',
  ff_fm_zero: '/audio/ff_fm_zero.mp3',
  ff_fm_win: '/audio/ff_fm_win.mp3',
  // Wheel of Fortune
  wof_category_chime: '/audio/wof_category_chime.mp3',
  wof_prize_chime: '/audio/wof_prize_chime.mp3',
  wof_tossup_bed: '/audio/wof_tossup_bed.mp3',
  wof_frenzy_bed: '/audio/wof_frenzy_bed.mp3',
  wof_ring_in: '/audio/wof_ring_in.mp3',
  wof_triple_ding: '/audio/wof_triple_ding.mp3',
  wof_tossup_solve: '/audio/wof_tossup_solve.mp3',
  spin_tick: '/audio/spin_tick.mp3',
  wof_letter_light: '/audio/wof_letter_light.mp3',
  wheel_letter_ding: '/audio/wheel_letter_ding.mp3',
  wheel_buzzer: '/audio/wheel_buzzer.mp3',
  vowel: '/audio/vowel.mp3',
  wof_solve: '/audio/wof_solve.mp3',
  wof_bankrupt: '/audio/wof_bankrupt.mp3',
  wof_lose_turn: '/audio/wof_lose_turn.mp3',
  wof_mystery: '/audio/wof_mystery.mp3',
  wof_mystery_flip: '/audio/wof_mystery_flip.mp3',
  wof_express: '/audio/wof_express.mp3',
  wof_express_bed: '/audio/wof_express_bed.mp3',
  wof_wild_card: '/audio/wof_wild_card.mp3',
  wof_million: '/audio/wof_million.mp3',
  wof_no_more_vowels: '/audio/wof_no_more_vowels.mp3',
  wof_only_vowels: '/audio/wof_only_vowels.mp3',
  wof_time_bell: '/audio/wof_time_bell.mp3',
  wof_final_spin: '/audio/wof_final_spin.mp3',
  wof_bonus_spin: '/audio/wof_bonus_spin.mp3',
  wof_bonus_chime: '/audio/wof_bonus_chime.mp3',
  wof_bonus_clock_10: '/audio/wof_bonus_clock_10.mp3',
  wof_time_up: '/audio/wof_time_up.mp3',
  wof_envelope: '/audio/wof_envelope.mp3',
  wof_bonus_win: '/audio/wof_bonus_win.mp3',
  wof_bonus_lose: '/audio/wof_bonus_lose.mp3',
  // Registered but not played by any screen (safe to replace or drop)
  ff_round_start: '/audio/family_feud_intro.mp3',
  ff_ding: '/audio/ff_ding.mp3',
  ff_you_said: '/audio/ff_you_said.mp3',
  ff_steal_success: '/audio/steal_success.mp3',
  ff_steal_fail: '/audio/steal_fail.mp3',
  ff_fm_timeup: '/audio/ff_fm_timeup.mp3',
  puzzle_reveal: '/audio/puzzle_reveal.mp3',
  wheel_spin: '/audio/wheel_spin.mp3',
  bankrupt_lose_turn: '/audio/bankrupt_lose_turn.mp3',
} as const;

export type SoundName = keyof typeof SOUND_FILES;

/** The registry as a plain lookup (name to URL). */
export const SOUND_REGISTRY: Readonly<Record<SoundName, string>> = SOUND_FILES;

export const SOUND_NAMES = Object.keys(SOUND_FILES) as SoundName[];

export const isSoundName = (value: string): value is SoundName => Object.hasOwn(SOUND_FILES, value);

/** Cues generated and registered but no longer played by any screen. */
export const UNUSED_CUES = [
  'ff_round_start',
  'ff_ding',
  'ff_you_said',
  'ff_steal_success',
  'ff_steal_fail',
  'ff_fm_timeup',
  'puzzle_reveal',
  'wheel_spin',
  'bankrupt_lose_turn',
] as const satisfies readonly SoundName[];

/**
 * Beds that last exactly as long as the game clock they run with (the file ends when the clock reads 0).
 * Start in the same tick as the clock; pause and resume with it; restart with an offset after a reload.
 */
export const TIMED_BED_SECONDS = {
  ff_fm_clock_20: 20,
  ff_fm_clock_25: 25,
  wof_frenzy_bed: 30,
  wof_bonus_clock_10: 10,
  wof_envelope: 3,
} as const satisfies Partial<Record<SoundName, number>>;

export type TimedBedName = keyof typeof TIMED_BED_SECONDS;

/** Seamless loops: whole bars with the tail folded onto the start. Play with `loop`, end with `stopLoop`. */
export const LOOPING_BEDS = [
  'hub_theme',
  'countdown_theme',
  'wof_tossup_bed',
  'wof_express_bed',
] as const satisfies readonly SoundName[];

export type LoopingBedName = (typeof LOOPING_BEDS)[number];
