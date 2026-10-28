import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HostDrawer } from './HostDrawer';
import { registerHostConsole } from './consoleRegistry';
import type { HostSnapshot } from './hostProtocol';
import type { HubSnapshotData } from './hubSnapshot';

const hubSnapshot = (over: Partial<HubSnapshotData> = {}): HostSnapshot => ({
  kind: 'hub',
  gameRev: 1,
  inputLocked: false,
  data: {
    phase: 'hub',
    paused: false,
    showMode: false,
    gameVisible: true,
    activeGame: null,
    roomCode: 'DMKT',
    teams: [{ id: 1, name: 'A', color: '#fff', score: 0, chips: 0 }],
    clocks: [],
    roster: [],
    playOrder: null,
    ...over,
  } satisfies HubSnapshotData,
});

describe('HostDrawer', () => {
  it('renders nothing when closed', () => {
    render(<HostDrawer open={false} onClose={() => undefined} snapshot={hubSnapshot()} send={vi.fn()} />);
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('opens on the Console tab, wired straight to the stage send function', async () => {
    const user = userEvent.setup();
    const send = vi.fn(() => ({ applied: true as const }));
    render(<HostDrawer open onClose={() => undefined} snapshot={hubSnapshot()} send={send} />);
    expect(screen.getByRole('complementary', { name: 'Host tools' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Console' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('button', { name: /stand by/i }));
    expect(send).toHaveBeenCalledWith({ target: 'hub', name: 'pause' });
    await user.click(screen.getByRole('button', { name: 'Buzz team 1' }));
    expect(send).toHaveBeenLastCalledWith({ target: 'hub', name: 'buzz', teamId: 1 });
  });

  it('switches to the Settings tab and shows the slot', async () => {
    const user = userEvent.setup();
    render(
      <HostDrawer
        open
        onClose={() => undefined}
        snapshot={hubSnapshot()}
        send={vi.fn()}
        settings={<p>Stage settings slot</p>}
      />,
    );
    await user.click(screen.getByRole('tab', { name: 'Settings' }));
    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Stage settings slot')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /stand by/i })).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'Console' }));
    expect(screen.getByRole('button', { name: /stand by/i })).toBeInTheDocument();
  });

  it('renders the console registered for the snapshot kind', () => {
    const off = registerHostConsole('wheel', ({ snapshot }) => <p>Wheel console {snapshot.gameRev}</p>);
    render(
      <HostDrawer
        open
        onClose={() => undefined}
        snapshot={{ kind: 'wheel', gameRev: 6, inputLocked: false, data: {} }}
        send={vi.fn()}
      />,
    );
    expect(screen.getByText('Wheel console 6')).toBeInTheDocument();
    off();
  });

  it('says so when no console is registered or no snapshot has arrived', () => {
    const { rerender } = render(
      <HostDrawer
        open
        onClose={() => undefined}
        snapshot={{ kind: 'plinko', gameRev: 1, inputLocked: false, data: {} }}
        send={vi.fn()}
      />,
    );
    expect(screen.getByText(/no host console for “plinko”/i)).toBeInTheDocument();
    rerender(<HostDrawer open onClose={() => undefined} snapshot={null} send={vi.fn()} />);
    expect(screen.getByText(/waiting for the stage/i)).toBeInTheDocument();
  });

  it('closes on the Close button and on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<HostDrawer open onClose={onClose} snapshot={hubSnapshot()} send={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('HubConsole', () => {
  it('two-tap quit: first tap arms, second sends quit-game', async () => {
    const user = userEvent.setup();
    const send = vi.fn(() => ({ applied: true as const }));
    render(
      <HostDrawer
        open
        onClose={() => undefined}
        snapshot={hubSnapshot({ activeGame: 'feud' })}
        send={send}
      />,
    );
    await user.click(screen.getByRole('button', { name: /quit game/i }));
    expect(send).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /tap again: abandon, no scores/i }));
    expect(send).toHaveBeenCalledWith({ target: 'hub', name: 'quit-game' });
  });

  it('disables Quit at the hub, offers Resume while paused and toggles show mode', async () => {
    const user = userEvent.setup();
    const send = vi.fn(() => ({ applied: true as const }));
    render(
      <HostDrawer open onClose={() => undefined} snapshot={hubSnapshot({ paused: true })} send={send} />,
    );
    expect(screen.getByRole('button', { name: /quit game/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /resume game/i }));
    expect(send).toHaveBeenCalledWith({ target: 'hub', name: 'resume' });
    await user.click(screen.getByRole('button', { name: /show mode: off/i }));
    expect(send).toHaveBeenLastCalledWith({ target: 'hub', name: 'show-mode', args: { on: true } });
  });

  it('only enables buzz buttons for teams that exist', () => {
    render(<HostDrawer open onClose={() => undefined} snapshot={hubSnapshot()} send={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Buzz team 1' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Buzz team 2' })).toBeDisabled();
  });
});
