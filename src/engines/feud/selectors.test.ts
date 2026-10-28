import { describe, expect, it } from 'vitest';
import { feudReducer } from './feudEngine';
import {
  audienceView,
  gameEndReport,
  hostView,
  legalActions,
  legalFastMoney,
  stakes,
  whoIsAnswering,
} from './selectors';
import {
  SURVEY,
  atControl,
  atFirstAnswer,
  atPlayOrPass,
  atSteal,
  clearBoard,
  makeGame,
  roundWonBy,
  run,
  startRound,
  survey,
} from './testFixtures';
import type { FastMoneyAction, FeudAction, FeudState, FeudSurveyInput } from './types';

const fmQuestion = (i: number, top = 40): FeudSurveyInput =>
  survey(`fm-${i}`, [
    [`Zebra${i}`, top, [`stripey${i}`]],
    [`Yak${i}`, 30],
    [`Xylo${i}`, 20],
    [`Wombat${i}`, 10],
  ]);

const fmQuestions = (top = 40): FeudSurveyInput[] => [0, 1, 2, 3, 4].map((i) => fmQuestion(i, top));

const sub = (state: FeudState, ...actions: FastMoneyAction[]): FeudState =>
  actions.reduce((current, action) => feudReducer(current, { type: 'FAST_MONEY', sub: action }), state);

const answer = (slot: number | null, text: string): FastMoneyAction => ({
  type: 'ANSWER',
  text,
  judged: { slot },
});

/** Family A has won the game (300+) and is at the game-won announcement. */
const gameWon = (settings?: Parameters<typeof makeGame>[0]): FeudState =>
  run(roundWonBy(run(makeGame(settings), { type: 'START_GAME' }), 'A', survey('big', [['Only', 300]])), {
    type: 'NEXT_ROUND',
  });

const fmReady = (top = 40): FeudState =>
  sub(
    gameWon(),
    { type: 'PROVIDE_QUESTIONS', questions: fmQuestions(top) },
    { type: 'CHOOSE_PLAYERS', p1: 0, p2: 2 },
  );

const revealAll = (state: FeudState): FeudState => {
  let current = state;
  const phase = state.fastMoney?.phase;
  while (current.fastMoney?.phase === phase) {
    const next = sub(current, { type: 'REVEAL_NEXT' });
    if (next === current) break;
    current = next;
  }
  return current;
};

const HIDDEN_WORDS = ['Burger', 'Tacos', 'Salad', 'Soup', 'pie'];

