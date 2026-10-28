import { describe, expect, it, vi } from 'vitest';
import type { HostCommand } from '@/host/hostProtocol';
import { handleHubCommand, LOCKED_REASON, type HubCommandContext } from './hubCommands';

const ctx = (patch: Partial<HubCommandContext> = {}): HubCommandContext => ({
  phase: 'hub',
  paused: false,
  showMode: false,
  locked: false,
  setPaused: vi.fn(),
  setShowMode: vi.fn(),
  quitGame: vi.fn(() => true),
  resetScores: vi.fn(() => true),
  buzz: vi.fn(() => 'delivered' as const),
  ...patch,
});

const cmd = (name: string, extra: Partial<HostCommand> = {}): HostCommand => ({
  cmdId: 'c1',
  target: 'hub',
  gameRev: 1,
  name,
  ...extra,
});

describe('handleHubCommand', () => {
  it('pauses and resumes, even while locked', () => {
    const c = ctx({ locked: true, paused: true });
    expect(handleHubCommand(cmd('resume'), c)).toEqual({ applied: true });
    expect(c.setPaused).toHaveBeenCalledWith(false);
    expect(handleHubCommand(cmd('pause'), c)).toEqual({ applied: true });
    expect(c.setPaused).toHaveBeenCalledWith(true);
  });

  it('sets show mode from args, or toggles it', () => {
    const c = ctx({ showMode: true });
    handleHubCommand(cmd('show-mode', { args: { on: true } }), c);
    expect(c.setShowMode).toHaveBeenLastCalledWith(true);
    handleHubCommand(cmd('show-mode'), c);
    expect(c.setShowMode).toHaveBeenLastCalledWith(false);
  });

  it('buzzes through the press path for the commanded team', () => {
    const c = ctx();
    expect(handleHubCommand(cmd('buzz', { teamId: 2 }), c)).toEqual({ applied: true });
    expect(c.buzz).toHaveBeenCalledWith(2);
    expect(handleHubCommand(cmd('buzz', { args: { team: 3 } }), c)).toEqual({ applied: true });
    expect(c.buzz).toHaveBeenLastCalledWith(3);
  });

  it('refuses a buzz without a team, while locked, for unknown teams and when rate limited', () => {
    expect(handleHubCommand(cmd('buzz'), ctx())).toMatchObject({ applied: false });
    expect(handleHubCommand(cmd('buzz', { teamId: 1 }), ctx({ locked: true }))).toEqual({
      applied: false,
      reason: LOCKED_REASON,
    });
    expect(handleHubCommand(cmd('buzz', { teamId: 1 }), ctx({ buzz: () => 'unknown-team' }))).toMatchObject({
      applied: false,
    });
    expect(handleHubCommand(cmd('buzz', { teamId: 1 }), ctx({ buzz: () => 'rate-limited' }))).toMatchObject({
      applied: false,
    });
  });

  it('quits a game or reports there is nothing to quit', () => {
    expect(handleHubCommand(cmd('quit-game'), ctx())).toEqual({ applied: true });
    expect(handleHubCommand(cmd('quit-game'), ctx({ quitGame: () => false }))).toMatchObject({
      applied: false,
    });
  });

  it('resets scores when allowed and rejects unknown commands', () => {
    expect(handleHubCommand(cmd('reset-scores'), ctx())).toEqual({ applied: true });
    expect(handleHubCommand(cmd('reset-scores'), ctx({ resetScores: () => false }))).toMatchObject({
      applied: false,
    });
    expect(handleHubCommand(cmd('explode'), ctx())).toEqual({ applied: false, reason: 'Unknown command' });
  });
});
