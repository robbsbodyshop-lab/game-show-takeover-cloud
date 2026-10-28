/**
 * Test helpers for the Wheel engine: fixture puzzles, scripted spins, a "play it out" driver.
 * Not part of the engine; imported by *.test.ts only.
 */
import { CONSONANTS } from './letters';
import { wheelReduce, createWheelState } from './wheelEngine';
import type {
  PuzzleInput,
  PuzzleRequest,
  PuzzleUse,
  TeamId,
  WheelAction,
  WheelSettings,
  WheelState,
} from './types';
import { buildWheel, drawForIndex } from './wheels';
import type { Wedge } from './wheels';
import type { RoundNo } from './types';

export const TEAMS = [
  { id: 1, name: 'Red' },
  { id: 2, name: 'Blue' },
  { id: 3, name: 'Green' },
];

const POOL: Record<PuzzleUse, { category: string; phrase: string; lines?: string[] }[]> = {
  round: [
    { category: 'PHRASE', phrase: 'BLUE MOON RISING', lines: ['BLUE MOON', 'RISING'] },
    { category: 'THING', phrase: 'GARDEN PARTY', lines: ['GARDEN PARTY'] },
    { category: 'PLACE', phrase: 'QUIET MOUNTAIN LAKE', lines: ['QUIET', 'MOUNTAIN LAKE'] },
    { category: 'PHRASE', phrase: 'HOT CHOCOLATE', lines: ['HOT CHOCOLATE'] },
    { category: 'THING', phrase: 'PAPER LANTERN', lines: ['PAPER LANTERN'] },
    { category: 'THING', phrase: 'SILVER SPOON', lines: ['SILVER SPOON'] },
  ],
  prize: [
    { category: 'WHAT ARE YOU DOING?', phrase: 'SURFING AT SUNRISE', lines: ['SURFING', 'AT SUNRISE'] },
  ],
  tossup: [
    { category: 'THING', phrase: 'RUBBER DUCK' },
    { category: 'THING', phrase: 'PAPER PLANE' },
    { category: 'THING', phrase: 'WOODEN SPOON' },
    { category: 'THING', phrase: 'COFFEE MUG' },
    { category: 'THING', phrase: 'GLASS MARBLE' },
    { category: 'THING', phrase: 'STEEL BRIDGE' },
    { category: 'THING', phrase: 'CLAY POT' },
    { category: 'THING', phrase: 'TIN WHISTLE' },
    { category: 'THING', phrase: 'SILK SCARF' },
    { category: 'THING', phrase: 'IRON GATE' },
    { category: 'THING', phrase: 'SALT SHAKER' },
    { category: 'THING', phrase: 'WOOL HAT' },
  ],
  triple: [
    { category: 'THING', phrase: 'GRAND PIANO' },
    { category: 'THING', phrase: 'TYPEWRITER' },
    { category: 'THING', phrase: 'COMPUTER' },
    { category: 'THING', phrase: 'SPARE KEY' },
  ],
  tiebreak: [
    { category: 'THING', phrase: 'TIE BREAKER' },
    { category: 'THING', phrase: 'SPLIT DECISION' },
  ],
  bonus: [
    { category: 'THING', phrase: 'WINTER WONDERLAND', lines: ['WINTER', 'WONDERLAND'] },
    { category: 'PHRASE', phrase: 'ONCE UPON A TIME', lines: ['ONCE UPON', 'A TIME'] },
    { category: 'PLACE', phrase: 'SANDY BEACH', lines: ['SANDY BEACH'] },
    { category: 'THING', phrase: 'EXTRA CATEGORY' },
  ],
};

let counter = 0;

/** Fixture puzzles for a request; `ids` are unique so the engine's `seen` list can be checked. */
export function puzzlesFor(req: PuzzleRequest): PuzzleInput[] {
  const pool = POOL[req.use];
  const out: PuzzleInput[] = [];
  for (let i = 0; i < req.count; i++) {
    const base = pool[(counter + i) % pool.length];
    if (!base) continue;
    const category = req.use === 'bonus' ? (pool[i % pool.length]?.category ?? base.category) : base.category;
    out.push({
      id: `${req.use}-${counter + i}`,
      ...base,
      category: req.category ?? category,
      use: [req.use],
      ...(req.use === 'prize' ? { prize: { name: 'A TRIP TO MAUI', value: 9800 } } : {}),
    });
  }
  counter += req.count;
  return out;
}