describe('audienceView (P-002: the audience never sees hidden information)', () => {
  const states: [string, FeudState][] = [
    ['face-off, nothing revealed', run(atFirstAnswer('A'))],
    ['face-off, one revealed', run(atFirstAnswer('A'), { type: 'FACEOFF_ANSWER', slot: 1 })],
    ['play-or-pass', atPlayOrPass('A')],
    ['control', run(atControl('A'), { type: 'ANSWER', slot: 'miss' })],
    ['steal-confer', atSteal('A')],
    ['steal-answer', run(atSteal('A'), { type: 'END_CONFER' })],
  ];

  it.each(states)('JSON of the audience view has no hidden answer text in %s', (_name, state) => {
    const json = JSON.stringify(audienceView(state));
    const revealed = new Set(state.board.filter((slot) => slot.revealed).map((slot) => slot.answer));
    for (const slot of state.board) {
      if (revealed.has(slot.answer)) continue;
      expect(json).not.toContain(slot.answer);
      for (const alias of slot.aliases) expect(json).not.toContain(alias);
    }
    for (const word of HIDDEN_WORDS) {
      if (!revealed.has(word)) expect(json).not.toContain(word);
    }
  });

  it('shows a hidden slot as exactly { revealed: false }', () => {
    const view = audienceView(atControl('A'));
    expect(view.board[0]).toMatchObject({ revealed: true, answer: 'Pizza', points: 40 });
    for (const slot of view.board.slice(1)) expect(slot).toStrictEqual({ revealed: false });
  });

  it('a leftover reveal shows the slot but a hidden one stays hidden', () => {
    const decided = run(atSteal('A'), { type: 'STEAL_ANSWER', slot: 'miss' }, { type: 'REVEAL_NEXT' });
    const view = audienceView(decided);
    expect(view.board[4]).toMatchObject({ revealed: true, answer: 'Soup' });
    expect(view.board[3]).toStrictEqual({ revealed: false });
    expect(JSON.stringify(view)).not.toContain('Salad');
  });

  it('hides the question until the round is on and shows the round state', () => {
    expect(audienceView(run(makeGame(), { type: 'START_GAME' })).question).toBeNull();
    const view = audienceView(atControl('A'));
    expect(view.question).toBe(SURVEY.question);
    expect(view).toMatchObject({
      phase: 'control',
      round: 1,
      multiplier: 1,
      bank: 40,
      strikes: 0,
      control: 'A',
    });
    expect(view.answering).toEqual({ side: 'A', playerIndex: 1, role: 'control' });
    expect(view.families.A).toEqual({ side: 'A', teamId: 'team-a', podiumSize: 5, score: 0 });
  });

  it('holds back the game winner and the round result until they are announced', () => {
    const control = audienceView(atControl('A'));
    expect(control.gameWinner).toBeNull();
    expect(control.roundResult).toBeNull();
    const decided = audienceView(clearBoard(atControl('A')));
    expect(decided.roundResult).toMatchObject({ winner: 'A', how: 'cleared' });
    expect(audienceView(gameWon()).gameWinner).toBe('A');
    const early = run(
      roundWonBy(run(makeGame(), { type: 'START_GAME' }), 'A', survey('big', [['Only', 300]])),
    );
    expect(early.gameWinner).toBe('A');
    expect(audienceView(early).gameWinner).toBeNull();
  });

  it('does not leak the answers of Fast Money while a player is answering', () => {
    let state = fmReady();
    state = sub(
      state,
      { type: 'START_CLOCK' },
      answer(0, 'secret first answer'),
      answer(1, 'another secret'),
    );
    const json = JSON.stringify(audienceView(state));
    for (const text of [
      'secret first answer',
      'another secret',
      'Zebra',
      'Yak',
      'Xylo',
      'Wombat',
      'stripey',
    ]) {
      expect(json).not.toContain(text);
    }
    const fm = audienceView(state).fastMoney;
    expect(fm?.question).toBe('Question fm-2?');
    expect(fm?.rows).toEqual([]);
    expect(fm?.answering).toBe(1);
  });

  it('shows only the revealed rows of Fast Money during the reveal', () => {
    let state = sub(
      fmReady(),
      { type: 'START_CLOCK' },
      ...[0, 1, 2, 3, 0].map((slot, i) => answer(slot, `said ${i}`)),
    );
    expect(audienceView(state).fastMoney?.question).toBeNull();
    state = sub(state, { type: 'REVEAL_NEXT' });
    let view = audienceView(state).fastMoney;
    expect(view?.rows).toEqual([{ question: 'Question fm-0?', youSaid: 'said 0', surveySaid: null }]);
    expect(JSON.stringify(view)).not.toContain('Zebra0');
    state = sub(state, { type: 'REVEAL_NEXT' });
    view = audienceView(state).fastMoney;
    expect(view?.rows[0]?.surveySaid).toEqual({ answer: 'Zebra0', points: 40 });
    expect(view?.total).toBe(40);
    expect(JSON.stringify(view)).not.toContain('Yak1');
  });

  it('keeps host corrections out of the audience event log', () => {
    let state = sub(
      fmReady(),
      { type: 'START_CLOCK' },
      ...[0, 0, 0, 0, 0].map((slot, i) => answer(slot, `said ${i}`)),
    );
    state = sub(state, { type: 'HOST_SET_MATCH', player: 1, question: 0, slot: 1 });
    expect(JSON.stringify(state.events)).toContain('MATCH_SET');
    expect(JSON.stringify(audienceView(state).events)).not.toContain('MATCH_SET');
    expect(JSON.stringify(audienceView(state).events)).not.toContain('said 0');
  });
});

