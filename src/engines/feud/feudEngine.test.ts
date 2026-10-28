import { describe, expect, it } from 'vitest';
import { computeBank, leftoverOrder, multiplierForRound } from './board';
import { createFeudState, feudReducer, MAX_HISTORY } from './feudEngine';
import { audienceView, gameEndReport, whoIsAnswering } from './selectors';
import {
  SD_SURVEY,
  SURVEY,
  afterFourRounds,
  atSuddenDeath,
  SURVEY_2,
  atControl,
  atFirstAnswer,
  atPlayOrPass,
  atSteal,
  clearBoard,
  eventTypes,
  makeGame,
  roundWonBy,
  run,
  startRound,
  strikeOut,
  survey,
} from './testFixtures';
import type { FeudAction, FeudState } from './types';

const expectIllegal = (state: FeudState, action: FeudAction): void => {
  expect(feudReducer(state, action)).toBe(state);
};

describe('Main game 1. Rounds', () => {
  it('"Round 1 single points, round 2 single, round 3 double, round 4 triple"', () => {
    expect([1, 2, 3, 4].map((round) => multiplierForRound(round, false))).toEqual([1, 1, 2, 3]);

    let state = run(makeGame(), { type: 'START_GAME' });
    const seen: number[] = [];
    const banks: number[] = [];
    for (const winner of ['A', 'B', 'A', 'B'] as const) {
      state = run(state, { type: 'START_ROUND', survey: SURVEY });
      seen.push(state.multiplier);
      state = roundWonBy(run(state), winner, SURVEY);
      banks.push(state.roundResult?.bank ?? -1);
      if (state.gameWinner !== null) break;
      state = run(state, { type: 'NEXT_ROUND' });
    }
    expect(seen).toEqual([1, 1, 2, 3]);
    // The full board is 95 points: x1, x1, x2, x3.
    expect(banks).toEqual([95, 95, 190, 285]);
  });

  it('"The game is decided only when a round is decided": a bank over the target mid-round decides nothing', () => {
    const big = survey('big', [
      ['One', 90],
      ['Two', 80],
      ['Three', 70],
      ['Four', 10],
    ]);
    let state = atControl('A', big, { targetScore: 200 });
    state = run(state, { type: 'ANSWER', slot: 1 }, { type: 'ANSWER', slot: 2 });
    expect(state.bank).toBe(240);
    expect(state.phase).toBe('control');
    expect(state.gameWinner).toBeNull();
    expect(state.families.A.score).toBe(0);
  });

  it('"after each round, a family with 300 or more wins": 300 exactly is enough', () => {
    const exact = survey('exact', [
      ['One', 200],
      ['Two', 100],
    ]);
    const state = roundWonBy(run(makeGame(), { type: 'START_GAME' }), 'A', exact);
    expect(state.families.A.score).toBe(300);
    expect(state.gameWinner).toBe('A');
    const next = run(state, { type: 'NEXT_ROUND' });
    expect(next.phase).toBe('game-won');
    expect(eventTypes(next)).toContain('GAME_WON');
  });

  it('"after each round, a family with 300 or more wins": 299 is not enough', () => {
    const almost = survey('almost', [
      ['One', 200],
      ['Two', 99],
    ]);
    const state = roundWonBy(run(makeGame(), { type: 'START_GAME' }), 'A', almost);
    expect(state.families.A.score).toBe(299);
    expect(state.gameWinner).toBeNull();
    expect(run(state, { type: 'NEXT_ROUND' }).phase).toBe('round-intro');
  });

  it('"If nobody has 300 after round 4, the game goes to Sudden Death"', () => {
    let state = afterFourRounds();
    expect(state.roundNumber).toBe(4);
    expect(state.gameWinner).toBeNull();
    state = run(state, { type: 'NEXT_ROUND' });
    expect(state.phase).toBe('sudden-death');
    expect(state.suddenDeath).toBe(true);
    expect(state.roundNumber).toBe(5);
  });

  it('"The target is a host setting (300 by default)": 200, 300, 400 and 500 are accepted', () => {
    expect(makeGame().settings.targetScore).toBe(300);
    for (const target of [200, 300, 400, 500] as const) {
      expect(makeGame({ targetScore: target }).settings.targetScore).toBe(target);
    }
    expect(makeGame({ targetScore: 250 as 200 }).settings.targetScore).toBe(300);
  });

  it('"The target is a host setting": a lower target ends the game earlier', () => {
    const state = roundWonBy(
      run(makeGame({ targetScore: 200 }), { type: 'START_GAME' }),
      'A',
      survey('t', [['x', 200]]),
    );
    expect(state.gameWinner).toBe('A');
  });

  it('FR-032 short format: in "one-round" the round winner wins the game whatever the score', () => {
    const state = roundWonBy(
      run(makeGame({ format: 'one-round' }), { type: 'START_GAME' }),
      'B',
      survey('t', [['x', 1]]),
    );
    expect(state.gameWinner).toBe('B');
    expect(run(state, { type: 'NEXT_ROUND' }).phase).toBe('game-won');
  });
});

