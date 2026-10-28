import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { autoplay, newGame, run, toRound, wheelOf } from '@/engines/wheel/testKit';
import { drawForIndex } from '@/engines/wheel/wheels';
import type { WheelState } from '@/engines/wheel/types';
import { renderWheel } from './wheelTestUtils';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(6_000_000);
});
afterEach(() => {
  vi.useRealTimers();
});

const advance = (ms: number): void => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

const key = (k: string, init: KeyboardEventInit = {}): void => {
  fireEvent.keyDown(window, { key: k, ...init });
};

describe('podiums', () => {
  it('follow the play order and show the badges', () => {
    const base = toRound(1);
    const state: WheelState = {
      ...base,
      teams: base.teams.map((t) =>
        t.id === 1
          ? {
              ...t,
              wildCard: true,
              millionWedge: 'round' as const,
              roundPrizes: [{ name: 'TRIP', value: 5000 }],
              roundCash: 1200,
            }
          : t,
      ),
    };
    renderWheel({ initialState: state });
    const podium = screen.getByTestId('podium-1');
    expect(within(podium).getByText('WILD CARD')).toBeInTheDocument();
    expect(within(podium).getByText('MILLION $')).toBeInTheDocument();
    expect(within(podium).getByText('1 PRIZE')).toBeInTheDocument();
    expect(podium.textContent).toContain('$1200');
    expect(podium.textContent).toContain('$3,000');
    expect(screen.getByTestId('podium-2').textContent).not.toContain('WILD CARD');
  });

  it('are laid out in the door order when one was drawn', () => {
    renderWheel({ playOrder: [3, 1, 2] });
    const ids = screen.getAllByTestId(/^podium-\d$/).map((p) => p.getAttribute('data-testid'));
    expect(ids).toEqual(['podium-3', 'podium-1', 'podium-2']);
  });
});

describe('toss-ups', () => {
  it('shows the value, who rang in and who is locked out; never the answer', () => {
    const rig = renderWheel();
    expect(screen.getByTestId('tossup').textContent).toContain('$1000');
    advance(1000);
    expect(screen.getByTestId('tossup').textContent).toContain('RING IN TO ANSWER');
    act(() => {
      rig.phones.press(2);
    });
    expect(screen.getByTestId('tossup').textContent).toContain('Blue RANG IN!');
    fireEvent.click(screen.getByRole('button', { name: /Solve/ }));
    const dialog = screen.getByRole('dialog', { name: /Blue: SOLVE/ });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Wrong' }));
    expect(screen.getByTestId('tossup').textContent).toContain('LOCKED OUT: Blue');
  });

  it('runs the Frenzy clock bar and holds it in the pause menu', () => {
    renderWheel({ settings: { opening: 'frenzy' } });
    expect(screen.getByTestId('tossup').textContent).toContain('FORTUNE FRENZY');
    advance(1000);
    const bar = screen.getByTestId('clock-bar');
    expect(bar).toHaveAttribute('data-kind', 'frenzy');
    expect(within(bar).getByRole('timer').textContent).toBe('30');
    advance(10_000);
    expect(Number(within(bar).getByRole('timer').textContent)).toBeLessThanOrEqual(20);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    const held = within(screen.getByTestId('clock-bar')).getByRole('timer').textContent;
    advance(20_000);
    expect(within(screen.getByTestId('clock-bar')).getByRole('timer').textContent).toBe(held);
  });
});

