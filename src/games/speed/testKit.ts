/** Shared fixtures for the event screen tests (speed, plinko, winner). Not imported by app code. */
import { vi } from 'vitest';
import { AudioPlayer } from '@/audio/player';
import {
  createEventSession,
  defaultTeamEdits,
  eventReducer,
  type EventAction,
  type EventSession,
} from '@/engines/event';

export const run = (state: EventSession, ...actions: EventAction[]): EventSession =>
  actions.reduce(eventReducer, state);

/** A session in the hub with `count` teams. */
export const hub = (count: number): EventSession => {
  const s = createEventSession(defaultTeamEdits(count));
  return run(s, { type: 'SET_PLAY_ORDER', order: s.teams.map((t) => t.id) }, { type: 'GO_HUB' });
};

export const speedSession = (count = 3): EventSession => run(hub(count), { type: 'START_SPEED' });

/** Plinko with the given chips per team (index 0 = team 1). */
export const plinkoSession = (chips: number[]): EventSession => {
  const base = hub(chips.length);
  const withChips = chips.reduce<EventSession>(
    (s, delta, i) => (delta > 0 ? run(s, { type: 'CHIP_CHANGE', team: i + 1, delta }) : s),
    base,
  );
  return run(withChips, { type: 'START_PLINKO' });
};

/** Winner screen with the given scores per team. */
export const winnerSession = (scores: number[]): EventSession => {
  const base = hub(scores.length);
  const scored = scores.reduce<EventSession>(
    (s, delta, i) => (delta > 0 ? run(s, { type: 'SCORE_CHANGE', team: i + 1, delta }) : s),
    base,
  );
  return run(scored, { type: 'ANNOUNCE_WINNER' });
};

/** A real player on a null context (silent) whose methods are spied, so calls can be asserted. */
export const spiedAudio = () => {
  const audio = new AudioPlayer({ context: null });
  return {
    audio,
    play: vi.spyOn(audio, 'play'),
    loop: vi.spyOn(audio, 'loop'),
    stopLoop: vi.spyOn(audio, 'stopLoop'),
    pauseAll: vi.spyOn(audio, 'pauseAll'),
    resumeAll: vi.spyOn(audio, 'resumeAll'),
  };
};

/** matchMedia stub so `useReducedMotion` reads `reduced`. */
export const stubReducedMotion = (reduced: boolean): void => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: reduced,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })),
  );
};
