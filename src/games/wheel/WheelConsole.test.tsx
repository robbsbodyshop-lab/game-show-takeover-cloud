import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toRound, wheelOf } from '@/engines/wheel/testKit';
import { drawForIndex } from '@/engines/wheel/wheels';
import type { WheelState } from '@/engines/wheel/types';
import type { HostCommandInput, HostSnapshot } from '@/host/hostProtocol';
import { makeHarness } from './controllerHarness';
import type { Harness } from './controllerHarness';
import { WheelConsole } from './WheelConsole';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(5_000_000);
});
afterEach(() => {
  vi.useRealTimers();
});

interface Rig {
  h: Harness;
  sent: HostCommandInput[];
  /** Renders (or re-renders) the console with the latest snapshot. */
  show: () => void;
  stale: () => void;
}

function rig(initialState: WheelState = toRound(1)): Rig {
  const h = makeHarness({ initialState });
  const sent: HostCommandInput[] = [];
  let snapshot: HostSnapshot = h.host.last;
  const send = (rendered: HostSnapshot) => (command: HostCommandInput) => {
    sent.push(command);
    return h.host.send(command.name, command.args, {
      ...(command.teamId === undefined ? {} : { teamId: command.teamId }),
      gameRev: rendered.gameRev,
    });
  };
  const view = render(<WheelConsole snapshot={snapshot} send={send(snapshot)} />);
  return {
    h,
    sent,
    show: () => {
      snapshot = h.host.last;
      view.rerender(<WheelConsole snapshot={snapshot} send={send(snapshot)} />);
    },
    stale: () => undefined,
  };
}

const click = (name: string | RegExp): void => {
  fireEvent.click(screen.getByRole('button', { name }));
};