describe('hostView', () => {
  it('has the full board, aliases and the survey for judging', () => {
    const view = hostView(atControl('A'));
    expect(view.board.map((slot) => slot.answer)).toEqual(['Pizza', 'Burger', 'Tacos', 'Salad', 'Soup']);
    expect(view.judgeSurvey?.answers[0]).toEqual({ answer: 'Pizza', aliases: ['pie'] });
    expect(view.judgeSurvey?.answers).toHaveLength(view.board.length);
    expect(view.answering).toEqual({ side: 'A', playerIndex: 1, role: 'control' });
    expect(view.canUndo).toBe(true);
    expect(view.legalActions).toContain('ANSWER');
  });

  it('has no judge survey before a round', () => {
    expect(hostView(makeGame()).judgeSurvey).toBeNull();
  });

  it('gives stake lines in control: clear the board or hand the bank to a steal', () => {
    const state = run(atControl('A'), { type: 'ANSWER', slot: 1 });
    expect(stakes(state)).toEqual({
      ifWin: { side: 'A', points: 95, reason: 'clear-board' },
      ifLose: { side: 'B', points: 65, reason: 'third-strike-steal' },
    });
    expect(hostView(state).stakes).toEqual(stakes(state));
  });

  it('gives stake lines at the steal: a hit wins the bank for the stealing family, a miss gives it to the other', () => {
    const state = atSteal('A');
    expect(stakes(state)).toEqual({
      ifWin: { side: 'B', points: 40, reason: 'steal-hit' },
      ifLose: { side: 'A', points: 40, reason: 'steal-miss' },
    });
    expect(stakes(run(state, { type: 'END_CONFER' }))).toEqual(stakes(state));
  });

  it('stake lines follow the multiplier', () => {
    const state = run(atControl('A'), { type: 'SET_MULTIPLIER', multiplier: 2 });
    expect(stakes(state)?.ifWin.points).toBe(190);
    expect(stakes(state)?.ifLose.points).toBe(80);
  });

  it('has no stake lines outside control and the steal', () => {
    expect(stakes(atPlayOrPass('A'))).toBeNull();
    expect(stakes(startRound())).toBeNull();
  });

  it('exposes Fast Money answers and raw points only to the host', () => {
    const state = sub(fmReady(), { type: 'START_CLOCK' }, answer(0, 'host sees this'));
    const view = hostView(state);
    expect(JSON.stringify(view)).toContain('host sees this');
    expect(view.fastMoneyRaw).toEqual({ p1: 40, p2: 0 });
    expect(view.legalFastMoney).toContain('ANSWER');
  });
});

describe('whoIsAnswering', () => {
  it('is null before and after the answering phases', () => {
    expect(whoIsAnswering(makeGame())).toBeNull();
    expect(whoIsAnswering(startRound())).toBeNull();
    expect(whoIsAnswering(atPlayOrPass('A'))).toBeNull();
    expect(whoIsAnswering(clearBoard(atControl('A')))).toBeNull();
  });

  it('names the Fast Money player on the clock', () => {
    const state = sub(fmReady(), { type: 'START_CLOCK' });
    expect(whoIsAnswering(state)).toEqual({ side: 'A', playerIndex: 0, role: 'fast-money' });
    const p2 = sub(revealAll(sub(state, ...[1, 1, 1, 1, 1].map((slot, i) => answer(slot, `p ${i}`)))), {
      type: 'START_CLOCK',
    });
    expect(whoIsAnswering(p2)).toEqual({ side: 'A', playerIndex: 2, role: 'fast-money' });
  });
});

