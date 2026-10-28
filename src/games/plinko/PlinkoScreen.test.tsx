import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dropPath, type EventAction, type EventSession } from '@/engines/event';
import { EventHarness } from '../speed/EventHarness';
import { plinkoSession, run, spiedAudio, stubReducedMotion } from '../speed/testKit';
import { LANDED_STEP } from './geometry';
import { PlinkoScreen, STEP_MS } from './PlinkoScreen';

// Column 5 (index 4) with alternating draws stays in the middle: slot 4, 1000 points.
const MIDDLE_DRAWS = [0.1, 0.9, 0.1, 0.9, 0.1, 0.9, 0.1, 0.9];
// Column 1 (index 0) with eight lefts: the wall keeps it in slot 0, 100 points.
const LEFT_DRAWS = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1];

function mount(
  opts: {
    chips?: number[];
    draws?: number[];
    locked?: boolean;
    showMode?: boolean;
    settings?: number[];
  } = {},
) {
  const log: EventAction[] = [];
  const sessionRef: { current: EventSession } = { current: plinkoSession(opts.chips ?? [2, 1, 0]) };
  const audio = spiedAudio();
  const queue = [...(opts.draws ?? MIDDLE_DRAWS)];
  const draw = vi.fn(() => queue.shift() ?? 0.25);
  const initial: EventSession = opts.settings
    ? { ...sessionRef.current, settings: { ...sessionRef.current.settings, plinkoSlotValues: opts.settings } }
    : sessionRef.current;
  const Wrap = ({ locked }: { locked: boolean }) => (
    <EventHarness initial={initial} log={log}>
      {(session, dispatch) => {
        sessionRef.current = session;
        return (
          <PlinkoScreen
            session={session}
            dispatch={dispatch}
            inputLocked={locked}
            showMode={opts.showMode ?? false}
            audio={audio.audio}
            draw={draw}
          />
        );
      }}
    </EventHarness>
  );
  const view = render(<Wrap locked={opts.locked ?? false} />);
  return {
    log,
    sessionRef,
    audio,
    draw,
    lock: (locked: boolean) => {
      view.rerender(<Wrap locked={locked} />);
    },
  };
}

