/**
 * Fast Money engine. Implements docs/FAMILY_FEUD_RULES.md, section Fast Money (rules 1-7).
 * A self-contained reducer; the Feud engine wraps it in FAST_MONEY{sub}. There are no timers
 * in here: the controller advances the clock with TICK{ms}. Judging is injected: ANSWER carries
 * the survey slot (and optional group) its text was judged to match.
 */
import { normalizeAnswer } from '../../judging/normalize';
import type {
  FastMoneyAction,
  FastMoneyEventPayload,
  FastMoneyPhase,
  FastMoneyPlayer,
  FastMoneyRecord,
  FastMoneyState,
  FeudSurveyInput,
  Side,
} from './types';

export const FM_QUESTION_COUNT = 5;
export const FM_P1_MS = 20_000;
export const FM_P2_MS = 25_000;
export const FM_JACKPOT = 200;
/**
 * Reveal steps per player: for each of the five questions "You said" then "Survey said"
 * (10 steps), then the board clears except the total (step 11).
 */
export const REVEAL_STEPS = FM_QUESTION_COUNT * 2 + 1;
const MAX_EVENTS = 100;

const emptyRecords = (): (FastMoneyRecord | null)[] => Array.from({ length: FM_QUESTION_COUNT }, () => null);

export const createFastMoney = (init: { family: Side; podiumSize: number }): FastMoneyState => ({
  phase: 'setup',
  family: init.family,
  podiumSize: Math.max(1, Math.floor(init.podiumSize)),
  players: null,
  questions: [],
  records: { p1: emptyRecords(), p2: emptyRecords() },
  queue: [],
  clock: { remainingMs: 0, running: false },
  reveal: { p1: 0, p2: 0 },
  endedEarly: false,
  outcome: null,
  seq: 0,
  events: [],
});

// ---------------------------------------------------------------- derived values

const recordOf = (fm: FastMoneyState, player: FastMoneyPlayer, question: number): FastMoneyRecord | null =>
  (player === 1 ? fm.records.p1 : fm.records.p2)[question] ?? null;

export const recordPoints = (fm: FastMoneyState, player: FastMoneyPlayer, question: number): number => {
  const record = recordOf(fm, player, question);
  const slot = record?.slot;
  if (slot === null || slot === undefined) return 0;
  return fm.questions[question]?.answers[slot]?.points ?? 0;
};

/** Points of one player that have been shown (their "Survey said" step has happened). */
export const shownPoints = (fm: FastMoneyState, player: FastMoneyPlayer): number => {
  const steps = player === 1 ? fm.reveal.p1 : fm.reveal.p2;
  let sum = 0;
  for (let question = 0; question < FM_QUESTION_COUNT; question += 1) {
    if (steps > question * 2 + 1) sum += recordPoints(fm, player, question);
  }
  return sum;
};

/** The combined total on the board: only points already shown count (rules, Fast Money 7). */
export const fastMoneyTotal = (fm: FastMoneyState): number => shownPoints(fm, 1) + shownPoints(fm, 2);

/** All of one player's points, shown or not. Host-only. */
export const rawPoints = (fm: FastMoneyState, player: FastMoneyPlayer): number => {
  let sum = 0;
  for (let question = 0; question < FM_QUESTION_COUNT; question += 1)
    sum += recordPoints(fm, player, question);
  return sum;
};

export const fastMoneyWon = (fm: FastMoneyState): boolean => fm.phase === 'done' && fm.outcome === 'jackpot';

export const currentQuestionIndex = (fm: FastMoneyState): number | null => fm.queue[0] ?? null;

export const activePlayer = (fm: FastMoneyState): FastMoneyPlayer | null => {
  if (fm.phase === 'p1-playing') return 1;
  if (fm.phase === 'p2-playing') return 2;
  return null;
};

// ---------------------------------------------------------------- helpers

const emit = (
  fm: FastMoneyState,
  patch: Partial<FastMoneyState>,
  payloads: readonly FastMoneyEventPayload[] = [],
): FastMoneyState => {
  let seq = fm.seq;
  const added = payloads.map((payload) => ({ ...payload, seq: seq++ }));
  const events = added.length > 0 ? [...fm.events, ...added].slice(-MAX_EVENTS) : fm.events;
  return { ...fm, ...patch, seq, events };
};