describe('Main game 2. Face-off', () => {
  it('"round 1 the captains, round 2 the #2s, ... Sudden Death the #5s"', () => {
    let state = atFirstAnswer('A');
    expect(whoIsAnswering(state)).toEqual({ side: 'A', playerIndex: 0, role: 'face-off' });
    state = run(state, { type: 'FACEOFF_ANSWER', slot: 'miss' });
    expect(whoIsAnswering(state)).toEqual({ side: 'B', playerIndex: 0, role: 'face-off' });

    const tiny = survey('tiny', [['x', 1]]);
    let game = run(makeGame(), { type: 'START_GAME' });
    const players: number[] = [];
    for (const round of [1, 2, 3, 4]) {
      game = run(
        game,
        { type: 'START_ROUND', survey: tiny },
        { type: 'OPEN_BUZZERS' },
        { type: 'BUZZ', team: 'A', at: 1 },
      );
      players.push(whoIsAnswering(game)?.playerIndex ?? -1);
      game = clearBoard(run(game, { type: 'FACEOFF_ANSWER', slot: 0 }, { type: 'PLAY' }));
      if (round < 4) game = run(game, { type: 'NEXT_ROUND' });
    }
    expect(players).toEqual([0, 1, 2, 3]);
    game = run(game, { type: 'NEXT_ROUND' });
    game = run(
      game,
      { type: 'START_SUDDEN_DEATH', survey: SD_SURVEY },
      { type: 'OPEN_BUZZERS' },
      { type: 'BUZZ', team: 'B', at: 1 },
    );
    expect(whoIsAnswering(game)).toEqual({ side: 'B', playerIndex: 4, role: 'face-off' });
  });

  it('"a team with a different player count wraps around its own size"', () => {
    const tiny = survey('tiny', [['x', 1]]);
    let game = run(makeGame(undefined, { A: 2, B: 3 }), { type: 'START_GAME' });
    for (const round of [1, 2, 3]) {
      game = run(
        game,
        { type: 'START_ROUND', survey: tiny },
        { type: 'OPEN_BUZZERS' },
        { type: 'BUZZ', team: 'A', at: 1 },
        { type: 'FACEOFF_ANSWER', slot: 'miss' },
      );
      const second = whoIsAnswering(game);
      // Round 3: family A (2 players) wraps to #1 while B (3 players) is on #3.
      if (round === 3) expect(second).toEqual({ side: 'B', playerIndex: 2, role: 'face-off' });
      game = clearBoard(run(game, { type: 'FACEOFF_ANSWER', slot: 0 }, { type: 'PLAY' }));
      game = run(game, { type: 'NEXT_ROUND' });
    }
    game = run(
      game,
      { type: 'START_ROUND', survey: tiny },
      { type: 'OPEN_BUZZERS' },
      { type: 'BUZZ', team: 'A', at: 1 },
    );
    expect(whoIsAnswering(game)?.playerIndex).toBe(1);
  });

  it('"The host announces top N answers on the board": the audience sees the slot count', () => {
    const view = audienceView(startRound(SURVEY));
    expect(view.board).toHaveLength(5);
    expect(view.board.every((slot) => !slot.revealed)).toBe(true);
  });

  it('"The first player to buzz answers": only the first buzz is accepted', () => {
    const open = run(startRound(), { type: 'OPEN_BUZZERS' });
    const buzzed = run(open, { type: 'BUZZ', team: 'B', at: 5 });
    expect(buzzed.faceOff?.first).toBe('B');
    expect(whoIsAnswering(buzzed)?.side).toBe('B');
    expectIllegal(buzzed, { type: 'BUZZ', team: 'A', at: 4 });
  });

  it('"The first player to buzz answers": buzzers must be opened first', () => {
    expectIllegal(startRound(), { type: 'BUZZ', team: 'A', at: 1 });
  });

  it('host resolution: WHO_BUZZED_FIRST assigns or corrects the first buzzer', () => {
    const open = run(startRound(), { type: 'OPEN_BUZZERS' });
    const assigned = run(open, { type: 'WHO_BUZZED_FIRST', team: 'B' });
    expect(assigned.faceOff?.first).toBe('B');
    expect(run(assigned, { type: 'WHO_BUZZED_FIRST', team: 'A' }).faceOff?.first).toBe('A');
    expectIllegal(assigned, { type: 'WHO_BUZZED_FIRST', team: 'B' });
    const answered = run(assigned, { type: 'FACEOFF_ANSWER', slot: 'miss' });
    expectIllegal(answered, { type: 'WHO_BUZZED_FIRST', team: 'A' });
  });

  it('"The #1 answer wins the face-off at once": the opponent never answers', () => {
    const state = run(atFirstAnswer('B'), { type: 'FACEOFF_ANSWER', slot: 0 });
    expect(state.phase).toBe('play-or-pass');
    expect(state.faceOff?.winner).toBe('B');
    expect(state.board[0]?.revealed).toBe(true);
    expect(state.board[0]?.revealedBy).toBe('B');
  });

  it('"Any other answer on the board is revealed and the opponent answers"', () => {
    const state = run(atFirstAnswer('A'), { type: 'FACEOFF_ANSWER', slot: 2 });
    expect(state.phase).toBe('face-off');
    expect(state.board[2]?.revealed).toBe(true);
    expect(whoIsAnswering(state)).toEqual({ side: 'B', playerIndex: 0, role: 'face-off' });
  });

  it('"a higher-scoring answer wins for the opponent"', () => {
    const state = run(
      atFirstAnswer('A'),
      { type: 'FACEOFF_ANSWER', slot: 2 },
      { type: 'FACEOFF_ANSWER', slot: 1 },
    );
    expect(state.faceOff?.winner).toBe('B');
    expect(state.phase).toBe('play-or-pass');
    expect(state.board[1]?.revealedBy).toBe('B');
  });

  it('"a lower one ... gives the face-off to the first family"', () => {
    const state = run(
      atFirstAnswer('A'),
      { type: 'FACEOFF_ANSWER', slot: 1 },
      { type: 'FACEOFF_ANSWER', slot: 3 },
    );
    expect(state.faceOff?.winner).toBe('A');
    // The lower answer is still revealed and counts in the bank.
    expect(state.board[3]?.revealed).toBe(true);
    expect(state.bank).toBe(35);
  });

  it('"a miss or no answer gives the face-off to the first family"', () => {
    const state = run(
      atFirstAnswer('A'),
      { type: 'FACEOFF_ANSWER', slot: 1 },
      { type: 'FACEOFF_ANSWER', slot: 'miss' },
    );
    expect(state.faceOff?.winner).toBe('A');
    expect(state.phase).toBe('play-or-pass');
  });

  it('"Equal points: the first answer wins"', () => {
    const state = run(
      atFirstAnswer('A', SURVEY_2),
      { type: 'FACEOFF_ANSWER', slot: 1 },
      { type: 'FACEOFF_ANSWER', slot: 0 },
    );
    // Red and Blue are both 30 points: B's Red does not beat A's Blue.
    expect(state.faceOff?.winner).toBe('A');
  });

  it('"Equal points": the opponent repeating the same answer does not win it', () => {
    const state = run(
      atFirstAnswer('A'),
      { type: 'FACEOFF_ANSWER', slot: 1 },
      { type: 'FACEOFF_ANSWER', slot: 1 },
    );
    expect(state.faceOff?.winner).toBe('A');
  });

  it('"A miss shows one X and the opponent answers"', () => {
    const state = run(atFirstAnswer('A'), { type: 'FACEOFF_ANSWER', slot: 'miss' });
    expect(eventTypes(state).filter((type) => type === 'FACEOFF_X')).toHaveLength(1);
    expect(state.phase).toBe('face-off');
    expect(whoIsAnswering(state)?.side).toBe('B');
  });

  it('"any answer on the board wins for the opponent" after a miss', () => {
    const state = run(
      atFirstAnswer('A'),
      { type: 'FACEOFF_ANSWER', slot: 'miss' },
      { type: 'FACEOFF_ANSWER', slot: 4 },
    );
    expect(state.faceOff?.winner).toBe('B');
    expect(state.board[4]?.revealedBy).toBe('B');
  });

  it('"If both miss, the question goes down the line in pairs": the next pair, first family first', () => {
    let state = run(
      atFirstAnswer('B'),
      { type: 'FACEOFF_ANSWER', slot: 'miss' },
      { type: 'FACEOFF_ANSWER', slot: 'miss' },
    );
    expect(state.phase).toBe('face-off');
    expect(state.faceOff?.pair).toBe(1);
    expect(whoIsAnswering(state)).toEqual({ side: 'B', playerIndex: 1, role: 'face-off' });
    state = run(state, { type: 'FACEOFF_ANSWER', slot: 'miss' });
    expect(whoIsAnswering(state)).toEqual({ side: 'A', playerIndex: 1, role: 'face-off' });
    state = run(state, { type: 'FACEOFF_ANSWER', slot: 'miss' });
    expect(state.faceOff?.pair).toBe(2);
    expect(whoIsAnswering(state)).toEqual({ side: 'B', playerIndex: 2, role: 'face-off' });
  });

  it('"each pair judged like a face-off, until someone hits"', () => {
    const state = run(
      atFirstAnswer('A'),
      { type: 'FACEOFF_ANSWER', slot: 'miss' },
      { type: 'FACEOFF_ANSWER', slot: 'miss' },
      { type: 'FACEOFF_ANSWER', slot: 3 },
      { type: 'FACEOFF_ANSWER', slot: 1 },
    );
    expect(state.faceOff?.winner).toBe('B');
    expect(state.faceOff?.winnerPlayer).toBe(1);
    expect(state.phase).toBe('play-or-pass');
  });

  it('"each pair judged like a face-off": a #1 in a later pair wins at once', () => {
    const state = run(
      atFirstAnswer('A'),
      { type: 'FACEOFF_ANSWER', slot: 'miss' },
      { type: 'FACEOFF_ANSWER', slot: 'miss' },
      { type: 'FACEOFF_ANSWER', slot: 0 },
    );
    expect(state.faceOff).toMatchObject({ winner: 'A', winnerPlayer: 1 });
  });

  it('"Face-off X\'s never count as strikes"', () => {
    const state = run(
      atFirstAnswer('A'),
      { type: 'FACEOFF_ANSWER', slot: 'miss' },
      { type: 'FACEOFF_ANSWER', slot: 'miss' },
      { type: 'FACEOFF_ANSWER', slot: 'miss' },
      { type: 'FACEOFF_ANSWER', slot: 'miss' },
      { type: 'FACEOFF_ANSWER', slot: 0 },
      { type: 'PLAY' },
    );
    expect(state.strikes).toBe(0);
    expect(eventTypes(state).filter((type) => type === 'STRIKE')).toHaveLength(0);
    expect(eventTypes(state).filter((type) => type === 'FACEOFF_X').length).toBeGreaterThanOrEqual(4);
  });

  it('rejects face-off answers outside the stage and slots off the board', () => {
    expectIllegal(startRound(), { type: 'FACEOFF_ANSWER', slot: 0 });
    expectIllegal(atFirstAnswer(), { type: 'FACEOFF_ANSWER', slot: 9 });
    expectIllegal(atFirstAnswer(), { type: 'FACEOFF_ANSWER', slot: -1 });
    expectIllegal(atFirstAnswer(), { type: 'FACEOFF_ANSWER', slot: 1.5 });
  });
});