const pick = (column: number) => {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Column ${column.toString()},`) }));
};
const drop = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Drop' }));
};
const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};
const chip = () => screen.getByTestId('plinko-chip');

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('PlinkoScreen board', () => {
  it('draws nine slots with the values from the session settings', () => {
    mount({ settings: [10, 20, 30, 40, 50, 60, 70, 80, 90] });
    for (let slot = 0; slot < 9; slot++) {
      expect(screen.getByTestId(`slot-${slot.toString()}`)).toHaveAttribute(
        'data-value',
        String((slot + 1) * 10),
      );
    }
  });

  it('draws the 8 peg rows as flat polygons with no gradients', () => {
    mount();
    const board = screen.getByTestId('plinko-board');
    // rows alternate 9 and 8 pegs: 4 * 9 + 4 * 8 = 68, two polygons each
    const pegBases = board.querySelectorAll('polygon[class*="pegBase"]');
    expect(pegBases).toHaveLength(68);
    expect(board.querySelector('linearGradient, radialGradient')).toBeNull();
  });

  it('lists every team with its chips and score', () => {
    mount({ chips: [2, 1, 0] });
    expect(screen.getByTestId('chips-1')).toHaveTextContent('2 chips');
    expect(screen.getByTestId('chips-2')).toHaveTextContent('1 chip');
    expect(screen.getByTestId('chips-3')).toHaveTextContent('0 chips');
    expect(screen.getByTestId('score-1')).toHaveTextContent('0');
  });
});

describe('PlinkoScreen dropping', () => {
  it('selects a column for the active team, 1-9 on screen and 0-8 in the engine', () => {
    const { log } = mount();
    pick(3);
    expect(log).toEqual([{ type: 'PLINKO_SELECT_COLUMN', team: 1, column: 2 }]);
    expect(screen.getByTestId('plinko-marker')).toHaveAttribute('data-column', '2');
  });

  it('keeps Drop disabled until a column is picked, then drops with eight draws', () => {
    const { log, draw } = mount();
    expect(screen.getByRole('button', { name: 'Drop' })).toBeDisabled();
    pick(5);
    drop();
    expect(draw).toHaveBeenCalledTimes(8);
    expect(log.at(-1)).toEqual({ type: 'PLINKO_DROP', team: 1, draw: MIDDLE_DRAWS });
  });

  it('only offers teams that still hold chips and switches the active team', () => {
    const { log } = mount({ chips: [1, 1, 0] });
    expect(screen.getByRole('button', { name: /^Team 3/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /^Team 2/ }));
    pick(2);
    expect(log.at(-1)).toEqual({ type: 'PLINKO_SELECT_COLUMN', team: 2, column: 1 });
  });

  it('steps the chip peg by peg and ends on the engine slot', () => {
    const { sessionRef } = mount();
    pick(5);
    drop();
    const engineDrop = sessionRef.current.plinko?.drops.at(-1);
    expect(engineDrop).toBeDefined();
    expect(engineDrop?.slot).toBe(dropPath(4, MIDDLE_DRAWS)?.slot);

    expect(chip()).toHaveAttribute('data-step', '0');
    expect(chip()).toHaveAttribute('data-landed', 'false');
    // New total is held back while the chip is in the air.
    expect(screen.getByTestId('score-1')).toHaveTextContent('0');
    expect(screen.queryByTestId('score-pop')).toBeNull();

    advance(STEP_MS);
    expect(chip()).toHaveAttribute('data-step', '1');
    advance(STEP_MS * 3);
    expect(chip()).toHaveAttribute('data-step', '4');

    advance(STEP_MS * (LANDED_STEP - 4));
    expect(chip()).toHaveAttribute('data-step', String(LANDED_STEP));
    expect(chip()).toHaveAttribute('data-landed', 'true');
    expect(chip()).toHaveAttribute('data-slot', String(engineDrop?.slot));
    expect(screen.getByTestId(`slot-${String(engineDrop?.slot)}`)).toHaveAttribute('data-flash', 'true');
    expect(screen.getByTestId('score-pop')).toHaveTextContent('+1000');
    expect(screen.getByTestId('score-1')).toHaveTextContent('1000');
    expect(chip().getAttribute('style')).toContain('translate(');
  });

  it('plays the applause for a 500+ slot, once, and stays quiet for a small one', () => {
    const big = mount();
    pick(5);
    drop();
    expect(big.audio.play).not.toHaveBeenCalled();
    advance(STEP_MS * LANDED_STEP);
    advance(STEP_MS * 5);
    expect(big.audio.play).toHaveBeenCalledTimes(1);
    expect(big.audio.play).toHaveBeenCalledWith('applause');
  });

  it('is silent for a 100 point slot', () => {
    const small = mount({ draws: LEFT_DRAWS });
    pick(1);
    drop();
    advance(STEP_MS * LANDED_STEP);
    expect(screen.getByTestId('score-pop')).toHaveTextContent('+100');
    expect(small.audio.play).not.toHaveBeenCalled();
  });

  it('locks the controls while the chip is falling and unlocks them on landing', () => {
    mount();
    pick(5);
    drop();
    expect(screen.getByRole('button', { name: 'Drop' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Column 2,/ })).toBeDisabled();
    advance(STEP_MS * LANDED_STEP);
    expect(screen.getByRole('button', { name: /^Column 2,/ })).toBeEnabled();
  });

  it('freezes the animation while input is locked', () => {
    const { lock } = mount();
    pick(5);
    drop();
    advance(STEP_MS * 2);
    lock(true);
    advance(STEP_MS * 10);
    expect(chip()).toHaveAttribute('data-step', '2');
    lock(false);
    advance(STEP_MS);
    expect(chip()).toHaveAttribute('data-step', '3');
  });

  it('jumps straight to the slot under reduced motion', () => {
    stubReducedMotion(true);
    const { audio } = mount();
    pick(5);
    drop();
    expect(chip()).toHaveAttribute('data-landed', 'true');
    expect(chip()).toHaveAttribute('data-slot', '4');
    expect(screen.getByTestId('score-1')).toHaveTextContent('1000');
    expect(audio.play).toHaveBeenCalledWith('applause');
  });

  it('does not replay drops that were already in the log when the screen mounted', () => {
    const initial = run(
      plinkoSession([2, 0, 0]),
      { type: 'PLINKO_SELECT_COLUMN', team: 1, column: 4 },
      { type: 'PLINKO_DROP', team: 1, draw: MIDDLE_DRAWS },
    );
    expect(initial.plinko?.drops).toHaveLength(1);
    const audio = spiedAudio();
    render(
      <EventHarness initial={initial} log={[]}>
        {(session, dispatch) => (
          <PlinkoScreen
            session={session}
            dispatch={dispatch}
            inputLocked={false}
            showMode={false}
            audio={audio.audio}
          />
        )}
      </EventHarness>,
    );
    expect(screen.queryByTestId('plinko-chip')).toBeNull();
    expect(audio.play).not.toHaveBeenCalled();
  });
});

describe('PlinkoScreen ending', () => {
  it('needs two taps while chips remain, and disarms after four seconds', () => {
    const { log } = mount({ chips: [1, 0, 0] });
    fireEvent.click(screen.getByRole('button', { name: 'End Plinko' }));
    expect(log.some((a) => a.type === 'END_PLINKO')).toBe(false);
    expect(screen.getByRole('button', { name: /Tap again: end Plinko/ })).toBeInTheDocument();

    advance(4100);
    expect(screen.getByRole('button', { name: 'End Plinko' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'End Plinko' }));
    fireEvent.click(screen.getByRole('button', { name: /Tap again: end Plinko/ }));
    expect(log.filter((a) => a.type === 'END_PLINKO')).toHaveLength(1);
  });

  it('ends with a single tap once every chip is spent', () => {
    const { log } = mount({ chips: [0, 0, 0] });
    fireEvent.click(screen.getByRole('button', { name: 'End Plinko' }));
    expect(log).toEqual([{ type: 'END_PLINKO' }]);
  });
});

describe('PlinkoScreen show mode', () => {
  it('hides the host controls and returns them on hover', () => {
    mount({ showMode: true });
    expect(screen.getByTestId('plinko-board')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Drop' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'End Plinko' })).toBeNull();
    fireEvent.mouseEnter(screen.getByTestId('host-zone'));
    expect(screen.getByRole('button', { name: 'Drop' })).toBeInTheDocument();
  });
});
