/** Rendering helpers for the Wheel UI tests: a WheelGame wired to the controller test doubles. */
import { render } from '@testing-library/react';
import type { AudioPlayer } from '@/audio/player';
import { seededRng } from '@/content/testUtils';
import type { Team } from '@/engines/event';
import { FakeAudio, FakeHost, FakePhones } from './controllerHarness';
import { WheelGame } from './WheelGame';
import type { WheelGameProps } from './WheelGame';

export const EVENT_TEAMS: Team[] = [
  { id: 1, name: 'Red', color: '#e63946', players: [], score: 0, chips: 0 },
  { id: 2, name: 'Blue', color: '#2a9df4', players: [], score: 0, chips: 0 },
  { id: 3, name: 'Green', color: '#2ecc71', players: [], score: 0, chips: 0 },
];

export interface GameRig {
  audio: FakeAudio;
  phones: FakePhones;
  host: FakeHost;
  props: WheelGameProps;
  ended: unknown[];
  changes: unknown[];
  quits: number[];
}

export function makeRig(extra: Partial<WheelGameProps> = {}): GameRig {
  const audio = new FakeAudio();
  const phones = new FakePhones();
  const host = new FakeHost();
  const ended: unknown[] = [];
  const changes: unknown[] = [];
  const quits: number[] = [];
  const props: WheelGameProps = {
    teams: EVENT_TEAMS,
    playOrder: null,
    usedContentIds: [],
    onContentUsed: () => undefined,
    inputLocked: false,
    showMode: false,
    onStateChange: (s) => changes.push(s),
    onGameEnd: (r) => ended.push(r),
    onQuitToHub: () => quits.push(1),
    audio: audio as unknown as AudioPlayer,
    phones,
    host: host.bridge,
    gameInstance: 1,
    rng: seededRng(11),
    ...extra,
  };
  return { audio, phones, host, props, ended, changes, quits };
}

export function renderWheel(extra: Partial<WheelGameProps> = {}) {
  const rig = makeRig(extra);
  const view = render(<WheelGame {...rig.props} />);
  return {
    ...rig,
    ...view,
    rerender: (patch: Partial<WheelGameProps>): void => {
      view.rerender(<WheelGame {...rig.props} {...patch} />);
    },
  };
}