describe('Main game 3. Play or pass', () => {
  it('"The face-off winner decides once": playing keeps the board', () => {
    const state = run(atPlayOrPass('A'), { type: 'PLAY' });
    expect(state.phase).toBe('control');
    expect(state.control?.family).toBe('A');
    expectIllegal(state, { type: 'PLAY' });
    expectIllegal(state, { type: 'PASS' });
  });

  it('"Passing hands control to the other family at zero strikes; the answers already revealed stay in the bank"', () => {
    const state = run(atPlayOrPass('A'), { type: 'PASS' });
    expect(state.phase).toBe('control');
    expect(state.control?.family).toBe('B');
    expect(state.strikes).toBe(0);
    expect(state.board[0]?.revealed).toBe(true);
    expect(state.bank).toBe(40);
  });

  it('play or pass is only legal after a face-off is won', () => {
    expectIllegal(atFirstAnswer(), { type: 'PLAY' });
    expectIllegal(startRound(), { type: 'PASS' });
  });
});

describe('Main game 4. Control', () => {
  it('"starting after the player who won the face-off": the next podium position answers', () => {
    const state = atControl('A');
    expect(whoIsAnswering(state)).toEqual({ side: 'A', playerIndex: 1, role: 'control' });
  });

  it('"one member at a time down the line": the line advances after every answer', () => {
    let state = atControl('A');
    state = run(state, { type: 'ANSWER', slot: 1 });
    expect(whoIsAnswering(state)?.playerIndex).toBe(2);
    state = run(state, { type: 'ANSWER', slot: 'miss' });
    expect(whoIsAnswering(state)?.playerIndex).toBe(3);
  });

  it('"a family that was passed the board starts after its own face-off player"', () => {
    const state = run(atPlayOrPass('A'), { type: 'PASS' });
    // B's face-off player was #1 (index 0), so B starts at index 1.
    expect(whoIsAnswering(state)).toEqual({ side: 'B', playerIndex: 1, role: 'control' });
  });

  it('"a family that was passed the board starts after its own face-off player": after down the line', () => {
    const state = run(
      atFirstAnswer('A'),
      { type: 'FACEOFF_ANSWER', slot: 'miss' },
      { type: 'FACEOFF_ANSWER', slot: 'miss' },
      { type: 'FACEOFF_ANSWER', slot: 0 },
      { type: 'PASS' },
    );
    // B's player in the winning pair (pair 1) was #2 (index 1), so B starts at index 2.
    expect(whoIsAnswering(state)).toEqual({ side: 'B', playerIndex: 2, role: 'control' });
  });

  it('the line wraps around a small podium', () => {
    let state = run(
      startRound(SURVEY, undefined, { A: 2, B: 5 }),
      { type: 'OPEN_BUZZERS' },
      { type: 'BUZZ', team: 'A', at: 1 },
      { type: 'FACEOFF_ANSWER', slot: 0 },
      { type: 'PLAY' },
    );
    expect(whoIsAnswering(state)?.playerIndex).toBe(1);
    state = run(state, { type: 'ANSWER', slot: 1 });
    expect(whoIsAnswering(state)?.playerIndex).toBe(0);
  });

  it('"No conferring and no passing mid-round": there is no pass action during control', () => {
    const state = atControl('A');
    expectIllegal(state, { type: 'PASS' });
    expectIllegal(state, { type: 'PLAY' });
  });

  it('"A miss ... is a strike"', () => {
    const state = run(atControl('A'), { type: 'ANSWER', slot: 'miss' });
    expect(state.strikes).toBe(1);
    expect(state.events.at(-1)).toMatchObject({ type: 'STRIKE', strikes: 1, cause: 'miss' });
  });

  it('"a pass or no answer in time is a strike" (the cause is kept for the presentation)', () => {
    const passed = run(atControl('A'), { type: 'ANSWER', slot: 'miss', cause: 'pass' });
    const timed = run(passed, { type: 'ANSWER', slot: 'miss', cause: 'timeout' });
    expect(timed.strikes).toBe(2);
    expect(passed.events.at(-1)).toMatchObject({ cause: 'pass' });
    expect(timed.events.at(-1)).toMatchObject({ cause: 'timeout' });
  });

  it('"the answer timer is a host setting, 5 seconds by default"', () => {
    expect(makeGame().settings.answerTimerSec).toBe(5);
    expect(makeGame({ answerTimerSec: 8 }).settings.answerTimerSec).toBe(8);
    expect(makeGame({ answerTimerSec: -1 }).settings.answerTimerSec).toBe(5);
  });

  it('"Repeating an answer already on the board is not a strike; the player is asked for another"', () => {
    const state = atControl('A');
    const before = whoIsAnswering(state);
    const repeated = run(state, { type: 'ANSWER', slot: 'repeat' });
    expect(repeated.strikes).toBe(0);
    expect(whoIsAnswering(repeated)).toEqual(before);
    expect(repeated.events.at(-1)?.type).toBe('REPEAT');
    // A judged slot that is already revealed is treated the same way.
    const again = run(state, { type: 'ANSWER', slot: 0 });
    expect(again.strikes).toBe(0);
    expect(whoIsAnswering(again)).toEqual(before);
  });

  it('a hit reveals the answer for the controlling family and moves down the line', () => {
    const state = run(atControl('A'), { type: 'ANSWER', slot: 2 });
    expect(state.board[2]).toMatchObject({ revealed: true, revealedBy: 'A', via: 'control' });
    expect(state.strikes).toBe(0);
  });
});

