import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomTransport } from '@/realtime/RoomTransport';
import {
  connectStage,
  createHarness,
  renderPhone,
  TEAMS,
  type Harness,
  type StageHandle,
} from './phoneTestKit';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, 'vibrate');
});

interface Session {
  h: Harness;
  code: string;
  stage: StageHandle;
}

/** Seeds a room, stores the team so the phone rejoins silently, renders it and connects a stage. */
async function playAs(team: number, options: { fake?: boolean } = {}): Promise<Session> {
  const h = createHarness();
  const { code } = await h.seedRoom(TEAMS);
  localStorage.setItem('gst:buzz:room', code);
  localStorage.setItem(`gst:buzz:team:${code}`, String(team));
  const stage = await connectStage(h.hub, code);
  if (options.fake === true) vi.useFakeTimers();
  renderPhone(h);
  if (options.fake === true) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
  // The phone must be on the hub before the stage speaks, or the message is lost (as it would be live).
  if (options.fake === true) screen.getByText('Live');
  else await screen.findByText('Live');
  return { h, code, stage };
}

const buzzButton = (): HTMLElement => screen.getByRole('button', { name: /^buzz/i });

const send = async (action: () => Promise<void>, fake = false): Promise<void> => {
  await act(async () => {
    await action();
    if (fake) await vi.advanceTimersByTimeAsync(0);
  });
};

const advance = async (ms: number): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe('BUZZ screen states', () => {
  it('shows the header: team name, room code and a connection word', async () => {
    const { code } = await playAs(2);
    expect(await screen.findByText('Blues')).toBeInTheDocument();
    expect(screen.getByText(`Room ${code}`)).toBeInTheDocument();
    expect(await screen.findByText('Live')).toBeInTheDocument();
  });

  it('is live for a team in buzzTeams', async () => {
    const { stage } = await playAs(2);
    await screen.findByText('Joining the game…');
    await send(() => stage.controls({ buzzTeams: [1, 2] }));
    expect(await screen.findByRole('button', { name: 'BUZZ' })).toBeEnabled();
  });

  it.each([
    ['Not in this match', { buzzTeams: [1, 3], offLabel: 'Not in this match' }],
    ['Buzzers are off', { buzzTeams: [], offLabel: 'Buzzers are off' }],
    ['Locked out of this puzzle', { offLabel: 'Locked out of this puzzle' }],
    ['Waiting for Reds', { activeTeam: 1, turnName: 'Reds', canSpin: true }],
  ])('greys out with "%s"', async (label, controls) => {
    const { stage } = await playAs(2);
    await screen.findByText('Joining the game…');
    await send(() => stage.controls(controls));
    const button = await screen.findByRole('button', { name: label });
    expect(button).toBeDisabled();
  });

  it('makes the buzz button a big target', async () => {
    const { stage } = await playAs(2);
    await send(() => stage.controls({ buzzTeams: [2] }));
    const button = await screen.findByRole('button', { name: 'BUZZ' });
    // Layout is not computed in jsdom; the 60% rule is in the stylesheet, which the markup must hook into.
    expect(button.closest('section')).toHaveAttribute('aria-label', 'Buzzer');
    expect(button).toHaveAttribute('data-view', 'live');
  });
});