const isValidFmSurvey = (question: FeudSurveyInput): boolean =>
  question.answers.length > 0 &&
  question.answers.every(
    (entry) => entry.answer.trim() !== '' && Number.isFinite(entry.points) && entry.points >= 0,
  );

const withRecord = (
  fm: FastMoneyState,
  player: FastMoneyPlayer,
  question: number,
  record: FastMoneyRecord | null,
): FastMoneyState['records'] => {
  const replace = (list: readonly (FastMoneyRecord | null)[]): (FastMoneyRecord | null)[] =>
    list.map((entry, index) => (index === question ? record : entry));
  return player === 1
    ? { p1: replace(fm.records.p1), p2: fm.records.p2 }
    : { p1: fm.records.p1, p2: replace(fm.records.p2) };
};

/** Moves to 'p1-ready' once both the questions and the players are known. */
const settleSetup = (fm: FastMoneyState, extra: readonly FastMoneyEventPayload[]): FastMoneyState => {
  const ready = fm.players !== null && fm.questions.length === FM_QUESTION_COUNT;
  return emit(
    fm,
    ready ? { phase: 'p1-ready', clock: { remainingMs: FM_P1_MS, running: false } } : {},
    extra,
  );
};

const finish = (
  fm: FastMoneyState,
  extra: readonly FastMoneyEventPayload[],
  endedEarly: boolean,
): FastMoneyState => {
  const total = fastMoneyTotal(fm);
  const won = total >= FM_JACKPOT;
  return emit(
    fm,
    {
      phase: 'done',
      endedEarly,
      outcome: won ? 'jackpot' : 'consolation',
      clock: { remainingMs: fm.clock.remainingMs, running: false },
      queue: [],
    },
    [...extra, { type: 'FAST_MONEY_DONE', total, won, endedEarly }],
  );
};

const endTurn = (fm: FastMoneyState, player: FastMoneyPlayer, extra: readonly FastMoneyEventPayload[]) =>
  emit(
    fm,
    {
      phase: player === 1 ? 'p1-reveal' : 'p2-reveal',
      queue: [],
      clock: { remainingMs: fm.clock.remainingMs, running: false },
    },
    extra,
  );

const isDuplicate = (
  fm: FastMoneyState,
  question: number,
  text: string,
  slot: number | null,
  group: string | undefined,
): boolean => {
  const first = recordOf(fm, 1, question);
  if (first === null) return false;
  if (normalizeAnswer(first.text) === normalizeAnswer(text) && normalizeAnswer(text) !== '') return true;
  if (slot !== null && first.slot === slot) return true;
  return group !== undefined && first.group !== undefined && first.group === group;
};

const validIndex = (length: number, index: number): boolean =>
  Number.isInteger(index) && index >= 0 && index < length;

const PLAYING: readonly FastMoneyPhase[] = ['p1-playing', 'p2-playing'];

// ---------------------------------------------------------------- reducer