describe('Main game 5. Strikes and the steal', () => {
  it('"Three strikes and the other family ... huddles": the third strike opens the confer', () => {
    const two = run(atControl('A'), { type: 'ANSWER', slot: 'miss' }, { type: 'ANSWER', slot: 'miss' });
    expect(two.phase).toBe('control');
    const three = run(two, { type: 'ANSWER', slot: 'miss' });
    expect(three.phase).toBe('steal-confer');
    expect(three.strikes).toBe(3);
    expect(three.steal).toMatchObject({ family: 'B', result: 'pending' });
  });

  it('"huddles (for as long as the host allows, or 15 or 30 seconds by host setting)"', () => {
    for (const [setting, seconds] of [
      [0, 0],
      [15, 15],
      [30, 30],
    ] as const) {
      const state = atSteal('A', SURVEY, { stealTimerSec: setting });
      expect(state.events.find((event) => event.type === 'STEAL_CONFER')).toMatchObject({
        seconds,
        family: 'B',
      });
    }
    expect(makeGame({ stealTimerSec: 20 as 15 }).settings.stealTimerSec).toBe(0);
  });

  it('"its captain gives one answer": the captain answers after the huddle ends', () => {
    const confer = atSteal('A');
    expect(whoIsAnswering(confer)).toBeNull();
    const answering = run(confer, { type: 'END_CONFER' });
    expect(answering.phase).toBe('steal-answer');
    expect(whoIsAnswering(answering)).toEqual({ side: 'B', playerIndex: 0, role: 'steal' });
    expectIllegal(answering, { type: 'END_CONFER' });
    // The host may also take the answer straight from the huddle.
    expect(run(confer, { type: 'STEAL_ANSWER', slot: 'miss' }).phase).toBe('round-decided');
  });

  it('"If it is still hidden on the board they win the bank"', () => {
    const state = run(atSteal('A'), { type: 'END_CONFER' }, { type: 'STEAL_ANSWER', slot: 3 });
    expect(state.roundResult).toEqual({ winner: 'B', bank: 40, how: 'steal-success' });
    expect(state.families.B.score).toBe(40);
    expect(state.families.A.score).toBe(0);
    expect(state.steal?.result).toBe('success');
  });

  it('"if not, the controlling family does": a miss', () => {
    const state = run(atSteal('A'), { type: 'END_CONFER' }, { type: 'STEAL_ANSWER', slot: 'miss' });
    expect(state.roundResult).toEqual({ winner: 'A', bank: 40, how: 'steal-fail' });
    expect(state.families.A.score).toBe(40);
  });

  it('"if not, the controlling family does": an answer already revealed', () => {
    const state = run(atSteal('A'), { type: 'END_CONFER' }, { type: 'STEAL_ANSWER', slot: 0 });
    expect(state.roundResult?.winner).toBe('A');
    expect(state.steal?.result).toBe('fail');
  });

  it('"Clearing the board before the third strike wins the bank outright with no steal"', () => {
    const state = clearBoard(run(atControl('A'), { type: 'ANSWER', slot: 'miss' }));
    expect(state.phase).toBe('round-summary');
    expect(state.roundResult).toEqual({ winner: 'A', bank: 95, how: 'cleared' });
    expect(state.steal).toBeNull();
    expect(eventTypes(state)).not.toContain('STEAL_CONFER');
  });

  it('steal answers are only legal during the steal', () => {
    expectIllegal(atControl('A'), { type: 'STEAL_ANSWER', slot: 1 });
    expectIllegal(atSteal('A'), { type: 'STEAL_ANSWER', slot: 99 });
    expectIllegal(atSteal('A'), { type: 'ANSWER', slot: 'miss' });
  });
});

