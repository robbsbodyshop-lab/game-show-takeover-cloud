/** Shared harness for the phone tests: a seeded memory data layer, a hub, and a stage-role transport. */
import { render } from '@testing-library/react';
import { AudioPlayer } from '@/audio/player';
import { AppServicesProvider, type AppServices } from '@/app/AppContext';
import type { AppMode } from '@/app/env';
import type { DataLayer } from '@/data';
import {
  createMemoryAuthService,
  createMemoryBackend,
  createMemoryEventRepo,
  createMemoryRoomRepo,
  createMemorySettingsRepo,
  type MemoryBackend,
} from '@/data/repositories/memory';
import type { TeamSummary } from '@/data/types';
import { MemoryRoomHub, MemoryRoomTransport } from '@/realtime/MemoryRoomTransport';
import type { ParsedMessage } from '@/realtime/schemas';
import { PhoneApp } from './PhoneApp';

export const TEAMS: TeamSummary[] = [
  { id: 1, name: 'Reds', color: '#e23b4a' },
  { id: 2, name: 'Blues', color: '#2f6fe8' },
  { id: 3, name: 'Greens', color: '#3dc24f' },
];

export interface Harness {
  backend: MemoryBackend;
  data: DataLayer;
  hub: MemoryRoomHub;
  services: AppServices;
  /** Opens a room owned by a throwaway host and returns its code. */
  seedRoom: (teams: TeamSummary[]) => Promise<{ code: string; eventId: string }>;
  setTeams: (eventId: string, teams: TeamSummary[]) => void;
}

export function createHarness(mode: AppMode = 'supabase'): Harness {
  const backend = createMemoryBackend({ random: () => 0.5 });
  const data: DataLayer = {
    mode: 'demo',
    auth: createMemoryAuthService(backend),
    events: createMemoryEventRepo(backend),
    settings: createMemorySettingsRepo(backend),
    rooms: createMemoryRoomRepo(backend),
  };
  const hub = new MemoryRoomHub();
  const services: AppServices = {
    mode,
    data,
    createTransport: () => new MemoryRoomTransport({ hub }),
    audio: new AudioPlayer({ context: null }),
    version: 'test',
  };
  return {
    backend,
    data,
    hub,
    services,
    async seedRoom(teams) {
      await data.auth.signUp('host@example.com', 'correct horse');
      const event = await data.events.createEvent('Game night');
      await data.events.saveState(event.id, { teams }, 0);
      const code = await data.rooms.openRoom(event.id);
      await data.auth.signOut();
      return { code, eventId: event.id };
    },
    setTeams(eventId, teams) {
      const record = backend.states.get(eventId);
      if (record) record.state = { teams };
    },
  };
}

export const renderPhone = (harness: Harness, search = '') =>
  render(
    <AppServicesProvider value={harness.services}>
      <PhoneApp search={search} />
    </AppServicesProvider>,
  );

export interface StageHandle {
  transport: MemoryRoomTransport;
  /** Everything phones sent, in order. */
  phones: ParsedMessage<'phones'>[];
  controls: (c?: Partial<ControlsInput>) => Promise<void>;
  teams: (teams: TeamSummary[]) => Promise<void>;
  ack: (team: number, pressId: string, accepted: boolean) => Promise<void>;
  audience: () => Promise<void>;
}

export interface ControlsInput {
  activeTeam: number | null;
  canBuy: boolean;
  canSpin: boolean;
  canSolve: boolean;
  turnName: string;
  buzzTeams: number[];
  offLabel: string;
}

export async function connectStage(hub: MemoryRoomHub, code: string): Promise<StageHandle> {
  const transport = new MemoryRoomTransport({ hub });
  await transport.connect({ code, role: 'stage' });
  const phones: ParsedMessage<'phones'>[] = [];
  transport.subscribe('phones', (msg) => phones.push(msg));
  return {
    transport,
    phones,
    controls: (c = {}) =>
      transport.publish('stage', 'controls', {
        activeTeam: null,
        canBuy: false,
        canSpin: false,
        canSolve: false,
        turnName: '',
        ...c,
      }),
    teams: (teams) => transport.publish('stage', 'teams', { teams }),
    ack: (team, pressId, accepted) => transport.publish('stage', 'ack', { team, pressId, accepted }),
    audience: () => transport.publish('stage', 'audience', { phase: 'play', paused: false, scores: [] }),
  };
}