describe('legalActions', () => {
  const legal = (state: FeudState): string[] => [...legalActions(state)].sort();

  it.each([
    ['pre-game', makeGame(), ['START_GAME']],
    ['round-intro', run(makeGame(), { type: 'START_GAME' }), ['START_ROUND', 'UNDO']],
    [
      'face-off ready',
      startRound(),
      ['OPEN_BUZZERS', 'REPLACE_SURVEY', 'SET_MULTIPLIER', 'UNDO', 'WHO_BUZZED_FIRST'],
    ],
    ['play-or-pass', atPlayOrPass('A'), ['PASS', 'PLAY', 'REPLACE_SURVEY', 'SET_MULTIPLIER', 'UNDO']],
    ['control', atControl('A'), ['ANSWER', 'REPLACE_SURVEY', 'SET_MULTIPLIER', 'UNDO']],
    [
      'steal-confer',
      atSteal('A'),
      ['END_CONFER', 'REPLACE_SURVEY', 'SET_MULTIPLIER', 'STEAL_ANSWER', 'UNDO'],
    ],
    [
      'steal-answer',
      run(atSteal('A'), { type: 'END_CONFER' }),
      ['REPLACE_SURVEY', 'SET_MULTIPLIER', 'STEAL_ANSWER', 'UNDO'],
    ],
    [
      'round-decided',
      run(atSteal('A'), { type: 'STEAL_ANSWER', slot: 'miss' }),
      ['REVEAL_ALL', 'REVEAL_NEXT', 'UNDO'],
    ],
    ['round-summary', clearBoard(atControl('A')), ['NEXT_ROUND', 'UNDO']],
  ] as [string, FeudState, string[]][])('lists the legal actions in %s', (_name, state, expected) => {
    expect(legal(state)).toEqual([...expected].sort());
  });

  it('lists the face-off answer once buzzers are in', () => {
    expect(legal(atFirstAnswer('A'))).toEqual(
      ['FACEOFF_ANSWER', 'REPLACE_SURVEY', 'SET_MULTIPLIER', 'UNDO', 'WHO_BUZZED_FIRST'].sort(),
    );
    expect(legal(run(startRound(), { type: 'OPEN_BUZZERS' }))).toContain('BUZZ');
  });

  it('offers Fast Money and its skip at the game-won announcement', () => {
    expect(legal(gameWon())).toEqual(['FAST_MONEY', 'SKIP_FAST_MONEY', 'UNDO']);
    expect(legalFastMoney(gameWon())).toEqual(['PROVIDE_QUESTIONS', 'CHOOSE_PLAYERS', 'END_EARLY']);
  });

  it('without Fast Money enabled only the skip remains', () => {
    expect(legal(gameWon({ fastMoneyEnabled: false }))).toEqual(['SKIP_FAST_MONEY', 'UNDO']);
  });

  it('offers nothing but the game-over report at the end', () => {
    const over = run(gameWon(), { type: 'SKIP_FAST_MONEY' });
    expect(legalActions(over)).toEqual([]);
  });

  it('every listed action really changes the state, and unlisted ones do not', () => {
    const probes: FeudAction[] = [{ type: 'PLAY' }, { type: 'ANSWER', slot: 'miss' }, { type: 'NEXT_ROUND' }];
    const state = atControl('A');
    for (const probe of probes) {
      const changed = feudReducer(state, probe) !== state;
      expect(legalActions(state).includes(probe.type)).toBe(changed);
    }
  });
});