describe('Main game 6. The bank', () => {
  it('"Every answer revealed during the round, face-off answers from either family included, times the round multiplier"', () => {
    let state = run(
      atFirstAnswer('A'),
      { type: 'FACEOFF_ANSWER', slot: 2 },
      { type: 'FACEOFF_ANSWER', slot: 1 },
    );
    expect(state.bank).toBe(15 + 25);
    state = run(state, { type: 'PLAY' }, { type: 'ANSWER', slot: 4 });
    expect(state.bank).toBe(15 + 25 + 5);
    // Round 3 (x2).
    let game = run(makeGame(), { type: 'START_GAME' });
    game = roundWonBy(game, 'A', survey('r1', [['x', 1]]));
    game = run(game, { type: 'NEXT_ROUND' });
    game = roundWonBy(game, 'B', survey('r2', [['x', 1]]));
    game = run(
      game,
      { type: 'NEXT_ROUND' },
      { type: 'START_ROUND', survey: SURVEY },
      { type: 'OPEN_BUZZERS' },
      { type: 'BUZZ', team: 'A', at: 1 },
      { type: 'FACEOFF_ANSWER', slot: 0 },
    );
    expect(game.multiplier).toBe(2);
    expect(game.bank).toBe(80);
  });

  it('"The bank shown above the board is the multiplied total; the tiles show raw survey numbers"', () => {
    let game = run(makeGame(), { type: 'START_GAME' });
    game = roundWonBy(game, 'A', survey('r1', [['x', 1]]));
    game = run(game, { type: 'NEXT_ROUND' });
    game = roundWonBy(game, 'B', survey('r2', [['x', 1]]));
    game = run(
      game,
      { type: 'NEXT_ROUND' },
      { type: 'START_ROUND', survey: SURVEY },
      { type: 'OPEN_BUZZERS' },
      { type: 'BUZZ', team: 'A', at: 1 },
      { type: 'FACEOFF_ANSWER', slot: 0 },
    );
    const view = audienceView(game);
    expect(view.bank).toBe(80);
    expect(view.board[0]).toMatchObject({ revealed: true, points: 40 });
  });

  it('"A successful steal answer is revealed but its points are not added"', () => {
    const state = run(atSteal('A'), { type: 'END_CONFER' }, { type: 'STEAL_ANSWER', slot: 1 });
    expect(state.board[1]).toMatchObject({ revealed: true, revealedBy: 'B', via: 'steal' });
    expect(state.roundResult?.bank).toBe(40);
    expect(state.families.B.score).toBe(40);
    expect(computeBank(state.board, state.multiplier)).toBe(40);
  });

  it('the host can change the multiplier before the round is decided, and the bank follows', () => {
    const state = run(atControl('A'), { type: 'SET_MULTIPLIER', multiplier: 3 });
    expect(state.multiplier).toBe(3);
    expect(state.bank).toBe(120);
    expectIllegal(state, { type: 'SET_MULTIPLIER', multiplier: 3 });
    const decided = clearBoard(state);
    expectIllegal(decided, { type: 'SET_MULTIPLIER', multiplier: 1 });
  });
});