/** Greedy word wrap for fixtures longer than one line (the engine itself only auto-lines up to 14). */
export function wrap(phrase: string): string[] {
  const lines: string[] = [];
  for (const word of phrase.split(' ')) {
    const last = lines[lines.length - 1];
    if (last !== undefined && last.length + 1 + word.length <= 14)
      lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

export function makePuzzle(phrase: string, extra: Partial<PuzzleInput> = {}): PuzzleInput {
  counter += 1;
  return {
    id: `x-${counter}`,
    category: 'THING',
    phrase,
    ...(phrase.length > 14 ? { lines: wrap(phrase) } : {}),
    use: ['round'],
    ...extra,
  };
}

/** Answers the engine's open puzzle request with fixtures (or the given puzzles). */
export function provide(s: WheelState, puzzles?: PuzzleInput[]): WheelState {
  if (!s.request) return s;
  return wheelReduce(s, { type: 'PROVIDE_PUZZLES', puzzles: puzzles ?? puzzlesFor(s.request) });
}

export function run(s: WheelState, ...actions: WheelAction[]): WheelState {
  return actions.reduce((st, a) => wheelReduce(st, a), s);
}

export function newGame(settings: Partial<WheelSettings> = {}, teams = TEAMS): WheelState {
  return provide(createWheelState({ teams, settings }));
}

/** Plays CONTINUE and provides puzzles until the stage/phase test passes (max 40 steps). */
export function advanceTo(s: WheelState, done: (st: WheelState) => boolean): WheelState {
  let st = s;
  for (let i = 0; i < 40 && !done(st); i++) {
    st = st.request ? provide(st) : wheelReduce(st, { type: 'CONTINUE' });
  }
  return st;
}

/** Ends the current toss-up family puzzle unsolved with a team answering correctly. */
export function solveTossup(s: WheelState, team: TeamId): WheelState {
  let st = s;
  for (
    let i = 0;
    i < 40 && st.phase === 'tossup-reveal' && (st.puzzle?.shown.filter(Boolean).length ?? 0) < 1;
    i++
  ) {
    st = wheelReduce(st, { type: 'TOSSUP_REVEAL_NEXT', draw: 0.3 });
  }
  st = wheelReduce(st, { type: 'BUZZ', team, at: 1 });
  return wheelReduce(st, { type: 'TOSSUP_ANSWER', team, verdict: 'correct' });
}

export const DEFAULT_PHRASE = 'RED APPLE PIE';

/**
 * Get from the start to `round` at its first choice point, the given team starting it (they win the
 * deciding toss-up); other rounds are solved by whoever is in control. `phrase` is the puzzle in play.
 */
export function toRound(
  round: 1 | 2 | 3 | 4,
  settings: Partial<WheelSettings> = {},
  starter: TeamId = 1,
  phrase: string = DEFAULT_PHRASE,
): WheelState {
  let s = newGame(settings);
  const target = (st: WheelState): boolean =>
    st.stage === 'round' && st.round === round && st.phase === 'choose';
  for (let i = 0; i < 120 && !target(s); i++) {
    if (s.request) {
      if (s.awaiting === 'start' && s.stage === 'round' && s.round === round) {
        const use = s.request.use;
        s = provide(s, [
          makePuzzle(phrase, {
            use: [use],
            ...(use === 'prize' ? { prize: { name: 'A TRIP TO MAUI', value: 9800 } } : {}),
          }),
          makePuzzle('SPARE PUZZLE', { use: [use] }),
        ]);
      } else {
        s = provide(s);
      }
    } else if (s.phase === 'tossup-reveal') {
      s = solveTossup(s, starter);
    } else if (s.phase === 'solving') {
      s = wheelReduce(s, { type: 'SOLVE', verdict: 'correct' });
    } else if (s.stage === 'round' && s.phase === 'choose') {
      s = wheelReduce(s, { type: 'SOLVE_START' });
    } else {
      s = wheelReduce(s, { type: 'CONTINUE' });
    }
  }
  if (!target(s)) throw new Error(`could not reach round ${round}: ${s.stage}/${s.phase}`);
  return s;
}

export function wheelOf(s: WheelState): Wedge[] {
  return buildWheel((s.round || 1) as RoundNo, s.specials);
}

/** A SPIN that lands on the first wedge matching `pred` (the Million wedge: on the given third). */
export function spinOn(s: WheelState, pred: (w: Wedge) => boolean, third: 0 | 1 | 2 = 1): WheelAction {
  const i = wheelOf(s).findIndex(pred);
  if (i < 0) throw new Error('no such wedge on the wheel');
  return { type: 'SPIN', draw: drawForIndex(i, third) };
}

export const isCash =
  (value?: number) =>
  (w: Wedge): boolean =>
    w.kind === 'cash' && (value === undefined ? w.top !== true : w.value === value);
export const isKind =
  (kind: Wedge['kind']) =>
  (w: Wedge): boolean =>
    w.kind === kind;

export function team(s: WheelState, id: TeamId) {
  const t = s.teams.find((x) => x.id === id);
  if (!t) throw new Error(`no team ${id}`);
  return t;
}

/** Letters of the phrase in play that are consonants / vowels not yet called. */
export function uncalled(s: WheelState, kind: 'consonant' | 'vowel'): string[] {
  const ps = s.puzzle;
  if (!ps) return [];
  const vowels = 'AEIOU';
  const letters = [...new Set(ps.tiles.map((t) => t.char))];
  return letters.filter((l) => (kind === 'vowel') === vowels.includes(l) && !ps.called.includes(l));
}

/** A consonant that is NOT in the puzzle and not yet called. */
export function missLetter(s: WheelState): string {
  const ps = s.puzzle;
  const letter = CONSONANTS.find((l) => !ps?.tiles.some((t) => t.char === l) && !ps?.called.includes(l));
  if (!letter) throw new Error('no miss letter');
  return letter;
}

/**
 * Plays the game forward until `until` holds: toss-ups go to team 1, every round puzzle is solved by the
 * team in control, the Speed-Up spins a $600 wedge. Stops (without throwing) at the Bonus Round.
 */
export function autoplay(
  s: WheelState,
  until: (st: WheelState) => boolean,
  onStep?: (st: WheelState) => void,
): WheelState {
  let st = s;
  for (let i = 0; i < 400 && !until(st); i++) {
    const before = st;
    if (st.request) st = provide(st);
    else if (st.phase === 'tossup-reveal') st = solveTossup(st, 1);
    else if (st.phase === 'tossup-done' || st.phase === 'round-award')
      st = wheelReduce(st, { type: 'CONTINUE' });
    else if (st.phase === 'choose' || st.phase === 'speedup-act')
      st = wheelReduce(st, { type: 'SOLVE_START' });
    else if (st.phase === 'solving') st = wheelReduce(st, { type: 'SOLVE', verdict: 'correct' });
    else if (st.phase === 'speedup-spin')
      st = wheelReduce(st, { type: 'SPEEDUP_SPIN', draw: drawForIndex(1) });
    else break;
    if (st === before) break;
    onStep?.(st);
  }
  return st;
}
