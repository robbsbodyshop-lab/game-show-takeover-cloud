import { describe, expect, it } from 'vitest';
import { createEventSession, defaultTeamEdits, type GamePhase } from '@/engines/event';
import { SNAPSHOT_KINDS } from '@/host/hostProtocol';
import { readHubData } from '@/host/hubSnapshot';
import { buildHubData } from './hubSnapshotData';

const dataFor = (phase: GamePhase) =>
  buildHubData({
    session: { ...createEventSession(defaultTeamEdits(2)), phase },
    paused: false,
    showMode: false,
    dialogOpen: false,
    roomCode: 'ABCD',
    status: 'connected',
    roster: [],
  });

describe('buildHubData activeGame', () => {
  it.each(['feud', 'wheel', 'puzzle', 'speed', 'plinko'] as const)(
    'names %s while it is on screen',
    (phase) => {
      const data = dataFor(phase);
      expect(data.activeGame).toBe(phase);
      // The host side reads back the same kind, and it is a kind the protocol knows.
      expect(readHubData(data).activeGame).toBe(phase);
      expect(SNAPSHOT_KINDS).toContain(phase);
    },
  );

  it.each(['setup', 'doors', 'hub', 'winner'] as const)('is null at %s', (phase) => {
    expect(dataFor(phase).activeGame).toBeNull();
    expect(readHubData(dataFor(phase)).activeGame).toBeNull();
  });
});