describe('Main game 7. After the round', () => {
  const decided = (): FeudState =>
    run(atSteal('A'), { type: 'END_CONFER' }, { type: 'STEAL_ANSWER', slot: 'miss' });

  it('"The host reveals the answers nobody got, from the bottom of the board up"', () => {
    let state = decided();
    expect(state.phase).toBe('round-decided');
    expect(leftoverOrder(state.board)).toEqual([4, 3, 2, 1]);
    const order: number[] = [];
    while (state.phase === 'round-decided') {
      state = run(state, { type: 'REVEAL_NEXT' });
      const last = state.events.at(-1);
      const reveal = [...state.events].reverse().find((event) => event.type === 'ANSWER_REVEALED');
      if (reveal?.type === 'ANSWER_REVEALED') order.push(reveal.slot);
      expect(last).toBeDefined();
    }
    expect(order).toEqual([4, 3, 2, 1]);
    expect(state.phase).toBe('round-summary');
  });

  it('"They score nothing": leftover reveals change neither the bank nor the scores', () => {
    const before = decided();
    const after = run(before, { type: 'REVEAL_ALL' });
    expect(after.bank).toBe(before.bank);
    expect(after.families).toEqual(before.families);
    expect(after.board.every((slot) => slot.revealed)).toBe(true);
    expect(after.board[4]).toMatchObject({ revealedBy: 'host', via: 'leftover' });
    expect(after.phase).toBe('round-summary');
  });

  it('REVEAL_ALL reveals bottom up in order', () => {
    const after = run(decided(), { type: 'REVEAL_ALL' });
    const slots = after.events
      .filter((event) => event.type === 'ANSWER_REVEALED' && event.via === 'leftover')
      .map((event) => (event.type === 'ANSWER_REVEALED' ? event.slot : -1));
    expect(slots).toEqual([4, 3, 2, 1]);
  });

  it('reveals and the next round are only legal at the right time', () => {
    expectIllegal(atControl('A'), { type: 'REVEAL_NEXT' });
    expectIllegal(decided(), { type: 'NEXT_ROUND' });
    const summary = run(decided(), { type: 'REVEAL_ALL' });
    expectIllegal(summary, { type: 'REVEAL_NEXT' });
    expect(run(summary, { type: 'NEXT_ROUND' }).phase).toBe('round-intro');
  });
});