describe('Fast Money inside the Feud engine', () => {
  it('the first Fast Money action moves the phase from game-won to fast-money', () => {
    const won = gameWon();
    expect(won.phase).toBe('game-won');
    expect(won.fastMoney?.family).toBe('A');
    const state = sub(won, { type: 'PROVIDE_QUESTIONS', questions: fmQuestions() });
    expect(state.phase).toBe('fast-money');
    expect(state.events.at(-1)).toMatchObject({ type: 'FAST_MONEY', event: { type: 'QUESTIONS_PROVIDED' } });
  });

  it('is refused outside the game-won and fast-money phases, and when disabled', () => {
    const start: FeudAction = { type: 'FAST_MONEY', sub: { type: 'END_EARLY' } };
    const control = atControl('A');
    expect(feudReducer(control, start)).toBe(control);
    const disabled = gameWon({ fastMoneyEnabled: false });
    expect(feudReducer(disabled, start)).toBe(disabled);
  });

  it('ticks update the clock without growing the undo history', () => {
    const playing = sub(fmReady(), { type: 'START_CLOCK' });
    const historyLength = playing.history.length;
    const ticked = sub(playing, { type: 'TICK', ms: 1000 }, { type: 'TICK', ms: 1000 });
    expect(ticked.fastMoney?.clock.remainingMs).toBe(18_000);
    expect(ticked.history).toHaveLength(historyLength);
    expect(ticked.seq).toBe(playing.seq);
  });

  it('UNDO of a Fast Money answer keeps the real clock, paused', () => {
    const playing = sub(fmReady(), { type: 'START_CLOCK' }, answer(0, 'first'));
    const ticked = sub(playing, { type: 'TICK', ms: 4000 }, answer(1, 'second'));
    const undone = run(ticked, { type: 'UNDO' });
    expect(undone.fastMoney?.records.p1[1]).toBeNull();
    expect(undone.fastMoney?.clock.remainingMs).toBe(16_000);
    expect(undone.fastMoney?.clock.running).toBe(true);
  });

  it('merges Fast Money events into one monotonic stream', () => {
    const state = sub(fmReady(), { type: 'START_CLOCK' }, answer(0, 'a'));
    const seqs = state.events.map((event) => event.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(state.events.some((event) => event.type === 'FAST_MONEY' && event.event.type === 'ANSWERED')).toBe(
      true,
    );
  });

  it('SKIP_FAST_MONEY is allowed before Fast Money starts but not once a player is on the clock', () => {
    const chosen = fmReady();
    expect(run(chosen, { type: 'SKIP_FAST_MONEY' }).phase).toBe('game-over');
    const playing = sub(chosen, { type: 'START_CLOCK' });
    expect(feudReducer(playing, { type: 'SKIP_FAST_MONEY' })).toBe(playing);
  });
});

describe('gameEndReport (FR-037)', () => {
  const finishFastMoney = (p1: (number | null)[], p2: (number | null)[], top = 40): FeudState => {
    let state = sub(fmReady(top), { type: 'START_CLOCK' }, ...p1.map((slot, i) => answer(slot, `p1 ${i}`)));
    state = revealAll(state);
    if (state.phase === 'game-over') return state;
    state = sub(state, { type: 'START_CLOCK' }, ...p2.map((slot, i) => answer(slot, `p2 ${i}`)));
    return revealAll(state);
  };

  it('is null until the game is over', () => {
    expect(gameEndReport(makeGame())).toBeNull();
    expect(gameEndReport(atControl('A'))).toBeNull();
    expect(gameEndReport(gameWon())).toBeNull();
    expect(gameEndReport(fmReady())).toBeNull();
  });

  it('credits game score plus Fast Money points, the loser its game score, and a bonus chip for 200', () => {
    // Player 1: 30 x 5 = 150; Player 2: 20 + 20 + 10 + 0 + 0 = 50. Total 200.
    const over = finishFastMoney([1, 1, 1, 1, 1], [2, 2, 3, null, null]);
    expect(over.phase).toBe('game-over');
    expect(gameEndReport(over)).toEqual({
      winnerId: 'team-a',
      points: 300 + 200,
      extraScores: [{ team: 'team-b', points: 0 }],
      bonusChips: 1,
    });
  });

  it('a consolation pays the Fast Money points without a bonus chip', () => {
    const over = finishFastMoney([1, 1, 1, 1, 1], [3, null, null, null, null]);
    expect(gameEndReport(over)).toEqual({
      winnerId: 'team-a',
      points: 300 + 160,
      extraScores: [{ team: 'team-b', points: 0 }],
      bonusChips: 0,
    });
  });

  it('Player 1 reaching 200 alone ends the game with the bonus chip', () => {
    const over = finishFastMoney([0, 0, 0, 0, 0], [], 50);
    expect(over.phase).toBe('game-over');
    expect(gameEndReport(over)).toMatchObject({ points: 300 + 250, bonusChips: 1 });
  });

  it('ending Fast Money early counts the shown points and only a shown 200 wins', () => {
    let state = sub(
      fmReady(),
      { type: 'START_CLOCK' },
      ...[0, 0, 0, 0, 0].map((slot, i) => answer(slot, `p1 ${i}`)),
    );
    for (let i = 0; i < 4; i += 1) state = sub(state, { type: 'REVEAL_NEXT' });
    state = sub(state, { type: 'END_EARLY' });
    expect(state.phase).toBe('game-over');
    expect(gameEndReport(state)).toMatchObject({ points: 300 + 80, bonusChips: 0 });
  });

  it('the loser keeps its game score and the winner is the family that won the game', () => {
    let state = run(makeGame(), { type: 'START_GAME' });
    state = roundWonBy(state, 'B', survey('r1', [['x', 100]]));
    state = run(state, { type: 'NEXT_ROUND' });
    state = roundWonBy(state, 'A', survey('r2', [['x', 40]]));
    state = run(state, { type: 'NEXT_ROUND' });
    state = roundWonBy(state, 'B', survey('r3', [['x', 105]]));
    expect(state.families.B.score).toBe(100 + 210);
    state = run(state, { type: 'NEXT_ROUND' }, { type: 'SKIP_FAST_MONEY' });
    expect(gameEndReport(state)).toEqual({
      winnerId: 'team-b',
      points: 310,
      extraScores: [{ team: 'team-a', points: 40 }],
      bonusChips: 0,
    });
  });

  it('is stable: the same state always gives the same report', () => {
    const over = run(gameWon(), { type: 'SKIP_FAST_MONEY' });
    expect(gameEndReport(over)).toEqual(gameEndReport(over));
  });
});