describe('pressing BUZZ', () => {
  it('sends press { pressId, team, at } with a fresh id each time and vibrates', async () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    const { stage } = await playAs(2);
    await send(() => stage.controls({ buzzTeams: [2] }));
    const user = userEvent.setup();
    const button = await screen.findByRole('button', { name: 'BUZZ' });

    await user.click(button);
    await new Promise((resolve) => setTimeout(resolve, 170));
    await user.click(buzzButton());
    await vi.waitFor(() => {
      expect(stage.phones.length).toBeGreaterThanOrEqual(2);
    });

    const [a, b] = stage.phones;
    expect(a?.event).toBe('press');
    expect(a?.message).toMatchObject({ team: 2, from: 'phone' });
    if (a?.event !== 'press' || b?.event !== 'press') throw new Error('expected two presses');
    expect(a.message.pressId).not.toBe(b.message.pressId);
    expect(a.message.at).toBeGreaterThan(0);
    expect(vibrate).toHaveBeenCalledWith(30);
  });

  it('rate limits presses to one per 150 ms', async () => {
    const { stage } = await playAs(2, { fake: true });
    await send(() => stage.controls({ buzzTeams: [2] }), true);
    const button = screen.getByRole('button', { name: 'BUZZ' });

    fireEvent.click(button);
    fireEvent.click(buzzButton());
    await advance(100);
    fireEvent.click(buzzButton());
    await advance(0);
    expect(stage.phones).toHaveLength(1);

    await advance(60);
    fireEvent.click(buzzButton());
    await advance(0);
    expect(stage.phones).toHaveLength(2);
  });

  it('shows "Buzzed (waiting…)" until the ack, then flashes BUZZED! and goes back to BUZZ', async () => {
    const { stage } = await playAs(2, { fake: true });
    await send(() => stage.controls({ buzzTeams: [2] }), true);
    fireEvent.click(screen.getByRole('button', { name: 'BUZZ' }));
    await advance(0);
    expect(screen.getByRole('button', { name: 'Buzzed (waiting…)' })).toBeInTheDocument();

    const first = stage.phones[0];
    if (first?.event !== 'press') throw new Error('expected a press');
    await send(() => stage.ack(2, first.message.pressId, true), true);
    expect(screen.getByRole('button', { name: 'BUZZED!' })).toBeInTheDocument();

    await advance(1300);
    expect(screen.getByRole('button', { name: 'BUZZ' })).toBeInTheDocument();
  });

  it('drops the optimistic state after 1.5 s without an ack', async () => {
    const { stage } = await playAs(2, { fake: true });
    await send(() => stage.controls({ buzzTeams: [2] }), true);
    fireEvent.click(screen.getByRole('button', { name: 'BUZZ' }));
    await advance(1400);
    expect(screen.getByRole('button', { name: 'Buzzed (waiting…)' })).toBeInTheDocument();
    await advance(200);
    expect(screen.getByRole('button', { name: 'BUZZ' })).toBeInTheDocument();
  });

  it('does not flash for a refused press or another team’s ack', async () => {
    const { stage } = await playAs(2, { fake: true });
    await send(() => stage.controls({ buzzTeams: [2] }), true);
    fireEvent.click(screen.getByRole('button', { name: 'BUZZ' }));
    await advance(0);
    const first = stage.phones[0];
    if (first?.event !== 'press') throw new Error('expected a press');

    await send(() => stage.ack(1, first.message.pressId, true), true);
    expect(screen.queryByRole('button', { name: 'BUZZED!' })).toBeNull();
    await send(() => stage.ack(2, first.message.pressId, false), true);
    expect(screen.queryByRole('button', { name: 'BUZZED!' })).toBeNull();
    expect(screen.getByRole('button', { name: 'BUZZ' })).toBeInTheDocument();
  });

  it('keeps BUZZED! on screen even if the stage switches the buzzers off at once', async () => {
    const { stage } = await playAs(2, { fake: true });
    await send(() => stage.controls({ buzzTeams: [2] }), true);
    fireEvent.click(screen.getByRole('button', { name: 'BUZZ' }));
    await advance(0);
    const first = stage.phones[0];
    if (first?.event !== 'press') throw new Error('expected a press');
    await send(() => stage.ack(2, first.message.pressId, true), true);
    await send(() => stage.controls({ buzzTeams: [], offLabel: 'Buzzers are off' }), true);
    expect(screen.getByRole('button', { name: 'BUZZED!' })).toBeInTheDocument();
    await advance(1300);
    expect(screen.getByRole('button', { name: 'Buzzers are off' })).toBeDisabled();
  });
});

