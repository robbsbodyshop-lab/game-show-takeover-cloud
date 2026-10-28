# Audio assets

Every file in this directory is **generated** by `scripts/generate_sfx.py`
(run `npm run audio:generate`; needs Python 3 with `numpy`, `scipy`, `lameenc`).
The cues are synthesized from scratch in a 1970s network game-show style:
section brass, tine electric piano, drawbar organ, vibraphone, marimba,
glockenspiel, chimes, a string machine, disco drums, a slide whistle, a steam
whistle, a sad trombone and a synthesized studio audience. They are original to
this project: no third-party samples and no attribution requirements. The
Family Feud (`ff_*`) and Wheel of Fortune (`wof_*`) cues evoke the role and
energy of each moment on the TV shows without copying any real melody, theme or
sample.

The registry that maps cue names to files is `utils/audio.ts`; the `SoundName`
type makes a typo a compile error. A missing file never throws: playback no-ops
and logs one warning. The tables below list what triggers each cue in the
current code: `components/family_feud/feudController.ts` for Family Feud,
`components/wheel_of_fortune/wheelCues.ts` (engine events) and
`WheelOfFortuneGame.tsx` (beds, lighting, envelope) for Wheel of Fortune.

Family Feud's "Survey... SAYS!" is spoken by the browser's speech synthesis,
not played from a file.

## Levels, lengths and loops

- **Levels**: every cue is normalized to a 0.9 peak, and dense cues (buzzers,
  whistles) are then turned down so their loudest 400 ms stays at or below
  -8 dBFS RMS, the level of the strike buzzer. 112 kbps MP3.
- **Exact lengths**: new files start with a LAME "Info" frame that records the
  encoder delay and padding, so browsers decode them to the exact sample count
  (checked in Chromium: `ff_fm_clock_20.mp3` reports `duration` 20 and decodes
  to 882,000 samples). Older files without the frame decode a few tens of
  milliseconds longer than their audio.
- **Timed beds** (`TIMED_BED_SECONDS` in `utils/audio.ts`): start the bed in the
  same tick as the game clock. Each has a 3-beat pickup, whole bars, and a final
  downbeat hit one beat before the end, so the file ends exactly when the clock
  reads 0. Stop it early with `stopSound`; freeze and continue it with
  `pauseSound` / `resumeSound` so it stays in step with a paused clock. The
  games do this on Pause and restart a bed with an `offset` when its clock was
  already running.
- **Loops** (`LOOPING_BEDS`): whole bars with the ringing tail folded onto the
  start, and no edge fades. Play them with `playLoop` and end them with
  `stopLoop`.
- **Per-tile dings**: `playSound(name, { overlap: true })` lets a short cue ring
  over its previous play instead of restarting it.
- **Delayed cues**: some Wheel cues wait a beat after their event
  (`delayMs` in `wheelCues.ts`): the applause for a Triple Toss-Up sweep,
  the Prize Puzzle trip, the main-game winner or a Mystery $10,000, the
  Bankrupt slide after a buzzer or a Mystery flip, the Same Letter ding, the
  Wild Card and Million stings, the final-spin theme after the time bell and
  the game-over fanfare. A cue still waiting is dropped when an Undo, a
  thrown-out puzzle or a host override (`HOST_SOLVE_OVERRIDE`, which also
  reverses a ruling) lands first, so a ruling that was taken back never
  plays its sound.
- Every cue stops when the screen changes (`stopAllSounds()` on each phase
  change).

## Shared cues

