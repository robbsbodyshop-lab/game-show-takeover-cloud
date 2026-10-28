import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeudConsole, registerFeudConsole } from './FeudConsole';
import { getHostConsole, type CommandOptions } from './consoleRegistry';
import { COMMS, CONTENT, makeHarness, type Harness, type HarnessOptions } from './testKit';
import { FEUD_TIMING } from './timing';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const tick = (ms: number): void => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

/** A console wired to a real controller through the same command path the host view uses. */
const mountConsole = (options: HarnessOptions = {}) => {
  const h = makeHarness({ settings: { answerTimerSec: 0, format: 'one-round' }, ...options });
  const sent: { name: string; args?: Record<string, unknown>; options?: CommandOptions }[] = [];
  const sendCommand = (
    name: string,
    args?: Record<string, unknown>,
    commandOptions?: CommandOptions,
  ): void => {
    sent.push({ name, ...(args ? { args } : {}), ...(commandOptions ? { options: commandOptions } : {}) });
    act(() => {
      h.host.send(name, args, {
        ...(commandOptions?.gameRev === undefined ? {} : { gameRev: commandOptions.gameRev }),
        ...(commandOptions?.teamId === undefined ? {} : { teamId: commandOptions.teamId }),
      });
    });
  };
  const view = render(<FeudConsole snapshot={h.host.snapshots.at(-1)!} sendCommand={sendCommand} />);
  const refresh = (): void => {
    view.rerender(<FeudConsole snapshot={h.host.snapshots.at(-1)!} sendCommand={sendCommand} />);
  };
  const step = (name: string, args?: Record<string, unknown>): void => {
    tick(FEUD_TIMING.repeatDropMs);
    act(() => {
      expect(h.host.send(name, args).applied).toBe(true);
    });
    refresh();
  };
  return { h, sent, refresh, step };
};

const toFirstAnswer = (ctx: ReturnType<typeof mountConsole>): void => {
  ctx.step('advance');
  ctx.step('advance');
  act(() => {
    ctx.h.phones.press(1, 'p1');
  });
  ctx.refresh();
};

