import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drawForIndex } from '@/engines/wheel/wheels';
import { toRound, wheelOf } from '@/engines/wheel/testKit';
import type { WheelSettings, WheelState } from '@/engines/wheel/types';
import type { GameSettingsBundle } from '@/stage/gameContract';
import { DEFAULT_FEUD_SETTINGS } from '@/games/feud/settings';
import { DEFAULT_WHEEL_SETTINGS } from './settings';
import { renderWheel } from './wheelTestUtils';
import { readWheelHostData } from './hostData';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(4_000_000);
});
afterEach(() => {
  vi.useRealTimers();
});

const advance = (ms: number): void => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

/** Round 1, Red to play, the puzzle RED APPLE PIE with one P lit and two P tiles still to light. */
function midRound(): WheelState {
  const base = toRound(1);
  const ps = base.puzzle;
  if (!ps) throw new Error('no puzzle');
  const tiles = ps.tiles.map((t, i) => (t.char === 'P' ? i : -1)).filter((i) => i >= 0);
  const shown = ps.shown.map((_, i) => i === tiles[0]);
  return { ...base, puzzle: { ...ps, called: ['P'], shown, queue: tiles.slice(1) } };
}

describe('WheelGame: what the room sees (P-002)', () => {
  it('renders the board, wheel, podiums and category without a single unlit letter', () => {
    const { container } = renderWheel({ initialState: midRound() });
    const board = screen.getByTestId('puzzle-board');
    expect(board.textContent).toBe('P');
    const html = container.ownerDocument.body.innerHTML;
    for (const secret of ['RED APPLE PIE', 'APPLE', 'SPARE PUZZLE']) {
      expect(html).not.toContain(secret);
      expect(html.toLowerCase()).not.toContain(secret.toLowerCase());
    }
    expect(screen.getByTestId('category').textContent).toContain('THING');
    expect(screen.getAllByTestId('wedge')).toHaveLength(24);
    expect(screen.getByTestId('podium-1')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('podium-2')).toHaveAttribute('data-active', 'false');
  });

  it('lights the remaining tiles one at a time as the controller ticks', () => {
    renderWheel({ initialState: midRound() });
    const lit = () =>
      screen.getAllByTestId('tile').filter((t) => t.getAttribute('data-lit') === 'true').length;
    expect(lit()).toBe(1);
    advance(450);
    expect(lit()).toBe(2);
    advance(450);
    expect(lit()).toBe(3);
    expect(screen.getByTestId('puzzle-board').textContent).toBe('PPP');
  });

  it('keeps the Bonus envelope sealed until it is opened', () => {
    const rig = renderWheel({ initialState: bonusState() });
    const category = readWheelHostData(rig.host.last.data).bonus?.categories[0];
    expect(category).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`1\\. ${escape(category ?? '')}`) }));
    fireEvent.click(screen.getByRole('button', { name: /Spin/ }));
    advance(5300);
    const envelope = readWheelHostData(rig.host.last.data).envelope;
    expect(envelope).not.toBeNull();
    const text = document.body.textContent;
    expect(text).not.toContain(String(envelope?.value));
    expect(text).not.toMatch(/\$\s?\d{2,3},000/);
    expect(screen.getByText('THE ENVELOPE IS SEALED')).toBeInTheDocument();
  });
});