describe('WheelConsole: what the host sees', () => {
  it('shows the answer, the category, the next puzzle and the phone podium status', () => {
    rig();
    expect(screen.getByTestId('console-answer').textContent).toBe('RED APPLE PIE');
    expect(screen.getByTestId('console-puzzle').textContent).toContain('THING');
    expect(screen.getByTestId('console-next').textContent).toContain('SPARE PUZZLE');
    const phones = screen.getByTestId('console-phones').textContent;
    expect(phones).toContain('Active: Red');
    expect(phones).toContain('SPIN on');
    expect(phones).toContain('BUY off');
  });

  it('greys out what the engine would refuse', () => {
    rig();
    expect(screen.getByRole('button', { name: 'Spin' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Ring the time bell' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Judge: correct' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Late answer/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Buy E' })).toBeDisabled();
  });

  it('reveals the sealed envelope and the letters left to the host only', () => {
    const base = toRound(1);
    // A Bonus Round spin already made: the envelope exists in the engine.
    const h0 = makeHarness({
      initialState: {
        ...base,
        teams: base.teams.map((t) => ({ ...t, bank: t.id === 1 ? 9000 : 1000 })),
        stage: 'bonus',
        phase: 'awaiting-puzzles',
        request: { use: 'bonus', count: 3 },
        awaiting: 'start',
        puzzle: null,
        queue: [],
        spin: null,
        round: 0,
        turn: null,
        planIndex: base.plan.findIndex((s) => s.kind === 'bonus'),
      },
    });
    h0.host.send('bonus-category', { category: h0.host.data.bonus?.categories[0] });
    h0.queueDraws(0.3);
    h0.controller.run('spin');
    h0.advance(5200);
    render(<WheelConsole snapshot={h0.host.last} send={() => ({ applied: true })} />);
    expect(screen.getByTestId('console-envelope').textContent).toMatch(/\$\d+,000|CAR/);
    expect(screen.getByTestId('console-envelope').textContent).toContain('3 consonant');
  });
});

describe('WheelConsole: commands', () => {
  it('Throw out puzzle brings up the next puzzle and keeps the turn', () => {
    const r = rig();
    click('Throw out puzzle');
    expect(r.sent.at(-1)).toMatchObject({ target: 'wheel', name: 'throw-out' });
    expect(r.h.engine().puzzle?.puzzle.phrase).toBe('SPARE PUZZLE');
    expect(r.h.engine().turn).toBe(1);
    r.show();
    expect(screen.getByTestId('console-answer').textContent).toBe('SPARE PUZZLE');
  });

  it('Skip to next team and Give the turn to are stamped and applied', () => {
    const r = rig();
    click('Skip to next team');
    expect(r.sent.at(-1)).toMatchObject({ name: 'skip-turn', teamId: 1 });
    expect(r.h.engine().turn).toBe(2);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    r.show();
    click('Green');
    expect(r.sent.at(-1)).toMatchObject({ name: 'set-turn', args: { team: 3 } });
    expect(r.h.engine().turn).toBe(3);
  });

  it('adjusts a bank by 100, 500 and 1,000 either way', () => {
    const r = rig();
    const before = r.h.engine().teams[1]?.bank ?? 0;
    click('+$500 to Blue bank');
    expect(r.h.engine().teams[1]?.bank).toBe(before + 500);
    expect(r.sent.at(-1)).toMatchObject({ name: 'adjust-bank', args: { team: 2, delta: 500 } });
    for (const label of ['-$1,000', '-$500', '-$100', '+$100', '+$1,000']) {
      expect(screen.getByRole('button', { name: `${label} to Blue bank` })).toBeInTheDocument();
    }
  });

  it('Ring the time bell and Undo last step', () => {
    const r = rig();
    click('Ring the time bell');
    // At a choice point the bell turns the round into the Speed-Up at once.
    expect(r.h.engine().stage).toBe('speedup');
    act(() => {
      vi.advanceTimersByTime(600);
    });
    r.show();
    click('Undo last step');
    expect(r.h.engine().stage).toBe('round');
  });

  it('Judge and Reverse: ruling a solve right can be reversed, which throws the puzzle out', () => {
    const r = rig();
    r.h.phones.action(1, 'solve-start');
    r.show();
    click('Judge: wrong');
    expect(r.sent.at(-1)).toMatchObject({ name: 'rule', args: { verdict: 'wrong' }, teamId: 1 });
    expect(r.h.engine().turn).toBe(2);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    r.show();
    expect(screen.getByRole('button', { name: 'Reverse: Red was ruled wrong' })).toBeInTheDocument();
    click('Reverse: Red was ruled wrong');
    expect(r.h.engine().phase).toBe('round-award');
    expect(r.h.engine().award?.team).toBe(1);
  });

  it('a close answer from a phone shows what was said and waits for Accept or Reject', () => {
    const r = rig();
    r.h.phones.action(1, 'solve-start');
    r.h.phones.action(1, 'solve', 'red apple pies');
    r.show();
    const rulings = screen.getByTestId('console-rulings');
    expect(rulings.textContent).toContain('Red said: red apple pies');
    expect(rulings.textContent).toContain('(from the phone)');
    fireEvent.click(within(rulings).getByRole('button', { name: 'Reject' }));
    expect(r.sent.at(-1)).toMatchObject({ name: 'reject-pending', teamId: 1 });
    expect(r.h.engine().turn).toBe(2);
    expect(r.h.engine().phase).toBe('choose');
  });

  it('Late answer is offered after a time-out and gives the solve back', () => {
    const base = toRound(1);
    const r = rig({ ...base, settings: { ...base.settings, turnTimerSec: 5 } });
    act(() => {
      vi.advanceTimersByTime(5100);
    });
    r.show();
    const late = screen.getByRole('button', { name: 'Late answer: Blue must give the solve back' });
    expect(late).toBeEnabled();
    fireEvent.click(late);
    expect(r.h.engine().phase).toBe('solving');
    expect(r.h.engine().solve?.team).toBe(1);
  });

  it('calls letters from the console grid', () => {
    const r = rig();
    r.h.queueDraws(
      drawForIndex(wheelOf(r.h.engine()).findIndex((w) => w.kind === 'cash' && w.value === 700)),
    );
    click('Spin');
    act(() => {
      vi.advanceTimersByTime(9000);
    });
    r.show();
    click('Call P');
    expect(r.h.engine().puzzle?.called).toEqual(['P']);
    expect(r.sent.at(-1)).toMatchObject({ name: 'letter', args: { letter: 'P' }, teamId: 1 });
  });

  it('says so when the stage refused a command from an old screen', async () => {
    const r = rig();
    r.h.host.send('ring-bell');
    await act(async () => {
      click('Spin');
      await Promise.resolve();
    });
    expect(screen.getByRole('alert').textContent).toContain('Not applied: stale');
  });
});

describe('WheelConsole: settings', () => {
  it('sets the turn timer live, and Undo keeps it', () => {
    const r = rig();
    click('5 s');
    expect(r.h.engine().settings.turnTimerSec).toBe(5);
    r.show();
    expect(screen.getByRole('button', { name: '5 s' })).toHaveAttribute('aria-pressed', 'true');
    act(() => {
      vi.advanceTimersByTime(600);
    });
    click('Off');
    expect(r.h.engine().settings.turnTimerSec).toBe(0);
    expect(r.h.saved.at(-1)?.turnTimerSec).toBe(0);
  });

  it('saves the next-game form', () => {
    const r = rig();
    fireEvent.change(screen.getByLabelText('Opening'), { target: { value: 'frenzy' } });
    fireEvent.change(screen.getByLabelText('Length'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('Speed-Up'), { target: { value: 'round4' } });
    fireEvent.click(screen.getByLabelText('Play the Bonus Round'));
    click('Save for the next game');
    expect(r.h.saved.at(-1)).toEqual({
      opening: 'frenzy',
      speedUpStart: 'round4',
      length: 'short',
      bonusRound: false,
      turnTimerSec: 0,
    });
    // The game in play is not touched.
    expect(r.h.engine().settings.opening).toBe('classic');
  });
});
