import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toCanvas } from 'qrcode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEventSession, defaultTeamEdits, type EventAction, type EventSession } from '@/engines/event';
import type { PresenceEntry } from '@/realtime';
import { SetupScreen } from './SetupScreen';

vi.mock('qrcode', () => ({ toCanvas: vi.fn(() => Promise.resolve()) }));

const roster = (team: number, nickname: string): PresenceEntry => ({
  key: `${nickname}-${String(team)}`,
  role: 'phone',
  team,
  nickname,
  ua: 'test',
});

describe('SetupScreen', () => {
  let dispatch: ReturnType<typeof vi.fn<(action: EventAction) => void>>;

  beforeEach(() => {
    dispatch = vi.fn<(action: EventAction) => void>();
    vi.mocked(toCanvas).mockClear();
  });

  const mount = (session: EventSession = createEventSession(), extra: { roster?: PresenceEntry[] } = {}) =>
    render(
      <SetupScreen
        eventName="Friday night"
        session={session}
        dispatch={dispatch}
        roomCode="BCDF"
        origin="https://show.example"
        status="connected"
        roomError={null}
        roster={extra.roster ?? []}
        showMode={false}
        onOpenSettings={vi.fn()}
        onExitEvent={vi.fn()}
      />,
    );

  it('shows the room code large, a QR code for the join link and the short address', () => {
    mount();
    expect(screen.getByLabelText('Room code BCDF')).toHaveTextContent('BCDF');
    const qr = screen.getByRole('img', { name: /QR code/ });
    expect(qr).toHaveAccessibleName('QR code that opens https://show.example/play?room=BCDF');
    expect(toCanvas).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      'https://show.example/play?room=BCDF',
      expect.objectContaining({ errorCorrectionLevel: 'M' }),
    );
    expect(screen.getByText('show.example/play')).toBeInTheDocument();
    expect(screen.getByText('Phones can join')).toBeInTheDocument();
  });

  it('lists connected phones per team from presence', () => {
    mount(createEventSession(), { roster: [roster(1, 'Ann'), roster(1, 'Bob'), roster(2, 'Cy')] });
    expect(screen.getByText('Connected phones: 3')).toBeInTheDocument();
    const list = screen.getByRole('region', { name: 'Connected phones' });
    expect(within(list).getByText('Ann, Bob')).toBeInTheDocument();
    expect(within(list).getByText('Cy')).toBeInTheDocument();
  });

  it('edits team names, saving every valid edit to the event', async () => {
    const u = userEvent.setup();
    mount();
    const name = screen.getByLabelText('Team 1 name');
    await u.clear(name);
    await u.type(name, 'Reds');
    const last = dispatch.mock.calls.at(-1)?.[0];
    expect(last).toMatchObject({ type: 'SET_TEAMS' });
    expect(last?.type === 'SET_TEAMS' && last.teams.map((t) => t.name)).toEqual(['Reds', 'Team 2']);
  });

  it('picks a team colour from the eight defaults', async () => {
    const u = userEvent.setup();
    mount();
    const group = screen.getByRole('radiogroup', { name: 'Team 1 colour' });
    expect(within(group).getAllByRole('radio')).toHaveLength(8);
    await u.click(within(group).getByRole('radio', { name: 'Colour 5' }));
    const last = dispatch.mock.calls.at(-1)?.[0];
    expect(last?.type === 'SET_TEAMS' && last.teams[0]?.color).toBe('#9b5de5');
  });

  it('parses player names', async () => {
    const u = userEvent.setup();
    mount();
    await u.type(screen.getByLabelText('Team 2 players'), 'Ann, Bob');
    const last = dispatch.mock.calls.at(-1)?.[0];
    expect(last?.type === 'SET_TEAMS' && last.teams[1]?.players).toEqual(['Ann', 'Bob']);
  });

  it('adds and removes teams within 2 to 8', async () => {
    const u = userEvent.setup();
    mount();
    expect(screen.getByRole('button', { name: 'Remove a team' })).toBeDisabled();
    for (let i = 0; i < 6; i += 1) await u.click(screen.getByRole('button', { name: 'Add a team' }));
    const rows = () => within(screen.getByRole('list', { name: 'Teams' })).getAllByRole('listitem');
    expect(rows()).toHaveLength(8);
    expect(screen.getByRole('button', { name: 'Add a team' })).toBeDisabled();
    const last = dispatch.mock.calls.at(-1)?.[0];
    expect(last?.type === 'SET_TEAMS' && last.teams).toHaveLength(8);
    await u.click(screen.getByRole('button', { name: 'Remove a team' }));
    expect(rows()).toHaveLength(7);
  });

  it('blocks duplicate and empty names: inline error, nothing saved, Start disabled', async () => {
    const u = userEvent.setup();
    mount();
    const name = screen.getByLabelText('Team 2 name');
    await u.clear(name);
    expect(screen.getByRole('alert')).toHaveTextContent('Give this team a name');
    await u.type(name, 'team 1');
    expect(screen.getByRole('alert')).toHaveTextContent('already has this name');
    // Every state that was saved on the way (the valid prefixes "t", "te", ...) had unique names.
    for (const [action] of dispatch.mock.calls) {
      if (action.type !== 'SET_TEAMS') continue;
      const names = action.teams.map((t) => t.name.trim().toLowerCase());
      expect(new Set(names).size).toBe(names.length);
    }
    const lastSaved = dispatch.mock.calls.at(-1)?.[0];
    expect(lastSaved?.type === 'SET_TEAMS' && lastSaved.teams[1]?.name).toBe('team ');
    expect(screen.getByRole('button', { name: 'Start Game!' })).toBeDisabled();
    await u.type(name, 'x');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Start Game!' })).toBeEnabled();
  });

  it('starts with two teams straight to the hub', async () => {
    const u = userEvent.setup();
    mount();
    await u.click(screen.getByRole('button', { name: 'Start Game!' }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'GO_HUB' });
  });

  it('starts with three or more teams at the door game', async () => {
    const u = userEvent.setup();
    mount(createEventSession(defaultTeamEdits(3)));
    expect(screen.getByText(/pick doors first/)).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Start Game!' }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'START_DOORS' });
  });

  it('offers Settings and a way back to the event list, but not in show mode', async () => {
    const onOpenSettings = vi.fn();
    const onExitEvent = vi.fn();
    const props = {
      eventName: 'Friday night',
      session: createEventSession(),
      dispatch,
      roomCode: 'BCDF',
      origin: 'https://show.example',
      status: 'connected' as const,
      roomError: null,
      roster: [],
      onOpenSettings,
      onExitEvent,
    };
    const u = userEvent.setup();
    const { rerender } = render(<SetupScreen {...props} showMode={false} />);
    await u.click(screen.getByRole('button', { name: 'Settings' }));
    await u.click(screen.getByRole('button', { name: 'Back to my events' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(onExitEvent).toHaveBeenCalledTimes(1);
    rerender(<SetupScreen {...props} showMode />);
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
  });

  it('says when the room is unavailable and keeps the editor usable', () => {
    render(
      <SetupScreen
        eventName="Friday night"
        session={createEventSession()}
        dispatch={dispatch}
        roomCode={null}
        origin="https://show.example"
        status="error"
        roomError="offline"
        roster={[]}
        showMode={false}
        onOpenSettings={vi.fn()}
        onExitEvent={vi.fn()}
      />,
    );
    expect(screen.getByText(/Phones are unavailable: offline/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Game!' })).toBeEnabled();
  });

  it('draws the QR code again when the room code changes', async () => {
    const { rerender } = mount();
    act(() => {
      rerender(
        <SetupScreen
          eventName="Friday night"
          session={createEventSession()}
          dispatch={dispatch}
          roomCode="GHJK"
          origin="https://show.example"
          status="connected"
          roomError={null}
          roster={[]}
          showMode={false}
          onOpenSettings={vi.fn()}
          onExitEvent={vi.fn()}
        />,
      );
    });
    await waitFor(() => {
      expect(toCanvas).toHaveBeenLastCalledWith(
        expect.any(HTMLCanvasElement),
        'https://show.example/play?room=GHJK',
        expect.anything(),
      );
    });
  });
});