describe('podium', () => {
  const myTurn = { activeTeam: 2, canBuy: true, canSpin: true, canSolve: true, turnName: 'Blues' };

  it('shows BUY, SPIN and SOLVE on the active team’s phone and greys unavailable ones', async () => {
    const { stage } = await playAs(2);
    await send(() => stage.controls({ ...myTurn, canBuy: false }));
    expect(await screen.findByText('Your turn')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buy' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Spin' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Solve' })).toBeEnabled();
  });

  it('is not shown when another team is up', async () => {
    const { stage } = await playAs(2);
    await send(() => stage.controls({ ...myTurn, activeTeam: 1, turnName: 'Reds' }));
    expect(await screen.findByRole('button', { name: 'Waiting for Reds' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Spin' })).toBeNull();
  });

  it('sends buy and spin actions with the team and a unique id', async () => {
    const { stage } = await playAs(2);
    await send(() => stage.controls(myTurn));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Buy' }));
    await new Promise((resolve) => setTimeout(resolve, 170));
    await user.click(screen.getByRole('button', { name: 'Spin' }));
    await vi.waitFor(() => {
      expect(stage.phones).toHaveLength(2);
    });
    const [buy, spin] = stage.phones;
    if (buy?.event !== 'action' || spin?.event !== 'action') throw new Error('expected actions');
    expect(buy.message).toMatchObject({ team: 2, action: 'buy' });
    expect(spin.message).toMatchObject({ team: 2, action: 'spin' });
    expect('answer' in buy.message).toBe(false);
    expect(buy.message.pressId).not.toBe(spin.message.pressId);
  });

  it('SOLVE sends solve-start on open, solve-cancel on close', async () => {
    const { stage } = await playAs(2);
    await send(() => stage.controls(myTurn));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Solve' }));
    expect(await screen.findByLabelText('Solve the puzzle')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await vi.waitFor(() => {
      expect(stage.phones).toHaveLength(2);
    });
    expect(stage.phones.map((m) => (m.event === 'action' ? m.message.action : m.event))).toEqual([
      'solve-start',
      'solve-cancel',
    ]);
    expect(screen.getByRole('button', { name: 'Solve' })).toBeInTheDocument();
  });

  it('submits the answer with action solve and no cancel, trimmed and capped at 200 characters', async () => {
    const { stage } = await playAs(2);
    await send(() => stage.controls(myTurn));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Solve' }));
    const box = await screen.findByLabelText('Solve the puzzle');
    expect(box).toHaveAttribute('maxlength', '200');
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();

    fireEvent.change(box, { target: { value: `  ${'A'.repeat(200)}  ` } });
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await vi.waitFor(() => {
      expect(stage.phones).toHaveLength(2);
    });
    const solve = stage.phones[1];
    if (solve?.event !== 'action') throw new Error('expected an action');
    expect(solve.message).toMatchObject({ team: 2, action: 'solve', answer: 'A'.repeat(200) });
    expect(screen.queryByLabelText('Solve the puzzle')).toBeNull();
  });

  it('keeps the answer box when the stage turns the buttons off after solve-start', async () => {
    const { stage } = await playAs(2);
    await send(() => stage.controls(myTurn));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Solve' }));
    await send(() => stage.controls({ ...myTurn, canBuy: false, canSpin: false, canSolve: false }));
    expect(await screen.findByLabelText('Solve the puzzle')).toBeInTheDocument();
  });

  it('closes the answer box quietly when the turn moves to another team', async () => {
    const { stage } = await playAs(2);
    await send(() => stage.controls(myTurn));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Solve' }));
    await send(() => stage.controls({ ...myTurn, activeTeam: 3, turnName: 'Greens' }));
    expect(await screen.findByRole('button', { name: 'Waiting for Greens' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Solve the puzzle')).toBeNull();
    expect(stage.phones.map((m) => (m.event === 'action' ? m.message.action : m.event))).toEqual([
      'solve-start',
    ]);
  });

  it('cancels an open solve when the player taps Change team', async () => {
    const { stage } = await playAs(2);
    await send(() => stage.controls(myTurn));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Solve' }));
    await user.click(screen.getByRole('button', { name: 'Change team' }));
    await vi.waitFor(() => {
      expect(stage.phones.map((m) => (m.event === 'action' ? m.message.action : m.event))).toEqual([
        'solve-start',
        'solve-cancel',
      ]);
    });
  });

  it('shows a short note from the ack of an action', async () => {
    const { stage } = await playAs(2);
    await send(() => stage.controls(myTurn));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Spin' }));
    await vi.waitFor(() => {
      expect(stage.phones).toHaveLength(1);
    });
    const spin = stage.phones[0];
    if (spin?.event !== 'action') throw new Error('expected an action');
    await send(() => stage.ack(2, spin.message.pressId, false));
    expect(await screen.findByText('Not right now')).toBeInTheDocument();
  });
});

describe('Feud typing', () => {
  it('shows an answer box instead of BUZZ when the stage says TYPE YOUR ANSWER, and sends feud-answer', async () => {
    const { stage } = await playAs(2);
    await send(() => stage.controls({ activeTeam: 2, offLabel: 'TYPE YOUR ANSWER' }));
    const user = userEvent.setup();
    const box = await screen.findByRole('textbox', { name: 'TYPE YOUR ANSWER' });
    expect(screen.queryByRole('button', { name: 'BUZZ' })).toBeNull();

    await user.type(box, 'Pizza{Enter}');
    await vi.waitFor(() => {
      expect(stage.phones).toHaveLength(1);
    });
    expect(stage.phones[0]).toMatchObject({ event: 'feud-answer', message: { team: 2, text: 'Pizza' } });
    expect(screen.getByRole('textbox', { name: 'TYPE YOUR ANSWER' })).toHaveValue('');
    expect(screen.getByText('Sent')).toBeInTheDocument();
  });

  it('does not offer typing to a team that is not up', async () => {
    const { stage } = await playAs(2);
    await send(() => stage.controls({ activeTeam: 1, turnName: 'Reds', offLabel: 'TYPE YOUR ANSWER' }));
    expect(await screen.findByRole('button', { name: 'Waiting for Reds' })).toBeDisabled();
    expect(screen.queryByRole('textbox', { name: 'TYPE YOUR ANSWER' })).toBeNull();
  });
});

describe('connection states', () => {
  const stubTransport = (connect: () => Promise<void>): RoomTransport => ({
    status: 'connecting',
    connect,
    disconnect: () => Promise.resolve(),
    publish: () => Promise.resolve(),
    subscribe: () => () => undefined,
    onPresence: () => () => undefined,
    onStatus: () => () => undefined,
  });

  it('shows a spinner message while connecting', async () => {
    const h = createHarness();
    const { code } = await h.seedRoom(TEAMS);
    localStorage.setItem('gst:buzz:room', code);
    localStorage.setItem(`gst:buzz:team:${code}`, '1');
    h.services.createTransport = () => stubTransport(() => new Promise<void>(() => undefined));
    renderPhone(h);
    expect(await screen.findByText('Connecting…')).toBeInTheDocument();
  });

  it('offers Try again when the first connection fails', async () => {
    const h = createHarness();
    const { code } = await h.seedRoom(TEAMS);
    localStorage.setItem('gst:buzz:room', code);
    localStorage.setItem(`gst:buzz:team:${code}`, '1');
    const connect = vi.fn(() => Promise.reject(new Error('nope')));
    h.services.createTransport = () => stubTransport(connect);
    const user = userEvent.setup();
    renderPhone(h);

    expect(await screen.findByText('Not connected')).toBeInTheDocument();
    expect(connect).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await vi.waitFor(() => {
      expect(connect).toHaveBeenCalledTimes(2);
    });
  });

  it('shows "Reconnecting…" and a Not connected button while the link is down, then recovers', async () => {
    const { h, code, stage } = await playAs(2);
    await send(() => stage.controls({ buzzTeams: [2] }));
    await screen.findByRole('button', { name: 'BUZZ' });

    await act(async () => {
      h.hub.simulateDisconnect(code);
      await Promise.resolve();
    });
    expect(await screen.findByText('Reconnecting…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not connected' })).toBeDisabled();

    await act(async () => {
      h.hub.simulateReconnect(code);
      await Promise.resolve();
    });
    expect(screen.queryByText('Reconnecting…')).toBeNull();
    expect(await screen.findByRole('button', { name: 'BUZZ' })).toBeEnabled();
  });

  it('shows "Waiting for the game screen…" after 8 s of silence, and clears when the stage speaks', async () => {
    const h = createHarness();
    const { code } = await h.seedRoom(TEAMS);
    localStorage.setItem('gst:buzz:room', code);
    localStorage.setItem(`gst:buzz:team:${code}`, '2');
    vi.useFakeTimers();
    renderPhone(h);
    await advance(0);
    expect(screen.getByText('Joining the game…')).toBeInTheDocument();

    await advance(7900);
    expect(screen.queryByText('Waiting for the game screen…')).toBeNull();
    await advance(200);
    expect(screen.getByText('Waiting for the game screen…')).toBeInTheDocument();

    const stage = await connectStage(h.hub, code);
    await send(() => stage.controls({ buzzTeams: [2] }), true);
    expect(screen.queryByText('Waiting for the game screen…')).toBeNull();
    expect(screen.getByRole('button', { name: 'BUZZ' })).toBeInTheDocument();
  });

  it('does not wait when a stage message arrives within 8 s', async () => {
    const { stage } = await playAs(2, { fake: true });
    await advance(5000);
    await send(() => stage.teams(TEAMS), true);
    await advance(20_000);
    expect(screen.queryByText('Waiting for the game screen…')).toBeNull();
  });

  it('treats stage audience messages as a heartbeat: silence after one means waiting', async () => {
    const { stage } = await playAs(2, { fake: true });
    await send(() => stage.controls({ buzzTeams: [2] }), true);
    await advance(20_000);
    expect(screen.queryByText('Waiting for the game screen…')).toBeNull();

    await send(() => stage.audience(), true);
    await advance(7000);
    expect(screen.queryByText('Waiting for the game screen…')).toBeNull();
    await send(() => stage.audience(), true);
    await advance(7000);
    expect(screen.queryByText('Waiting for the game screen…')).toBeNull();
    await advance(1500);
    expect(screen.getByText('Waiting for the game screen…')).toBeInTheDocument();

    await send(() => stage.audience(), true);
    expect(screen.queryByText('Waiting for the game screen…')).toBeNull();
  });

  it('gives up after 2 minutes of waiting and asks for the code again (FR-026)', async () => {
    const { code } = await playAs(2, { fake: true });
    await advance(8100);
    expect(screen.getByText('Waiting for the game screen…')).toBeInTheDocument();

    await advance(119_000);
    expect(screen.getByText('Waiting for the game screen…')).toBeInTheDocument();
    await advance(1500);
    expect(screen.queryByText('Waiting for the game screen…')).toBeNull();
    expect(screen.getByLabelText('Room code')).toHaveValue('');
    expect(screen.getByRole('alert')).toHaveTextContent('Lost the game screen');
    expect(localStorage.getItem('gst:buzz:room')).toBeNull();
    expect(localStorage.getItem(`gst:buzz:team:${code}`)).toBeNull();
  });

  it('touches the room every 5 minutes while connected', async () => {
    const { h, code, stage } = await playAs(2, { fake: true });
    const touch = vi.spyOn(h.data.rooms, 'touchRoom');
    await send(() => stage.controls({ buzzTeams: [2] }), true);
    await advance(5 * 60 * 1000 - 100);
    expect(touch).not.toHaveBeenCalled();
    await advance(200);
    expect(touch).toHaveBeenCalledTimes(1);
    expect(touch).toHaveBeenCalledWith(code);
    await advance(5 * 60 * 1000);
    expect(touch).toHaveBeenCalledTimes(2);
  });

  it('does not touch rooms in demo mode', async () => {
    const h = createHarness('demo');
    const touch = vi.spyOn(h.data.rooms, 'touchRoom');
    vi.useFakeTimers();
    renderPhone(h, '?demo=1&room=DMKT');
    await advance(0);
    fireEvent.click(screen.getByRole('option', { name: /Team 1/ }));
    await advance(6 * 60 * 1000);
    expect(touch).not.toHaveBeenCalled();
  });
});