describe('Main game 8. Sudden Death', () => {
  const toSuddenDeath = atSuddenDeath;

  it('"Triple points, the board shows only the #1 answer"', () => {
    const state = run(toSuddenDeath(), { type: 'START_SUDDEN_DEATH', survey: SD_SURVEY });
    expect(state.multiplier).toBe(3);
    expect(state.board).toHaveLength(1);
    expect(audienceView(state).board).toEqual([{ revealed: false }]);
    expect(JSON.stringify(audienceView(state))).not.toContain('Juice');
  });

  it('"it is a face-off only: whoever gives the #1 answer wins the round and the game, whatever the scores"', () => {
    const state = toSuddenDeath();
    // A won rounds 1 and 3 (1 + 2 points), B rounds 2 and 4 (1 + 3 points).
    expect(state.families.A.score).toBe(3);
    expect(state.families.B.score).toBe(4);
    const sd = run(
      state,
      { type: 'START_SUDDEN_DEATH', survey: SD_SURVEY },
      { type: 'OPEN_BUZZERS' },
      { type: 'BUZZ', team: 'A', at: 1 },
      { type: 'FACEOFF_ANSWER', slot: 0 },
    );
    expect(sd.gameWinner).toBe('A');
    expect(sd.phase).toBe('round-summary');
    expect(sd.roundResult).toMatchObject({ winner: 'A', how: 'sudden-death' });
    expect(run(sd, { type: 'NEXT_ROUND' }).phase).toBe('game-won');
  });

  it('"whatever the scores": the trailing family can win Sudden Death', () => {
    const state = toSuddenDeath();
    const trailing = state.families.A.score < state.families.B.score ? 'A' : 'B';
    expect(trailing).toBe('A');
    const sd = run(
      state,
      { type: 'START_SUDDEN_DEATH', survey: SD_SURVEY },
      { type: 'OPEN_BUZZERS' },
      { type: 'BUZZ', team: trailing, at: 1 },
      { type: 'FACEOFF_ANSWER', slot: 0 },
    );
    expect(sd.gameWinner).toBe(trailing);
  });

  it('"A non-#1 answer is a miss": the opponent then answers', () => {
    const sd = run(
      toSuddenDeath(),
      { type: 'START_SUDDEN_DEATH', survey: SD_SURVEY },
      { type: 'OPEN_BUZZERS' },
      { type: 'BUZZ', team: 'A', at: 1 },
      { type: 'FACEOFF_ANSWER', slot: 1 },
    );
    expect(sd.phase).toBe('face-off');
    expect(sd.board[0]?.revealed).toBe(false);
    expect(whoIsAnswering(sd)?.side).toBe('B');
    expect(run(sd, { type: 'FACEOFF_ANSWER', slot: 0 }).gameWinner).toBe('B');
  });

  it('"If both players miss, a new Sudden Death question is asked" with the same players', () => {
    const asked = run(
      toSuddenDeath(),
      { type: 'START_SUDDEN_DEATH', survey: SD_SURVEY },
      { type: 'OPEN_BUZZERS' },
      { type: 'BUZZ', team: 'A', at: 1 },
      { type: 'FACEOFF_ANSWER', slot: 'miss' },
      { type: 'FACEOFF_ANSWER', slot: 'miss' },
    );
    expect(asked.phase).toBe('sudden-death');
    expect(asked.gameWinner).toBeNull();
    expect(asked.board).toHaveLength(0);
    const again = run(
      asked,
      {
        type: 'START_SUDDEN_DEATH',
        survey: survey('sd2', [
          ['Tea', 60],
          ['Coffee', 40],
        ]),
      },
      { type: 'OPEN_BUZZERS' },
      { type: 'BUZZ', team: 'B', at: 1 },
    );
    expect(again.phase).toBe('face-off');
    expect(whoIsAnswering(again)).toEqual({ side: 'B', playerIndex: 4, role: 'face-off' });
  });

  it('Sudden Death has no play-or-pass, control or steal', () => {
    const sd = run(
      toSuddenDeath(),
      { type: 'START_SUDDEN_DEATH', survey: SD_SURVEY },
      { type: 'OPEN_BUZZERS' },
      { type: 'BUZZ', team: 'A', at: 1 },
      { type: 'FACEOFF_ANSWER', slot: 0 },
    );
    expect(sd.control).toBeNull();
    expect(eventTypes(sd).filter((type) => type === 'CONTROL_CHOSEN')).toHaveLength(4);
    expectIllegal(sd, { type: 'PLAY' });
  });
});

describe('Host tools', () => {
  it('REPLACE_SURVEY restarts the round at the face-off with the same players and multiplier', () => {
    const state = run(
      atControl('A'),
      { type: 'ANSWER', slot: 'miss' },
      { type: 'REPLACE_SURVEY', survey: SURVEY_2 },
    );
    expect(state.phase).toBe('face-off');
    expect(state.survey?.id).toBe('s2');
    expect(state.strikes).toBe(0);
    expect(state.bank).toBe(0);
    expect(state.board.every((slot) => !slot.revealed)).toBe(true);
    expect(state.roundNumber).toBe(1);
    expect(state.faceOff?.stage).toBe('ready');
  });

  it('REPLACE_SURVEY keeps a host-set multiplier and is refused once the round is decided', () => {
    const tripled = run(
      startRound(),
      { type: 'SET_MULTIPLIER', multiplier: 3 },
      { type: 'REPLACE_SURVEY', survey: SURVEY_2 },
    );
    expect(tripled.multiplier).toBe(3);
    expectIllegal(clearBoard(atControl('A')), { type: 'REPLACE_SURVEY', survey: SURVEY_2 });
  });

  it('refuses surveys with no answers or bad points', () => {
    const empty = { id: 'e', question: 'q', answers: [] };
    const bad = { id: 'b', question: 'q', answers: [{ answer: 'x', points: Number.NaN }] };
    expectIllegal(run(makeGame(), { type: 'START_GAME' }), { type: 'START_ROUND', survey: empty });
    expectIllegal(run(makeGame(), { type: 'START_GAME' }), { type: 'START_ROUND', survey: bad });
  });

  it('boards hold at most 8 answers, highest points first', () => {
    const many = survey(
      'many',
      Array.from({ length: 10 }, (_, index) => [`a${index}`, index + 1] as const),
    );
    const state = startRound(many);
    expect(state.board).toHaveLength(8);
    expect(state.board.map((slot) => slot.points)).toEqual([10, 9, 8, 7, 6, 5, 4, 3]);
  });

  it('SKIP_FAST_MONEY goes straight to game over without Fast Money points', () => {
    let state = roundWonBy(run(makeGame(), { type: 'START_GAME' }), 'A', survey('t', [['x', 300]]));
    state = run(state, { type: 'NEXT_ROUND' });
    expect(state.phase).toBe('game-won');
    state = run(state, { type: 'SKIP_FAST_MONEY' });
    expect(state.phase).toBe('game-over');
    expect(gameEndReport(state)).toEqual({
      winnerId: 'team-a',
      points: 300,
      extraScores: [{ team: 'team-b', points: 0 }],
      bonusChips: 0,
    });
  });
});