describe('plates and decisions', () => {
  it('shows BANKRUPT only once the wheel has stopped', () => {
    const state = toRound(1);
    const index = wheelOf(state).findIndex((w) => w.kind === 'bankrupt');
    renderWheel({ initialState: state, rng: () => drawForIndex(index) });
    key(' ');
    advance(3000);
    expect(screen.queryByTestId('result-plate')).toBeNull();
    advance(6000);
    const plate = screen.getByTestId('result-plate');
    expect(plate.textContent).toContain('BANKRUPT');
    expect(plate.textContent).toContain('Red');
    advance(3000);
    expect(screen.queryByTestId('result-plate')).toBeNull();
  });

  it('shows LOSE A TURN and passes the wheel', () => {
    const state = toRound(1);
    const index = wheelOf(state).findIndex((w) => w.kind === 'lose-turn');
    renderWheel({ initialState: state, rng: () => drawForIndex(index) });
    key(' ');
    advance(9000);
    expect(screen.getByTestId('result-plate').textContent).toContain('LOSE A TURN');
    expect(screen.getByTestId('podium-2')).toHaveAttribute('data-active', 'true');
  });

  it('asks the Express question and lets the host ride it', () => {
    const base = toRound(3);
    const state: WheelState = {
      ...base,
      phase: 'express-choice',
      spin: { index: 6, kind: 'express', value: 1000, third: null, wildCardCall: false, earned: 1000 },
    };
    renderWheel({ initialState: state });
    expect(screen.getByTestId('express-dialog')).toBeInTheDocument();
    key('r');
    expect(screen.queryByTestId('express-dialog')).toBeNull();
    expect(screen.getByTestId('prompt').textContent).toContain('ON THE EXPRESS');
  });

  it('flips a Mystery wedge from the dialog', () => {
    const base = toRound(2);
    const state: WheelState = {
      ...base,
      phase: 'mystery-choice',
      spin: { index: 5, kind: 'mystery', value: 1000, third: null, wildCardCall: false, earned: 1000 },
    };
    renderWheel({ initialState: state, rng: () => 0.1 });
    fireEvent.click(screen.getByRole('button', { name: /Flip it/ }));
    advance(2500);
    expect(screen.getByTestId('result-plate').textContent).toContain('$10,000');
  });

  it('offers the Wild Card after a correct consonant on a dollar value', () => {
    const base = toRound(1);
    const state: WheelState = {
      ...base,
      teams: base.teams.map((t) => (t.id === 1 ? { ...t, wildCard: true } : t)),
      lastConsonant: 700,
    };
    renderWheel({ initialState: state });
    fireEvent.click(
      within(screen.getByTestId('wild-card-prompt')).getByRole('button', { name: 'Play the Wild Card' }),
    );
    expect(screen.getByTestId('prompt').textContent).toContain('CALL A CONSONANT');
    expect(screen.getByTestId('podium-1').textContent).toContain('WILD CARD PLAYED');
  });
});