export function reduceFastMoney(fm: FastMoneyState, action: FastMoneyAction): FastMoneyState {
  switch (action.type) {
    case 'PROVIDE_QUESTIONS': {
      if (fm.phase !== 'setup' && fm.phase !== 'p1-ready') return fm;
      if (action.questions.length !== FM_QUESTION_COUNT || !action.questions.every(isValidFmSurvey))
        return fm;
      return settleSetup({ ...fm, questions: action.questions }, [{ type: 'QUESTIONS_PROVIDED' }]);
    }
    case 'CHOOSE_PLAYERS': {
      if (fm.phase !== 'setup' && fm.phase !== 'p1-ready') return fm;
      const { p1, p2 } = action;
      const inRange = (n: number): boolean => Number.isInteger(n) && n >= 0 && n < fm.podiumSize;
      if (!inRange(p1) || !inRange(p2)) return fm;
      if (p1 === p2 && fm.podiumSize > 1) return fm;
      return settleSetup({ ...fm, players: { p1, p2 } }, [{ type: 'PLAYERS_CHOSEN', p1, p2 }]);
    }
    case 'START_CLOCK': {
      if (fm.phase !== 'p1-ready' && fm.phase !== 'p2-ready') return fm;
      const player: FastMoneyPlayer = fm.phase === 'p1-ready' ? 1 : 2;
      const ms = player === 1 ? FM_P1_MS : FM_P2_MS;
      const queue = Array.from({ length: FM_QUESTION_COUNT }, (_, index) => index);
      return emit(
        fm,
        {
          phase: player === 1 ? 'p1-playing' : 'p2-playing',
          queue,
          clock: { remainingMs: ms, running: true },
        },
        [
          { type: 'CLOCK_STARTED', player, ms },
          { type: 'QUESTION_SHOWN', player, question: 0 },
        ],
      );
    }
    case 'TICK': {
      const player = activePlayer(fm);
      if (player === null || !fm.clock.running || !Number.isFinite(action.ms) || action.ms <= 0) return fm;
      const remainingMs = Math.max(0, fm.clock.remainingMs - action.ms);
      if (remainingMs > 0) return { ...fm, clock: { remainingMs, running: true } };
      return endTurn({ ...fm, clock: { remainingMs: 0, running: false } }, player, [
        { type: 'TIME_UP', player },
      ]);
    }
    case 'PAUSE': {
      if (activePlayer(fm) === null || !fm.clock.running) return fm;
      return emit(fm, { clock: { remainingMs: fm.clock.remainingMs, running: false } }, [
        { type: 'CLOCK_PAUSED' },
      ]);
    }
    case 'RESUME': {
      if (activePlayer(fm) === null || fm.clock.running || fm.clock.remainingMs <= 0) return fm;
      return emit(fm, { clock: { remainingMs: fm.clock.remainingMs, running: true } }, [
        { type: 'CLOCK_RESUMED' },
      ]);
    }
    case 'ANSWER': {
      const player = activePlayer(fm);
      const question = fm.queue[0];
      if (player === null || question === undefined) return fm;
      const text = action.text.trim();
      const { slot, group } = action.judged;
      if (text === '') return fm;
      const survey = fm.questions[question];
      if (survey === undefined) return fm;
      if (slot !== null && !validIndex(survey.answers.length, slot)) return fm;

      if (player === 2 && isDuplicate(fm, question, text, slot, group)) {
        // Double buzz and "Try again": nothing is recorded and the clock keeps running.
        return emit(fm, {}, [{ type: 'DUPLICATE', player, question }]);
      }
      const record: FastMoneyRecord = group === undefined ? { text, slot } : { text, slot, group };
      const queue = fm.queue.slice(1);
      const recorded = emit(fm, { records: withRecord(fm, player, question, record), queue }, [
        { type: 'ANSWERED', player, question },
      ]);
      const next = queue[0];
      if (next === undefined) return endTurn(recorded, player, [{ type: 'ALL_ANSWERED', player }]);
      return emit(recorded, {}, [{ type: 'QUESTION_SHOWN', player, question: next }]);
    }
    case 'PASS': {
      const player = activePlayer(fm);
      const question = fm.queue[0];
      if (player === null || question === undefined) return fm;
      // A passed question goes to the back of the line and comes back if time remains.
      const queue = [...fm.queue.slice(1), question];
      const shown = queue[0] ?? question;
      return emit(fm, { queue }, [
        { type: 'PASSED', player, question },
        { type: 'QUESTION_SHOWN', player, question: shown },
      ]);
    }
    case 'REVEAL_NEXT': {
      if (fm.phase !== 'p1-reveal' && fm.phase !== 'p2-reveal') return fm;
      const player: FastMoneyPlayer = fm.phase === 'p1-reveal' ? 1 : 2;
      const step = player === 1 ? fm.reveal.p1 : fm.reveal.p2;
      if (step >= REVEAL_STEPS) return fm;
      const reveal = player === 1 ? { p1: step + 1, p2: fm.reveal.p2 } : { p1: fm.reveal.p1, p2: step + 1 };
      const shown = { ...fm, reveal };
      if (step < REVEAL_STEPS - 1) {
        const question = Math.floor(step / 2);
        const record = recordOf(fm, player, question);
        if (step % 2 === 0) {
          return emit(fm, { reveal }, [{ type: 'YOU_SAID', player, question, text: record?.text ?? null }]);
        }
        const matched =
          record !== null && record.slot !== null ? fm.questions[question]?.answers[record.slot] : undefined;
        return emit(fm, { reveal }, [
          {
            type: 'SURVEY_SAID',
            player,
            question,
            answer: matched?.answer ?? null,
            points: matched?.points ?? 0,
            total: fastMoneyTotal(shown),
          },
        ]);
      }
      const cleared: FastMoneyEventPayload = { type: 'BOARD_CLEARED', player, total: fastMoneyTotal(shown) };
      if (player === 1) {
        // Player 1 alone reaching 200 ends it; Player 2 does not play (rules, Fast Money 5).
        if (shownPoints(shown, 1) >= FM_JACKPOT) return finish(emit(fm, { reveal }, [cleared]), [], false);
        return emit(fm, { reveal, phase: 'p2-ready', clock: { remainingMs: FM_P2_MS, running: false } }, [
          cleared,
        ]);
      }
      return finish(emit(fm, { reveal }, [cleared]), [], false);
    }
    case 'HOST_SET_MATCH': {
      if (fm.phase === 'done' || fm.phase === 'setup') return fm;
      const { player, question, slot } = action;
      const group = action.group;
      if (!Number.isInteger(question) || question < 0 || question >= FM_QUESTION_COUNT) return fm;
      const survey = fm.questions[question];
      const current = recordOf(fm, player, question);
      if (survey === undefined || current === null) return fm;
      if (slot !== null && !validIndex(survey.answers.length, slot)) return fm;
      const same = (a: string | undefined, b: string | undefined): boolean => a !== undefined && a === b;

      const other = recordOf(fm, player === 1 ? 2 : 1, question);
      let records = fm.records;
      const extra: FastMoneyEventPayload[] = [];
      if (other !== null) {
        const clash = (slot !== null && other.slot === slot) || same(other.group, group);
        if (clash) {
          // A correction can never let Player 2 score Player 1's answer to the same question.
          if (player === 2) return fm;
          // To give Player 1 what Player 2 holds, Player 2's answer is ruled off the survey first.
          records = withRecord({ ...fm, records }, 2, question, { ...other, slot: null, group: undefined });
          extra.push({ type: 'RULED_OFF', player: 2, question });
        }
      }
      if (current.slot === slot && current.group === group && extra.length === 0) return fm;
      const updated: FastMoneyRecord =
        group === undefined ? { text: current.text, slot } : { text: current.text, slot, group };
      records = withRecord({ ...fm, records }, player, question, updated);
      return emit(fm, { records }, [...extra, { type: 'MATCH_SET', player, question, slot }]);
    }
    case 'END_EARLY': {
      if (fm.phase === 'done') return fm;
      return finish(fm, [], true);
    }
  }
}

