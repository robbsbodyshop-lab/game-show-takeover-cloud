import { describe, expect, it } from 'vitest';
import { feudReducer } from '@/engines/feud/feudEngine';
import {
  atControl,
  atFirstAnswer,
  atPlayOrPass,
  atSteal,
  run,
  startRound,
  SURVEY,
} from '@/engines/feud/testFixtures';
import type { FeudState } from '@/engines/feud/types';
import { planCues } from './feudCues';
import { FEUD_TIMING } from './timing';

const cuesOf = (prev: FeudState, next: FeudState) =>
  planCues(
    next.events.filter((e) => e.seq >= prev.seq),
    prev,
    next,
    { jackpotCued: false },
  ).steps.map((step) => step.cue);

describe('planCues', () => {
  it('buzzes in, reveals with the crowd and gives a round sting at a regular round start', () => {
    const start = startRound();
    expect(
      planCues(start.events, { ...start, seq: 0 }, start, { jackpotCued: false }).steps.map((s) => s.cue),
    ).toContain('ff_round_sting');
    const first = atFirstAnswer('A');
    const buzzed = first.events.filter((e) => e.type === 'BUZZED');
    expect(planCues(buzzed, startRound(), first, { jackpotCued: false }).steps.map((s) => s.cue)).toEqual([
      'ff_buzzer',
    ]);
    const won = feudReducer(first, { type: 'FACEOFF_ANSWER', slot: 0 });
    expect(cuesOf(first, won)).toEqual(['ff_reveal', 'ff_crowd_cheer']);
  });

  it('gives every X the buzzer and then the aww', () => {
    const control = atControl('A');
    const struck = feudReducer(control, { type: 'ANSWER', slot: 'miss' });
    expect(cuesOf(control, struck)).toEqual(['ff_strike', 'ff_crowd_aww']);
  });

  it('does not play the crowd for the host leftover reveals', () => {
    let state = atSteal('A');
    state = run(state, { type: 'STEAL_ANSWER', slot: 'miss' });
    const before = state;
    const after = feudReducer(before, { type: 'REVEAL_NEXT' });
    expect(cuesOf(before, after)).toEqual(['ff_reveal']);
  });

  it('awards the bank with applause and a delayed sting unless the game is won', () => {
    const play = atPlayOrPass('A', SURVEY);
    const steal = atSteal('A', SURVEY);
    const decided = feudReducer(steal, { type: 'STEAL_ANSWER', slot: 'miss' });
    const plan = planCues(
      decided.events.filter((e) => e.seq >= steal.seq),
      steal,
      decided,
      { jackpotCued: false },
    );
    expect(plan.steps.map((s) => s.cue)).toEqual([
      'ff_strike',
      'ff_crowd_aww',
      'ff_bank_award',
      'applause',
      'ff_round_sting',
    ]);
    expect(plan.steps.at(-1)?.delayMs).toBe(FEUD_TIMING.roundStingAfterWinMs);
    expect(play.phase).toBe('play-or-pass');
  });
});
