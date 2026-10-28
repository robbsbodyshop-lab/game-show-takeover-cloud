import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppServicesProvider, type AppServices } from '@/app/AppContext';
import { AudioPlayer } from '@/audio/player';
import { createDataLayer } from '@/data';
import { MemoryRoomHub, MemoryRoomTransport } from '@/realtime';
import { createStageHostChannel, type StageHostChannel } from './hostChannel';
import type { CommandResult, HostCommand } from './hostProtocol';
import { HostView } from './HostView';
import type { HubSnapshotData } from './hubSnapshot';
import { FakeBroadcastChannel, TEST_ROOM } from './testUtils';

const hubData = (over: Partial<HubSnapshotData> = {}): HubSnapshotData => ({
  phase: 'feud:face-off',
  paused: false,
  showMode: false,
  gameVisible: true,
  activeGame: null,
  roomCode: TEST_ROOM,
  teams: [
    { id: 1, name: 'Red Hots', color: '#e23b4a', score: 120, chips: 1 },
    { id: 2, name: 'Blue Crew', color: '#2f6fe8', score: 80, chips: 0 },
    { id: 3, name: 'Greens', color: '#3dc24f', score: 40, chips: 2 },
  ],
  clocks: [{ id: 'answer', label: 'Answer', endsAt: null, remainingMs: 12_000 }],
  roster: [{ team: 1, nickname: 'Ana' }],
  playOrder: [2, 1, 3],
  ...over,
});

let stageChannel: StageHostChannel | null = null;
let services: AppServices;
let hubHandler: ReturnType<typeof vi.fn<(c: HostCommand) => CommandResult>>;

const setup = async (data: Partial<HubSnapshotData> = {}) => {
  const hub = new MemoryRoomHub();
  const stage = new MemoryRoomTransport({ hub });
  await stage.connect({ code: TEST_ROOM, role: 'stage' });
  stageChannel = createStageHostChannel({ transport: stage });
  hubHandler = vi.fn<(c: HostCommand) => CommandResult>(() => ({ applied: true }));
  stageChannel.onHubCommand(hubHandler);
  stageChannel.publishHub({ kind: 'hub', gameRev: 1, inputLocked: false, data: hubData(data) });
  services = {
    mode: 'demo',
    data: createDataLayer('demo'),
    createTransport: () => new MemoryRoomTransport({ hub }),
    audio: new AudioPlayer({ context: null }),
    version: 'test',
  };
  return { stage, hub };
};

const renderHost = () =>
  render(
    <AppServicesProvider value={services}>
      <HostView />
    </AppServicesProvider>,
  );

beforeEach(() => {
  FakeBroadcastChannel.reset();
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  window.history.replaceState(null, '', `/host?room=${TEST_ROOM}`);
  localStorage.clear();
});

afterEach(() => {
  stageChannel?.dispose();
  stageChannel = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.history.replaceState(null, '', '/');
});

describe('HostView', () => {
  it('signs in automatically in demo mode and renders the stage snapshot', async () => {
    await setup();
    renderHost();
    const scores = await screen.findByRole('table');
    expect(within(scores).getByText(/Red Hots/)).toBeInTheDocument();
    expect(within(scores).getByText('120')).toBeInTheDocument();
    expect(screen.getByText('feud:face-off')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Answer')).toBeInTheDocument();
    expect(screen.getByText('0:12')).toBeInTheDocument();
    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(screen.queryByText(/game page is hidden/i)).toBeNull();
    expect(screen.queryByText(/lost contact/i)).toBeNull();
  });

  it('sends a buzz command for team 3 when key 3 is pressed outside a text field', async () => {
    await setup();
    const user = userEvent.setup();
    renderHost();
    await screen.findByRole('table');
    await user.keyboard('3');
    await waitFor(() => {
      expect(hubHandler).toHaveBeenCalledWith(
        expect.objectContaining({ target: 'hub', name: 'buzz', teamId: 3 }),
      );
    });
    expect(await screen.findByText('buzz (team 3): done')).toBeInTheDocument();
  });

  it('does not buzz while the Settings dialog is open', async () => {
    await setup();
    const user = userEvent.setup();
    renderHost();
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const dialog = await screen.findByRole('dialog', { name: 'Settings' });
    expect(dialog).toBeInTheDocument();
    await user.keyboard('5');
    expect(hubHandler).not.toHaveBeenCalled();
  });

  it('sends pause and resume from the hub console and shows the paused state', async () => {
    await setup();
    const user = userEvent.setup();
    renderHost();
    await user.click(await screen.findByRole('button', { name: /stand by/i }));
    await waitFor(() => {
      expect(hubHandler).toHaveBeenCalledWith(expect.objectContaining({ name: 'pause', target: 'hub' }));
    });

    act(() => {
      stageChannel?.publishHub({
        kind: 'hub',
        gameRev: 2,
        inputLocked: true,
        data: hubData({ paused: true }),
      });
    });
    await user.click(await screen.findByRole('button', { name: /resume game/i }));
    await waitFor(() => {
      expect(hubHandler).toHaveBeenCalledWith(expect.objectContaining({ name: 'resume' }));
    });
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByText(/paused or showing a dialog/i)).toBeInTheDocument();
  });

  it('shows a red warning while the game page is hidden', async () => {
    await setup({ gameVisible: false });
    renderHost();
    expect(await screen.findByRole('alert')).toHaveTextContent(/game page is hidden/i);
  });

  it('shows the Lost contact banner after 6 s without the stage', async () => {
    await setup();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderHost();
    await screen.findByRole('table');
    stageChannel?.dispose();
    stageChannel = null;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/lost contact/i);
    // The last snapshot is still on screen under the banner.
    expect(screen.getByText(/Red Hots/)).toBeInTheDocument();
  });

  it('asks for the room code when the link has none, and rejects a malformed one', async () => {
    window.history.replaceState(null, '', '/host');
    await setup();
    const user = userEvent.setup();
    renderHost();
    const input = await screen.findByLabelText('Room code');
    await user.type(input, 'ab1');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/4 letters/);
    await user.clear(input);
    await user.type(input, 'dmkt');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(window.location.search).toBe('?room=DMKT');
  });

  it('returns to the sign-in form after Sign out in Settings', async () => {
    await setup();
    const user = userEvent.setup();
    renderHost();
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Host sign in' })).toBeInTheDocument();
  });

  it('renders the console registered for the active game', async () => {
    const { registerHostConsole } = await import('./consoleRegistry');
    const off = registerHostConsole('feud', ({ snapshot }) => <p>Feud console rev {snapshot.gameRev}</p>);
    await setup({ activeGame: 'feud' });
    stageChannel?.bridge.publishSnapshot({ kind: 'feud', gameRev: 4, inputLocked: false, data: {} });
    renderHost();
    expect(await screen.findByText('Feud console rev 4')).toBeInTheDocument();
    off();
  });
});