describe('FeudConsole', () => {
  it('shows the full board with answers and points while they are hidden from the stage', () => {
    const ctx = mountConsole();
    toFirstAnswer(ctx);
    const board = screen.getByRole('list', { name: 'Full board' });
    const rows = within(board).getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent('PIZZA');
    expect(rows[0]).toHaveTextContent('40');
    expect(rows[0]).toHaveTextContent('pie');
    expect(rows[1]).toHaveTextContent('BURGER');
    expect(rows[4]).toHaveTextContent('hidden');
  });

  it('rules an answer in when Accept is clicked: stamped with the team and revision, applied by the game', () => {
    const ctx = mountConsole();
    toFirstAnswer(ctx);
    const rev = ctx.h.host.gameRev;
    fireEvent.click(screen.getByRole('button', { name: 'Accept #1 PIZZA' }));
    expect(ctx.sent.at(-1)).toEqual({ name: 'judge-slot', args: { slot: 0 }, options: { teamId: 1 } });
    expect(ctx.h.host.gameRev).toBe(rev);
    tick(FEUD_TIMING.surveySaysMs);
    expect(ctx.h.controller.getEngineState().board[0]?.revealed).toBe(true);
    ctx.refresh();
    expect(
      within(screen.getByRole('list', { name: 'Full board' })).getAllByRole('listitem')[0],
    ).toHaveTextContent('up (face-off)');
  });

  it('sends the miss and the play/pass buttons for the moment', () => {
    const ctx = mountConsole();
    toFirstAnswer(ctx);
    fireEvent.click(screen.getByRole('button', { name: 'Miss (X) (X)' }));
    expect(ctx.sent.at(-1)?.name).toBe('strike');
    expect(ctx.h.controller.getEngineState().faceOff?.stage).toBe('second-answer');
  });

  it('shows the stake lines, the answering player and the host-only clocks while a family has control', () => {
    const ctx = mountConsole({ settings: { answerTimerSec: 5, format: 'one-round' } });
    toFirstAnswer(ctx);
    ctx.step('judge-slot', { slot: 0 });
    tick(FEUD_TIMING.surveySaysMs);
    ctx.step('play');
    const stakes = screen.getByLabelText('Stake lines');
    expect(stakes).toHaveTextContent('If they win:');
    expect(stakes).toHaveTextContent('Team 1 win 95 points by clearing the board');
    expect(stakes).toHaveTextContent('If they lose:');
    expect(stakes).toHaveTextContent('Team 2 can steal 40 points');
    expect(screen.getByText('Team 1: Two-1')).toBeInTheDocument();
    const clock = screen.getByText('Answer timer').parentElement!;
    expect(clock).toHaveTextContent('5.0');
    tick(2000);
    expect(clock).toHaveTextContent('3.0');
  });

  it('shows what to say, the surveyed note and the multiplier tools', () => {
    const ctx = mountConsole();
    ctx.step('advance');
    const say = screen.getByLabelText('Say this');
    expect(say).toHaveTextContent('Top 5 answers are on the board.');
    expect(say).toHaveTextContent('Name a food people order for delivery.');
    fireEvent.click(screen.getByRole('button', { name: 'x2' }));
    expect(ctx.h.controller.getEngineState().multiplier).toBe(2);
  });

  it('puts a near miss in host review with the suggested slot and accepts it', () => {
    const ctx = mountConsole({ content: { surveys: [COMMS], fastMoney: CONTENT.fastMoney } });
    toFirstAnswer(ctx);
    ctx.step('submit-text', { text: 'phone call now' });
    const review = screen.getByRole('region', { name: 'Host review' });
    expect(review).toHaveTextContent('phone call now');
    fireEvent.click(within(review).getByRole('button', { name: 'Accept as #1 PHONE CALL' }));
    expect(ctx.sent.at(-1)).toEqual({ name: 'review-accept', args: { slot: 0 }, options: {} });
    tick(FEUD_TIMING.surveySaysMs);
    expect(ctx.h.controller.getEngineState().board[0]?.revealed).toBe(true);
  });

  it('rules a review as a miss', () => {
    const ctx = mountConsole({ content: { surveys: [COMMS], fastMoney: CONTENT.fastMoney } });
    toFirstAnswer(ctx);
    ctx.step('submit-text', { text: 'phone call now' });
    fireEvent.click(screen.getByRole('button', { name: 'Not on the board (X)' }));
    expect(ctx.h.controller.getEngineState().faceOff?.stage).toBe('second-answer');
  });

  it('types an answer from the console and holds the timer while typing', () => {
    const ctx = mountConsole();
    toFirstAnswer(ctx);
    const input = screen.getByLabelText('Type the answer');
    fireEvent.change(input, { target: { value: 'burger' } });
    expect(ctx.sent.some((c) => c.name === 'hold-answer')).toBe(true);
    fireEvent.submit(input.closest('form')!);
    expect(ctx.sent.at(-1)).toEqual({
      name: 'submit-text',
      args: { text: 'burger' },
      options: { teamId: 1 },
    });
    expect(ctx.h.speak).toHaveBeenCalledWith('Survey says');
  });

  it('browses the question bank, shows fresh counts and swaps a question in', () => {
    const ctx = mountConsole({ usedContentIds: ['colors'] });
    ctx.step('advance');
    const bank = screen.getByRole('region', { name: 'Question bank' });
    expect(bank).toHaveTextContent('Fresh: 2 of 3 surveys');
    expect(bank).toHaveTextContent('Running low');
    fireEvent.click(within(bank).getByRole('button', { name: 'Browse question bank' }));
    ctx.refresh();
    const use = screen.getByRole('button', { name: 'Use for this round: Name a day of the week.' });
    fireEvent.click(use);
    expect(ctx.h.controller.getEngineState().survey?.id).toBe('sudden');
  });

  it('asks twice to skip Fast Money, and the second tap carries the revision of the first', () => {
    const ctx = mountConsole();
    toFirstAnswer(ctx);
    ctx.step('judge-slot', { slot: 0 });
    tick(FEUD_TIMING.surveySaysMs);
    ctx.step('play');
    for (const slot of [1, 2, 3, 4]) {
      ctx.step('judge-slot', { slot });
      tick(FEUD_TIMING.surveySaysMs);
    }
    ctx.step('advance'); // the game-won card
    const armedRev = ctx.h.host.gameRev;
    fireEvent.click(screen.getByRole('button', { name: 'Skip Fast Money' }));
    expect(ctx.sent.some((c) => c.name === 'skip-fm')).toBe(false);
    // The game moves on between the two taps: the stamped command is dropped.
    tick(FEUD_TIMING.repeatDropMs);
    act(() => {
      ctx.h.controller.run('fm-deal');
    });
    ctx.refresh();
    expect(ctx.h.host.gameRev).toBeGreaterThan(armedRev);
    fireEvent.click(screen.getByRole('button', { name: 'Tap again: skip Fast Money' }));
    expect(ctx.sent.at(-1)).toEqual({ name: 'skip-fm', options: { gameRev: armedRev } });
    expect(ctx.h.controller.getEngineState().phase).not.toBe('game-over');
  });

  it('skips Fast Money when both taps land on the same moment', () => {
    const ctx = mountConsole();
    toFirstAnswer(ctx);
    ctx.step('judge-slot', { slot: 0 });
    tick(FEUD_TIMING.surveySaysMs);
    ctx.step('play');
    for (const slot of [1, 2, 3, 4]) {
      ctx.step('judge-slot', { slot });
      tick(FEUD_TIMING.surveySaysMs);
    }
    ctx.step('advance');
    fireEvent.click(screen.getByRole('button', { name: 'Skip Fast Money' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tap again: skip Fast Money' }));
    expect(ctx.h.controller.getEngineState().phase).toBe('game-over');
  });

  it('shows both Fast Money players, a CHECK with its suggestion, and re-judges a ruling', () => {
    const ctx = mountConsole();
    toFirstAnswer(ctx);
    ctx.step('judge-slot', { slot: 0 });
    tick(FEUD_TIMING.surveySaysMs);
    ctx.step('play');
    for (const slot of [1, 2, 3, 4]) {
      ctx.step('judge-slot', { slot });
      tick(FEUD_TIMING.surveySaysMs);
    }
    ctx.step('advance');
    ctx.step('advance'); // Fast Money, ready
    ctx.step('advance'); // clock
    const fm = ctx.h.controller.getEngineState().fastMoney;
    const q = fm?.queue[0] ?? 0;
    const top = fm?.questions[q]?.answers[0]?.answer ?? '';
    ctx.step('submit-text', { text: `${top} now` });
    const panel = screen.getByRole('region', { name: 'Fast Money' });
    expect(panel).toHaveTextContent(`${top} now`);
    expect(panel).toHaveTextContent('CHECK (suggested #1)');
    const ruling = within(panel).getByLabelText(`Ruling for player 1, question ${(q + 1).toString()}`);
    fireEvent.change(ruling, { target: { value: '0' } });
    expect(ctx.sent.at(-1)).toEqual({
      name: 'fm-set-match',
      args: { player: 1, question: q, slot: 0 },
      options: {},
    });
    expect(ctx.h.controller.getEngineState().fastMoney?.records.p1[q]?.slot).toBe(0);
  });

  it('waits politely when the snapshot is not Feud data', () => {
    render(
      <FeudConsole
        snapshot={{ kind: 'feud', gameRev: 0, inputLocked: false, data: null }}
        sendCommand={vi.fn()}
      />,
    );
    expect(screen.getByText('Waiting for the Family Feud game...')).toBeInTheDocument();
  });

  it('registers itself for the feud kind', () => {
    registerFeudConsole();
    expect(getHostConsole('feud')).toBe(FeudConsole);
  });
});

export type { Harness };