| Cue               | File                  | Sound                                                             | Trigger                                                                                                                                                |
| ----------------- | --------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hub_theme`       | `hub_theme.mp3`       | Funky 8-bar loop: disco drums, bass, tine piano, brass, strings   | Looping on the Setup and Hub screens (Music on/off and volume in Settings)                                                                             |
| `applause`        | `applause.mp3`        | Studio audience, 4.5 s swell                                      | Feud: a round won, the final result. Wheel: a Triple Toss-Up sweep, the Prize Puzzle trip won, the main-game winner decided, a Mystery flip to $10,000 |
| `winner_fanfare`  | `winner_fanfare.mp3`  | Drum roll, brass fanfare, organ swell, applause                   | The Announce the Winner screen; Wheel of Fortune game over                                                                                             |
| `countdown_theme` | `countdown_theme.mp3` | Think music: vibes tune over marimba, walking bass, ticking block | Speed Round: loops while the 60-second clock runs, pauses with it                                                                                      |
| `alarm`           | `alarm.mp3`           | Three klaxon pulses                                               | Speed Round: time is up                                                                                                                                |

## Family Feud

| Cue               | File                  | Sound                                                                   | Trigger                                                                                                            |
| ----------------- | --------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `ff_round_sting`  | `ff_round_sting.mp3`  | 3.5 s: snare pickup, syncopated brass figure, held tutti chord          | A regular round starts ("Give me A, give me B"); 2.2 s after a round is won, after the applause; Fast Money starts |
| `ff_buzzer`       | `ff_buzzer.mp3`       | Bright studio bell                                                      | Face-off: a player buzzes in                                                                                       |
| `ff_reveal`       | `ff_reveal.mp3`       | Air whoosh into a bright metallic clang and panel click                 | An answer slot flips: face-off, main game, steal, leftover reveals (`{ overlap: true }`)                           |
| `ff_crowd_cheer`  | `ff_crowd_cheer.mp3`  | 2 s: yeahs, woos and applause                                           | After an answer a player gave is revealed (not the host's leftover reveals)                                        |
| `ff_strike`       | `ff_strike.mp3`       | Long rasping low buzzer                                                 | Every X: a strike, a face-off miss (Sudden Death included), a failed steal                                         |
| `ff_crowd_aww`    | `ff_crowd_aww.mp3`    | 1.9 s: crowd voices sliding down on an "aww"                            | After every X; Fast Money lost                                                                                     |
| `ff_bank_award`   | `ff_bank_award.mp3`   | 1.5 s: counter ticks rolling up in pitch, bell and brass button         | The bank goes to the round winner's score                                                                          |
| `ff_time_warn`    | `ff_time_warn.mp3`    | Dry woodblock "tok"                                                     | Answer timer (host-only): one tick at 1 second left                                                                |
| `ff_sudden_death` | `ff_sudden_death.mp3` | 5 s: low minor hit, tremolo strings, heartbeat kicks, roll, final chord | Sudden Death starts ("top answer only")                                                                            |
| `ff_game_win`     | `ff_game_win.mp3`     | 5 s: bouncing brass fanfare, organ, cheering audience                   | A family wins the game                                                                                             |
| `ff_fm_clock_20`  | `ff_fm_clock_20.mp3`  | Tension bed, exactly 20.0 s (144 bpm, 11 bars climbing, final downbeat) | Fast Money player 1: starts with the 20-second clock, pauses with it, stops when the turn ends                     |
| `ff_fm_clock_25`  | `ff_fm_clock_25.mp3`  | Same bed, exactly 25.0 s (14 bars)                                      | Fast Money player 2: the same with the 25-second clock                                                             |
| `ff_fm_duplicate` | `ff_fm_duplicate.mp3` | Quick double buzz                                                       | Player 2 repeats player 1's answer ("TRY AGAIN"; the clock keeps running); the host's "Play the duplicate buzzer"  |
| `ff_fm_done`      | `ff_fm_done.mp3`      | Rapid run of four bell dings                                            | Fast Money turn over: fifth answer given, or the clock ran out (not when the host stops the clock)                 |
| `ff_fm_blip`      | `ff_fm_blip.mp3`      | 70 ms upward electronic blip                                            | Each Fast Money answer's text appears ("YOU SAID...")                                                              |
| `ff_fm_points`    | `ff_fm_points.mp3`    | One bright bell                                                         | A non-zero Fast Money score appears ("SURVEY SAID...")                                                             |
| `ff_fm_zero`      | `ff_fm_zero.mp3`      | Low, short buzzer                                                       | A Fast Money score of 0 appears (miss, pass or blank)                                                              |
| `ff_fm_win`       | `ff_fm_win.mp3`       | 6 s: win bell, drum fill, brass fanfare, cheering audience              | The Fast Money total reaches 200                                                                                   |

## Wheel of Fortune

| Cue                  | File                     | Sound                                                                      | Trigger                                                                                                                                  |
| -------------------- | ------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `wof_category_chime` | `wof_category_chime.mp3` | Bright four-note ascending chime (glockenspiel over tubular chimes)        | A puzzle and its category appear (except the Prize Puzzle)                                                                               |
| `wof_prize_chime`    | `wof_prize_chime.mp3`    | The category chime, then the figure again a fourth higher                  | The Prize Puzzle round starts                                                                                                            |
| `wof_tossup_bed`     | `wof_tossup_bed.mp3`     | Light 16.0 s loop: marimba, tine piano, plucked bass, shaker, vibes        | While a toss-up's letters are appearing (opening, Triple Toss-Up, tiebreaker); `playLoop`                                                |
| `wof_frenzy_bed`     | `wof_frenzy_bed.mp3`     | Fast bed, exactly 30.0 s (160 bpm, lifts at bars 9 and 15, final downbeat) | Fortune Frenzy: runs with the 30-second clock                                                                                            |
| `wof_ring_in`        | `wof_ring_in.mp3`        | Crisp high bell                                                            | A team rings in on a toss-up or Frenzy puzzle                                                                                            |
| `wof_triple_ding`    | `wof_triple_ding.mp3`    | Quick series of five high dings                                            | Triple Toss-Up puzzle 1 or 2 solved; a correct Fortune Frenzy answer                                                                     |
| `wof_tossup_solve`   | `wof_tossup_solve.mp3`   | Two brass stabs into a bright chord                                        | Any other toss-up solved                                                                                                                 |
| `spin_tick`          | `spin_tick.mp3`          | Single clicker tick                                                        | Each peg the pointer passes during a spin (`{ overlap: true }`)                                                                          |
| `wof_letter_light`   | `wof_letter_light.mp3`   | Short, soft sine ding                                                      | Each puzzle tile lighting up after a correct letter (`{ overlap: true }`)                                                                |
| `wheel_letter_ding`  | `wheel_letter_ding.mp3`  | Vibraphone ding                                                            | The Same Letter bonus letter is called                                                                                                   |
| `wheel_buzzer`       | `wheel_buzzer.mp3`       | Electromechanical buzzer                                                   | A wrong toss-up or Frenzy answer, a letter not in the puzzle, a repeat, a wrong solve, running out of time (turn timer, Speed-Up window) |
| `vowel`              | `vowel.mp3`              | Two-note organ blip                                                        | A vowel is bought                                                                                                                        |
| `wof_solve`          | `wof_solve.mp3`          | One-bar brass phrase landing on a bright held chord                        | A main-game puzzle solved; the Bonus puzzle solved                                                                                       |
| `wof_bankrupt`       | `wof_bankrupt.mp3`       | Slide whistle deflating all the way down                                   | BANKRUPT; after the buzzer on a failed Express run; after the roll when a Mystery flip is BANKRUPT                                       |
| `wof_lose_turn`      | `wof_lose_turn.mp3`      | Short descending muted "wah-wahh"                                          | LOSE A TURN                                                                                                                              |
| `wof_mystery`        | `wof_mystery.mp3`        | Whole-tone glockenspiel tinkle over an augmented chord                     | The wheel lands on a Mystery wedge                                                                                                       |
| `wof_mystery_flip`   | `wof_mystery_flip.mp3`   | Snare and timpani roll into an unresolved reveal hit                       | A Mystery wedge is flipped (then `wof_bankrupt` or `applause`)                                                                           |
| `wof_express`        | `wof_express.mp3`        | Synthesized chime steam whistle, short then long                           | The wheel lands on EXPRESS                                                                                                               |
| `wof_express_bed`    | `wof_express_bed.mp3`    | Driving 12.0 s loop: chugging snare, boogie bass, organ, brass             | During an Express ride; `playLoop`                                                                                                       |
| `wof_wild_card`      | `wof_wild_card.mp3`      | Glockenspiel run into a bright brass stab                                  | The Wild Card is claimed                                                                                                                 |
| `wof_million`        | `wof_million.mp3`        | Roll into three rising brass hits, the last held, with sparkle             | The Million Dollar Wedge is claimed                                                                                                      |
| `wof_no_more_vowels` | `wof_no_more_vowels.mp3` | Three short beeps                                                          | Every vowel has been called                                                                                                              |
| `wof_only_vowels`    | `wof_only_vowels.mp3`    | Two-tone beeps, high-low, high-low                                         | Only vowels remain in the puzzle                                                                                                         |
| `wof_time_bell`      | `wof_time_bell.mp3`      | Three quick ascending bell runs                                            | The host rings the time bell                                                                                                             |
| `wof_final_spin`     | `wof_final_spin.mp3`     | Timpani and low brass climbing, snare roll, held major chord               | The Speed-Up's final spin begins (1.6 s after the bell when both come together)                                                          |
| `wof_bonus_spin`     | `wof_bonus_spin.mp3`     | 5 s: light clicks slowing to a stop under a shimmering pad                 | The Bonus Wheel spins                                                                                                                    |
| `wof_bonus_chime`    | `wof_bonus_chime.mp3`    | Single tubular chime with a glockenspiel sparkle                           | The Bonus Wheel stops on an envelope                                                                                                     |
| `wof_bonus_clock_10` | `wof_bonus_clock_10.mp3` | Tension bed, exactly 10.0 s (harp pickup, 5 climbing bars, final downbeat) | Bonus Round: runs with the 10-second clock                                                                                               |
| `wof_time_up`        | `wof_time_up.mp3`        | Double buzz                                                                | The Bonus clock runs out; a toss-up, Fortune Frenzy or round ends unsolved                                                               |
| `wof_envelope`       | `wof_envelope.mp3`       | Exactly 3.0 s of suspense: timpani roll, climbing tremolo strings, ticks   | The host opens the envelope (paused and resumed with the game)                                                                           |
| `wof_bonus_win`      | `wof_bonus_win.mp3`      | Triplet brass pickup, big held chord, glockenspiel run, applause           | The envelope opens on a win                                                                                                              |
| `wof_bonus_lose`     | `wof_bonus_lose.mp3`     | Soft, sympathetic descending vibraphone phrase over a warm pad             | The envelope opens on a miss                                                                                                             |

## Registered but not played

These are still generated and registered in `utils/audio.ts`, but no screen
plays them now. They are safe to replace or drop.

| Cue                  | File                     | Sound                                        | Was                                                                    |
| -------------------- | ------------------------ | -------------------------------------------- | ---------------------------------------------------------------------- |
| `ff_round_start`     | `family_feud_intro.mp3`  | Drum pickup, rising brass fanfare, organ hit | Round intro; replaced by `ff_round_sting`                              |
| `ff_ding`            | `ff_ding.mp3`            | Desk bell, two strikes                       | Correct answer; replaced by `ff_reveal`                                |
| `ff_you_said`        | `ff_you_said.mp3`        | Snare roll into timpani and a brass punch    | Drum roll before a ruling; replaced by the spoken "Survey says"        |
| `ff_steal_success`   | `steal_success.mp3`      | Short brass fanfare with tambourine          | Successful steal; now `ff_reveal` and the cheer                        |
| `ff_steal_fail`      | `steal_fail.mp3`         | Trombone slide down                          | Failed steal; now `ff_strike` and the aww                              |
| `ff_fm_timeup`       | `ff_fm_timeup.mp3`       | Bright two-tone horn buzzer                  | A harsher alternative to `ff_fm_done`                                  |
| `puzzle_reveal`      | `puzzle_reveal.mp3`      | Harp glissando into a vibraphone chord       | New or solved puzzle; replaced by the chimes and `wof_solve`           |
| `wheel_spin`         | `wheel_spin.mp3`         | Wooden clicker slowing over 7 s              | Wheel spin; replaced by `spin_tick` per peg                            |
| `bankrupt_lose_turn` | `bankrupt_lose_turn.mp3` | Sad trombone (wah wah wah waaah)             | BANKRUPT / LOSE A TURN; replaced by `wof_bankrupt` and `wof_lose_turn` |

## Replacing a cue

Drop a new MP3 with the same file name here, or change the path in
`utils/audio.ts`. If you use third-party audio, keep its licence with the file
and update this table. Re-running the generator overwrites every file listed
above, so keep custom replacements out of its output list (edit `CUES` in the
script) or store them under a different name. A replacement timed bed must keep
the exact length the game clock expects.