describe('WheelGame: playing', () => {
  it('spins with Space, holds the result, then asks for a consonant; a letter key calls it', () => {
    const rig = renderWheel({
      initialState: toRound(1),
      rng: () => drawForIndex(wheelOf(toRound(1)).findIndex((w) => w.kind === 'cash' && w.value === 700)),
    });
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.getByTestId('prompt').textContent).toContain('SPINNING');
    expect(screen.getByTestId('game-wheel')).toHaveAttribute('data-spinning', 'true');
    advance(9000);
    expect(screen.getByTestId('prompt').textContent).toContain('CALL A CONSONANT');
    expect(screen.getByTestId('prompt').textContent).toContain('$700');
    fireEvent.keyDown(window, { key: 'p' });
    advance(1500);
    expect(screen.getByTestId('puzzle-board').textContent).toBe('PPP');
    expect(rig.changes.length).toBeGreaterThan(0);
  });

  it('calls a letter from the on-screen keyboard and disables called letters', () => {
    renderWheel({ initialState: spunState() });
    const p = screen.getByRole('button', { name: 'Call P' });
    expect(p).toBeEnabled();
    fireEvent.click(p);
    advance(1500);
    expect(screen.getByRole('button', { name: 'Call P' })).toBeDisabled();
  });

  it('the Solve box judges what is typed: right banks the round, wrong passes the turn', () => {
    renderWheel({ initialState: toRound(1) });
    fireEvent.click(screen.getByRole('button', { name: /Solve/ }));
    const dialog = screen.getByRole('dialog', { name: /Red: SOLVE/ });
    fireEvent.change(within(dialog).getByLabelText('Type the answer'), {
      target: { value: "it's a Red Apple Pie!" },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Check answer' }));
    expect(screen.getByTestId('round-award')).toBeInTheDocument();
    expect(screen.getByText(/On to Round 2/)).toBeInTheDocument();
  });

  it('a wrong typed answer passes the turn', () => {
    renderWheel({ initialState: toRound(1) });
    fireEvent.click(screen.getByRole('button', { name: /Solve/ }));
    const dialog = screen.getByRole('dialog', { name: /Red: SOLVE/ });
    fireEvent.change(within(dialog).getByLabelText('Type the answer'), {
      target: { value: 'blue moon rising' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Check answer' }));
    expect(screen.queryByRole('dialog', { name: /SOLVE/ })).toBeNull();
    expect(screen.getByTestId('podium-2')).toHaveAttribute('data-active', 'true');
  });

  it('a close answer comes back as Accept / Reject with no hint of the answer on screen', () => {
    renderWheel({ initialState: toRound(1) });
    fireEvent.click(screen.getByRole('button', { name: /Solve/ }));
    const dialog = screen.getByRole('dialog', { name: /Red: SOLVE/ });
    fireEvent.change(within(dialog).getByLabelText('Type the answer'), {
      target: { value: 'red apple pies' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Check answer' }));
    expect(screen.getByText(/Close, but not word for word/)).toBeInTheDocument();
    expect(document.body.textContent.toLowerCase()).not.toContain('apple pi');
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(screen.getByTestId('round-award')).toBeInTheDocument();
  });

  it('a phone solve-start opens the box on the stage for that team', () => {
    const rig = renderWheel({ initialState: toRound(1) });
    act(() => {
      rig.phones.action(1, 'solve-start');
    });
    expect(screen.getByRole('dialog', { name: /Red: SOLVE/ })).toBeInTheDocument();
    expect(screen.getByText('RED IS SOLVING...')).toBeInTheDocument();
  });

  it('a phone BUY opens the vowel pick for that team', () => {
    const base = toRound(1);
    const rich = { ...base, teams: base.teams.map((t) => (t.id === 1 ? { ...t, roundCash: 900 } : t)) };
    const rig = renderWheel({ initialState: rich });
    act(() => {
      rig.phones.action(1, 'buy');
    });
    const dialog = screen.getByRole('dialog', { name: /Red: BUY A VOWEL/ });
    fireEvent.click(within(dialog).getByRole('button', { name: 'E' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('podium-1').textContent).toContain('$650');
  });

  it('hides every host button in show mode but keeps the keys working', () => {
    renderWheel({ initialState: toRound(1), showMode: true });
    expect(screen.queryByTestId('wheel-host-bar')).toBeNull();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.queryByRole('dialog')).toBeNull(); // the typed box is a host surface
    expect(screen.getByText('RED IS SOLVING...')).toBeInTheDocument();
  });

  it('puts the Mystery and Express questions on the stage', () => {
    const base = toRound(2);
    const state: WheelState = {
      ...base,
      phase: 'mystery-choice',
      spin: { index: 5, kind: 'mystery', value: 1000, third: null, wildCardCall: false, earned: 2000 },
    };
    renderWheel({ initialState: state });
    expect(screen.getByTestId('mystery-dialog').textContent).toContain('$2,000');
    fireEvent.click(screen.getByRole('button', { name: /Keep/ }));
    expect(screen.queryByTestId('mystery-dialog')).toBeNull();
  });
});

describe('WheelGame: pause menu', () => {
  it('holds the clocks while open, offers restart only when a puzzle can be thrown out, quits on the second tap', () => {
    const base = toRound(1);
    const timed = { ...base, settings: { ...base.settings, turnTimerSec: 5 as const } };
    const rig = renderWheel({ initialState: timed });
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    const menu = screen.getByRole('dialog', { name: 'PAUSED' });
    expect(within(menu).getByRole('button', { name: 'Restart round' })).toBeEnabled();
    advance(30_000);
    expect(screen.getByTestId('podium-1')).toHaveAttribute('data-active', 'true');
    const quit = within(menu).getByRole('button', { name: 'Quit to hub' });
    fireEvent.click(quit);
    expect(rig.quits).toHaveLength(0);
    expect(within(menu).getByRole('button', { name: /Tap again/ })).toBeInTheDocument();
    fireEvent.click(within(menu).getByRole('button', { name: /Tap again/ }));
    expect(rig.quits).toHaveLength(1);
  });

  it('resumes the turn clock from where it was', () => {
    renderWheel({
      initialState: { ...toRound(1), settings: { ...toRound(1).settings, turnTimerSec: 5 as const } },
    });
    advance(3000);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    advance(60_000);
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    advance(1900);
    expect(screen.getByTestId('podium-1')).toHaveAttribute('data-active', 'true');
    advance(300);
    expect(screen.getByTestId('podium-2')).toHaveAttribute('data-active', 'true');
  });
});

describe('WheelGame: lifecycle', () => {
  it('follows the stage lock and gives the pause back on unlock', () => {
    const rig = renderWheel({ initialState: toRound(1) });
    rig.rerender({ inputLocked: true });
    expect(rig.audio.pauseAll).toHaveBeenCalledTimes(1);
    rig.rerender({ inputLocked: false });
    expect(rig.audio.resumeAll).toHaveBeenCalledTimes(1);
  });

  it('stops everything when it unmounts', () => {
    const rig = renderWheel({ initialState: toRound(1) });
    rig.unmount();
    expect(rig.audio.stopAll).toHaveBeenCalled();
  });
});

/** Round 1 with a spin on the $700 wedge already made: the team is asked for a consonant. */
function spunState(): WheelState {
  const base = toRound(1);
  return {
    ...base,
    phase: 'call-consonant',
    spin: { index: 3, kind: 'cash', value: 700, third: null, wildCardCall: false, earned: 0 },
  };
}

/** The Bonus Round has just asked for its puzzles. */
function bonusState(): WheelState {
  const base = toRound(1);
  const teams = base.teams.map((t) => ({ ...t, bank: t.id === 1 ? 9000 : 1000 }));
  return {
    ...base,
    teams,
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
  };
}

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('WheelGame: the host settings from the stage', () => {
  const saved = (over: Partial<WheelSettings> = {}): GameSettingsBundle => ({
    feud: { ...DEFAULT_FEUD_SETTINGS },
    wheel: { ...DEFAULT_WHEEL_SETTINGS, ...over },
    app: { voice: 'off', answersFrom: 'host' },
  });

  it('starts with the saved Wheel rules and shows them in the console form', () => {
    const r = renderWheel({ gameSettings: saved({ opening: 'frenzy', length: 'short' }) });
    expect(r.host.data.nextSettings).toMatchObject({ opening: 'frenzy', length: 'short' });
  });

  it('lets an explicit settings override win over the saved rules', () => {
    const r = renderWheel({
      settings: { opening: 'classic' },
      gameSettings: saved({ opening: 'frenzy', length: 'short' }),
    });
    expect(r.host.data.nextSettings).toMatchObject({ opening: 'classic' });
  });

  it('reports the console next-game form to the stage as the wheel group', () => {
    const onSaveSettings = vi.fn();
    const onSettingsSave = vi.fn();
    const r = renderWheel({ gameSettings: saved(), onSaveSettings, onSettingsSave });
    act(() => {
      r.host.send('save-settings', { opening: 'frenzy', speedUpStart: 'round4', bonusRound: false });
    });
    const expected = {
      opening: 'frenzy',
      speedUpStart: 'round4',
      length: 'full',
      bonusRound: false,
      turnTimerSec: 0,
    };
    expect(onSaveSettings).toHaveBeenLastCalledWith('wheel', expected);
    expect(onSettingsSave).toHaveBeenLastCalledWith(expected);
  });

  it('shows rules saved from the stage Settings in the console form without touching the game in play', () => {
    const r = renderWheel({ gameSettings: saved() });
    const before = r.host.data.settings;
    r.rerender({ gameSettings: saved({ length: 'short', bonusRound: false }) });
    expect(r.host.data.nextSettings).toMatchObject({ length: 'short', bonusRound: false });
    expect(r.host.data.settings).toEqual(before);
  });
});