export const isPlayingPhase = (phase: FastMoneyPhase): boolean => PLAYING.includes(phase);

const PROBE_QUESTION: FeudSurveyInput = {
  id: 'probe',
  question: '?',
  answers: [{ answer: 'a', points: 1 }],
};

/** Action types that would change the state right now, found by trying a representative action. */
export const legalFastMoneyActions = (fm: FastMoneyState): FastMoneyAction['type'][] => {
  const probes: FastMoneyAction[] = [
    { type: 'PROVIDE_QUESTIONS', questions: Array.from({ length: FM_QUESTION_COUNT }, () => PROBE_QUESTION) },
    { type: 'CHOOSE_PLAYERS', p1: 0, p2: fm.podiumSize > 1 ? 1 : 0 },
    { type: 'START_CLOCK' },
    { type: 'TICK', ms: 1 },
    { type: 'PAUSE' },
    { type: 'RESUME' },
    { type: 'ANSWER', text: 'probe', judged: { slot: null } },
    { type: 'PASS' },
    { type: 'REVEAL_NEXT' },
    { type: 'END_EARLY' },
  ];
  const legal = probes.filter((probe) => reduceFastMoney(fm, probe) !== fm).map((probe) => probe.type);
  const canCorrect = ([1, 2] as const).some((player) =>
    fm.questions.some((_, question) => {
      const record = recordOf(fm, player, question);
      if (record === null) return false;
      const probe: FastMoneyAction = {
        type: 'HOST_SET_MATCH',
        player,
        question,
        slot: record.slot === null ? 0 : null,
      };
      return reduceFastMoney(fm, probe) !== fm;
    }),
  );
  return canCorrect ? [...legal, 'HOST_SET_MATCH'] : legal;
};