describe('Engine contract', () => {
  const states: [string, FeudState][] = [
    ['pre-game', makeGame()],
    ['round-intro', run(makeGame(), { type: 'START_GAME' })],
    ['face-off ready', startRound()],
    ['face-off buzzers', run(startRound(), { type: 'OPEN_BUZZERS' })],
    ['face-off first answer', atFirstAnswer()],
    ['play-or-pass', atPlayOrPass()],
    ['control', atControl()],
    ['steal-confer', atSteal()],
    ['steal-answer', run(atSteal(), { type: 'END_CONFER' })],
    ['round-decided', run(atSteal(), { type: 'STEAL_ANSWER', slot: 'miss' })],
  ];
  const nonsense: FeudAction[] = [
    { type: 'BUZZ', team: 'Z' as 'A', at: 1 },
    { type: 'ANSWER', slot: 42 },
    { type: 'FACEOFF_ANSWER', slot: Number.NaN },
    { type: 'STEAL_ANSWER', slot: -3 },
    { type: 'SET_MULTIPLIER', multiplier: 7 as 1 },
    { type: 'UNDO' },
    { type: 'FAST_MONEY', sub: { type: 'END_EARLY' } },
    { type: 'SKIP_FAST_MONEY' },
  ];

  it.each(states)('illegal actions return the same reference in %s', (_name, state) => {
    for (const action of nonsense) {
      if (action.type === 'UNDO' && state.history.length > 0) continue;
      expect(feudReducer(state, action)).toBe(state);
    }
  });

  it('every phase rejects START_GAME after the game has started', () => {
    for (const [, state] of states.slice(1)) expect(feudReducer(state, { type: 'START_GAME' })).toBe(state);
  });

  it('legal actions never mutate the previous state', () => {
    const before = atControl();
    const frozen = JSON.stringify(before);
    run(before, { type: 'ANSWER', slot: 2 });
    expect(JSON.stringify(before)).toBe(frozen);
  });

  it('events carry a monotonic seq', () => {
    const state = run(atControl('A'), { type: 'ANSWER', slot: 'miss' }, { type: 'ANSWER', slot: 2 });
    const seqs = state.events.map((event) => event.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(state.seq).toBe(seqs.at(-1)! + 1);
  });

  it('UNDO restores the previous state but never rewinds seq', () => {
    const before = atControl('A');
    const acted = run(before, { type: 'ANSWER', slot: 2 });
    const undone = run(acted, { type: 'UNDO' });
    expect(undone.board).toEqual(before.board);
    expect(undone.bank).toBe(before.bank);
    expect(undone.phase).toBe('control');
    expect(undone.seq).toBeGreaterThan(acted.seq);
    expect(undone.events.at(-1)?.type).toBe('UNDONE');
    expect(undone.events.slice(0, acted.events.length)).toEqual(acted.events);
  });

  it('UNDO history is bounded at 30 steps', () => {
    let state = atControl('A');
    for (let i = 0; i < 45; i += 1) state = run(state, { type: 'ANSWER', slot: 'repeat' });
    expect(state.history).toHaveLength(MAX_HISTORY);
    const seqBefore = state.seq;
    let undone = 0;
    for (;;) {
      const next = feudReducer(state, { type: 'UNDO' });
      if (next === state) break;
      state = next;
      undone += 1;
    }
    expect(undone).toBe(30);
    expect(state.seq).toBe(seqBefore + 30);
    // Illegal actions never reach the history.
    const same = feudReducer(state, { type: 'ANSWER', slot: 99 });
    expect(same).toBe(state);
  });

  it('UNDO is refused once the game is over', () => {
    let state = roundWonBy(run(makeGame(), { type: 'START_GAME' }), 'A', survey('t', [['x', 300]]));
    state = run(state, { type: 'NEXT_ROUND' }, { type: 'SKIP_FAST_MONEY' });
    expect(state.phase).toBe('game-over');
    expectIllegal(state, { type: 'UNDO' });
  });

  it('createFeudState sanitises podium sizes', () => {
    const state = createFeudState({
      families: { A: { teamId: 'a', podiumSize: 0 }, B: { teamId: 'b', podiumSize: 3.9 } },
    });
    expect(state.families.A.podiumSize).toBe(1);
    expect(state.families.B.podiumSize).toBe(3);
  });

  it('strikeOut helper reaches the steal', () => {
    expect(strikeOut(atControl()).phase).toBe('steal-confer');
  });
});