describe('hotkeys', () => {
  it('Shift+U undoes, Shift+T rings the bell, B opens the vowel pick when no letter is accepted', () => {
    const base = toRound(1);
    const rich = { ...base, teams: base.teams.map((t) => (t.id === 1 ? { ...t, roundCash: 900 } : t)) };
    renderWheel({ initialState: rich });
    key('B');
    expect(screen.getByRole('dialog', { name: /BUY A VOWEL/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    key('T', { shiftKey: true });
    expect(screen.getByTestId('wheel-game')).toHaveAttribute('data-stage', 'speedup');
    advance(600);
    key('U', { shiftKey: true });
    expect(screen.getByTestId('wheel-game')).toHaveAttribute('data-stage', 'round');
  });

  it('ignores keys typed in a text box, with a modifier, held down, or while paused', () => {
    renderWheel({ initialState: toRound(1) });
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: ' ' });
    key(' ', { ctrlKey: true });
    key(' ', { repeat: true });
    expect(screen.getByTestId('game-wheel')).toHaveAttribute('data-spinning', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    key(' ');
    expect(screen.getByTestId('game-wheel')).toHaveAttribute('data-spinning', 'false');
    input.remove();
  });

  it('Enter moves on from the award card', () => {
    const base = toRound(1);
    const rig = renderWheel({ initialState: base });
    act(() => {
      rig.phones.action(1, 'solve-start');
      rig.phones.action(1, 'solve', 'red apple pie');
    });
    expect(screen.getByTestId('round-award')).toBeInTheDocument();
    key('Enter');
    expect(screen.queryByTestId('round-award')).toBeNull();
    expect(screen.getByTestId('category-strip').textContent).toContain('ROUND 2');
  });
});

describe('banners and the end of the game', () => {
  it('shows the Speed-Up banner with what a consonant pays after the spin', () => {
    const base = toRound(4);
    renderWheel({ initialState: run(base, { type: 'RING_BELL' }) });
    expect(screen.getByTestId('stage-banner')).toHaveAttribute('data-kind', 'speedup');
    expect(screen.getByTestId('stage-banner').textContent).toContain('SPIN ONCE');
  });

  it('shows the winner card with points and chips, and reports once on Continue', () => {
    let s = autoplay(
      newGame({ length: 'short', bonusRound: false }),
      (st) => st.phase === 'round-award' && st.award?.speedUp === true,
    );
    s = run(s, { type: 'ADJUST_BANK', team: 1, delta: 5000 }, { type: 'CONTINUE' });
    expect(s.stage).toBe('game-over');
    const rig = renderWheel({ initialState: s });
    const card = screen.getByTestId('winner-card');
    expect(card.textContent).toContain('Red WINS!');
    expect(card.textContent).toMatch(/\+\d+ points? and a Plinko chip/);
    fireEvent.click(within(card).getByRole('button', { name: /Continue to the hub/ }));
    expect(rig.ended).toHaveLength(1);
    expect(rig.ended[0]).toMatchObject({ winnerId: 1 });
  });

  it('shows the tiebreaker card for the tied teams', () => {
    let s = autoplay(
      newGame({ length: 'short' }),
      (st) => st.phase === 'round-award' && st.award?.speedUp === true,
    );
    s = run(s, { type: 'ADJUST_BANK', team: 1, delta: 9000 });
    const top = Math.max(...s.teams.map((t) => t.bank));
    s = run(s, { type: 'ADJUST_BANK', team: 2, delta: top - (s.teams[1]?.bank ?? 0) });
    s = run(s, { type: 'CONTINUE' });
    expect(s.stage).toBe('tiebreak');
    renderWheel({ initialState: s });
    expect(screen.getByTestId('tiebreaker-card').textContent).toContain('Red and Blue are tied');
  });
});

describe('the Bonus Round on the stage', () => {
  it('walks category, wheel, letters, clock and envelope without showing the prize early', () => {
    const base = toRound(1);
    const bonus: WheelState = {
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
      planIndex: base.plan.findIndex((seg) => seg.kind === 'bonus'),
    };
    const rig = renderWheel({ initialState: bonus, rng: () => 0.42 });
    expect(screen.getByTestId('bonus-round')).toHaveAttribute('data-phase', 'bonus-category');
    key('2');
    expect(screen.getByTestId('bonus-round')).toHaveAttribute('data-phase', 'bonus-spin');
    key(' ');
    expect(screen.getByTestId('bonus-wheel')).toHaveAttribute('data-spinning', 'true');
    expect(screen.getByTestId('bonus-rotor').style.transform).toMatch(/^rotate\(/);
    advance(5200);
    expect(screen.getByTestId('bonus-round')).toHaveAttribute('data-phase', 'bonus-letters');
    // R S T L N E light one by one after the wheel stops.
    advance(3000);
    expect(screen.getByTestId('puzzle-board').textContent.length).toBeGreaterThan(0);
    expect(screen.getByTestId('bonus-round').textContent).toContain('CALL 3 CONSONANTS AND 1 VOWEL');

    act(() => {
      rig.phones.action(1, 'solve', 'definitely not it');
    });
    expect(screen.getByTestId('bonus-round')).toHaveAttribute('data-phase', 'bonus-letters');

    // The host rules a guess right: the envelope is still sealed.
    fireEvent.click(screen.getByRole('button', { name: /Guess: type or rule/ }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: /Red: SOLVE/ })).getByRole('button', { name: 'Correct' }),
    );
    expect(screen.getByTestId('bonus-round')).toHaveAttribute('data-phase', 'bonus-won');
    expect(screen.getByTestId('envelope-card').textContent).toContain('THE ENVELOPE IS SEALED');
    expect(screen.queryByTestId('envelope-prize')).toBeNull();

    advance(600);
    fireEvent.click(screen.getByRole('button', { name: /Open the envelope/ }));
    expect(screen.getByTestId('envelope-card').textContent).toContain('OPENING THE ENVELOPE');
    expect(screen.queryByTestId('envelope-prize')).toBeNull();
    advance(3100);
    expect(screen.getByTestId('envelope-card').textContent).toContain('YOU WIN!');
    expect(screen.getByTestId('envelope-prize').textContent).toMatch(/^\$[\d,]+$|^A CAR/);
  });
});
