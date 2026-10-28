import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppServicesProvider } from '@/app/AppContext';
import { loadCached, type AuthUser, type EventRecord } from '@/data';
import {
  createEventSession,
  defaultTeamEdits,
  eventReducer,
  parseSession,
  type EventAction,
  type EventSession,
} from '@/engines/event';
import { registerHostConsole, type HostConsoleProps } from '@/host/consoleRegistry';
import { MemoryRoomTransport, type ParsedMessage, type TeamsMessage } from '@/realtime';
import { EventStage } from './EventStage';
import type { GameProps } from './gameContract';
import { createTestServices, flushPromises, signUpHost, type TestServices } from './testKit';

vi.mock('qrcode', () => ({ toCanvas: vi.fn(() => Promise.resolve()) }));

let captured: GameProps | null = null;

const FakeGame = (props: GameProps) => {
  useEffect(() => {
    captured = props;
  });
  return (
    <div data-testid="fake-game" data-locked={props.inputLocked}>
      fake feud game
    </div>
  );
};

const Exploding = () => {
  throw new Error('boom');
};

const reduce = (s: EventSession, ...actions: EventAction[]): EventSession => actions.reduce(eventReducer, s);

const hubState = (teams = 2): EventSession => {
  const s = createEventSession(defaultTeamEdits(teams));
  return reduce(s, { type: 'SET_PLAY_ORDER', order: s.teams.map((t) => t.id) }, { type: 'GO_HUB' });
};

interface Rig {
  services: TestServices;
  user: AuthUser;
  event: EventRecord;
  onExit: ReturnType<typeof vi.fn>;
  onSignOut: ReturnType<typeof vi.fn>;
  mount: (props?: { signedOut?: boolean; games?: Record<string, React.ComponentType<GameProps>> }) => void;
}

/** Signs a host in, creates an event (optionally with a saved session) and returns a `mount` for the stage. */
async function rig(saved?: EventSession): Promise<Rig> {
  const services = createTestServices();
  const user = await signUpHost(services.data);
  const event = await services.data.events.createEvent('Friday night');
  if (saved) await services.data.events.saveState(event.id, saved, 0);
  const onExit = vi.fn();
  const onSignOut = vi.fn();
  const mount: Rig['mount'] = (props = {}) => {
    render(
      <AppServicesProvider value={services}>
        <EventStage
          eventId={event.id}
          user={user}
          signedOut={props.signedOut ?? false}
          draw={() => 0.5}
          now={() => 1_000}
          onExit={onExit}
          onSignOut={onSignOut}
          games={props.games ?? { feud: FakeGame }}
        />
      </AppServicesProvider>,
    );
  };
  return { services, user, event, onExit, onSignOut, mount };
}

/** The score shown in a scoreboard row (the first big number). */
const scoreOf = (row: HTMLElement): string => row.querySelectorAll('[data-size="md"]')[0]?.textContent ?? '';

const resume = async (u: ReturnType<typeof userEvent.setup>) => {
  await u.click(await screen.findByRole('button', { name: 'Resume' }));
};

const waitForRoom = async () => {
  await waitFor(() => {
    expect(screen.getByLabelText(/Room code/)).not.toHaveTextContent('----');
  });
};

describe('EventStage', () => {
  beforeEach(() => {
    captured = null;
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('opening an event', () => {
    it('starts a new event on the setup screen', async () => {
      const r = await rig();
      r.mount();
      expect(await screen.findByRole('button', { name: 'Start Game!' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();
    });

    it('offers Resume and Start a new event when the saved event has progress', async () => {
      const r = await rig(hubState());
      r.mount();
      expect(await screen.findByRole('button', { name: 'Resume' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Start a new event' })).toBeInTheDocument();
      expect(screen.getByText(/at the hub with 2 teams/)).toBeInTheDocument();
    });

    it('resumes at the saved screen', async () => {
      const r = await rig(hubState());
      r.mount();
      await resume(userEvent.setup());
      expect(await screen.findByRole('listbox', { name: 'Hub' })).toBeInTheDocument();
    });

    it('starts a new event with two taps, keeping the teams and clearing the scores', async () => {
      const scored = reduce(hubState(), { type: 'SCORE_CHANGE', team: 1, delta: 40 });
      const r = await rig(scored);
      r.mount();
      const u = userEvent.setup();
      await u.click(await screen.findByRole('button', { name: 'Start a new event' }));
      expect(screen.queryByRole('button', { name: 'Start Game!' })).toBeNull();
      await u.click(screen.getByRole('button', { name: 'Tap again: zero the scores' }));
      expect(await screen.findByRole('button', { name: 'Start Game!' })).toBeInTheDocument();
      expect(screen.getByLabelText('Team 1 name')).toHaveValue('Team 1');
      await waitFor(
        () => {
          const cached = loadCached(r.event.id);
          expect(parseSession(cached?.state)?.phase).toBe('setup');
        },
        { timeout: 2000 },
      );
      expect(parseSession(loadCached(r.event.id)?.state)?.teams.map((t) => t.score)).toEqual([0, 0]);
    });

    it('shows a finished event read-only with its winner and scores', async () => {
      const done = reduce(
        hubState(),
        { type: 'SCORE_CHANGE', team: 2, delta: 90 },
        { type: 'ANNOUNCE_WINNER' },
      );
      const r = await rig(done);
      await r.services.data.events.finishEvent(r.event.id);
      r.mount();
      expect(await screen.findByText('Winner: Team 2')).toBeInTheDocument();
      expect(screen.getByRole('list', { name: 'Final standings' })).toHaveTextContent('90 points');
      expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();
      await userEvent.setup().click(screen.getByRole('button', { name: 'Back to my events' }));
      expect(r.onExit).toHaveBeenCalled();
    });

    it('says so when the event does not exist', async () => {
      const r = await rig();
      await r.services.data.events.deleteEvent(r.event.id);
      r.mount();
      expect(await screen.findByRole('alert')).toHaveTextContent('does not exist');
    });

    it('prefers a newer unsynced browser copy and saves it to the cloud', async () => {
      const r = await rig(hubState());
      const newer = reduce(hubState(), { type: 'SCORE_CHANGE', team: 1, delta: 70 });
      localStorage.setItem(
        `gst:cache:${r.event.id}`,
        JSON.stringify({ rev: 1, state: newer, savedAt: new Date().toISOString(), synced: false }),
      );
      r.mount();
      await resume(userEvent.setup());
      await screen.findByRole('listbox', { name: 'Hub' });
      expect(
        scoreOf(within(screen.getByTestId('scoreboard')).getByRole('listitem', { name: 'Team 1' })),
      ).toBe('70');
      await waitFor(
        async () => {
          const record = await r.services.data.events.loadState(r.event.id);
          expect(parseSession(record?.state)?.teams[0]?.score).toBe(70);
        },
        { timeout: 3000 },
      );
    });
  });

  describe('flow through the phases', () => {
    it('goes setup -> hub -> a game and back, saving as it goes', async () => {
      const r = await rig();
      r.mount();
      const u = userEvent.setup();
      await u.click(await screen.findByRole('button', { name: 'Start Game!' }));
      expect(await screen.findByRole('listbox', { name: 'Hub' })).toBeInTheDocument();
      await u.click(screen.getByRole('option', { name: /Family Feud/ }));
      expect(await screen.findByTestId('fake-game')).toBeInTheDocument();
      expect(captured).toMatchObject({
        gameInstance: 0,
        playOrder: null,
        inputLocked: false,
        showMode: false,
      });
      expect(captured?.teams.map((t) => t.name)).toEqual(['Team 1', 'Team 2']);
      expect(captured?.phones).toBeDefined();
      expect(captured?.host).toBeDefined();
      act(() => {
        captured?.onQuitToHub();
      });
      expect(await screen.findByRole('listbox', { name: 'Hub' })).toBeInTheDocument();
      await waitFor(
        async () => {
          const record = await r.services.data.events.loadState(r.event.id);
          expect(parseSession(record?.state)?.phase).toBe('hub');
        },
        { timeout: 3000 },
      );
    });

    it('shows a stub with the phase name and a way back where a screen is not wired', async () => {
      const r = await rig(hubState());
      r.mount({ games: {} });
      const u = userEvent.setup();
      await resume(u);
      await u.click(await screen.findByRole('option', { name: /Wheel of Fortune/ }));
      expect(screen.getByRole('heading', { name: 'wheel' })).toBeInTheDocument();
      await u.click(
        within(screen.getByRole('region', { name: 'wheel screen' })).getByRole('button', {
          name: 'Back to hub',
        }),
      );
      expect(await screen.findByRole('listbox', { name: 'Hub' })).toBeInTheDocument();
      await u.click(screen.getByRole('option', { name: /Speed Round/ }));
      expect(screen.getByRole('heading', { name: 'Speed Round' })).toBeInTheDocument();
      await u.click(
        within(screen.getByRole('region', { name: 'Speed Round screen' })).getByRole('button', {
          name: 'Back to hub',
        }),
      );
      expect(await screen.findByRole('listbox', { name: 'Hub' })).toBeInTheDocument();
    });

    it('runs the door game for three teams before the hub', async () => {
      const r = await rig();
      r.mount();
      const u = userEvent.setup();
      await u.click(await screen.findByRole('button', { name: 'Add a team' }));
      await u.click(screen.getByRole('button', { name: 'Start Game!' }));
      expect(await screen.findByRole('heading', { name: 'Pick a door' })).toBeInTheDocument();
      for (const door of [1, 2, 3])
        await u.click(screen.getByRole('button', { name: `Door ${String(door)}` }));
      await u.click(screen.getByRole('button', { name: 'Open the doors!' }));
      await u.click(screen.getByRole('button', { name: 'Continue to the hub' }));
      expect(await screen.findByRole('listbox', { name: 'Hub' })).toBeInTheDocument();
    });

    it('moves between bracket matches without a game component, then back to the hub', async () => {
      let s = hubState(3);
      s = reduce(s, { type: 'START_GAME', kind: 'feud', instanceSeed: 1 });
      s = reduce(s, { type: 'GAME_WON', winnerId: 2, roundScore: 100 });
      expect(s.phase).toBe('feud');
      expect(s.game).toBeNull();
      const r = await rig(s);
      r.mount();
      const u = userEvent.setup();
      await resume(u);
      expect(await screen.findByRole('heading', { name: 'Family Feud bracket' })).toBeInTheDocument();
      await u.click(screen.getByRole('button', { name: /^Start Team 1 vs Team 2$/ }));
      expect(await screen.findByTestId('fake-game')).toBeInTheDocument();
    });
  });

  describe('the running game', () => {
    const startFeud = async () => {
      const r = await rig(hubState());
      r.mount();
      const u = userEvent.setup();
      await resume(u);
      await u.click(await screen.findByRole('option', { name: /Family Feud/ }));
      await screen.findByTestId('fake-game');
      return { r, u };
    };

    it('hands a saved engine snapshot to the game once, as initialState', async () => {
      const running = reduce(
        hubState(),
        { type: 'START_GAME', kind: 'feud', instanceSeed: 7 },
        {
          type: 'GAME_STATE',
          state: { round: 3 },
        },
      );
      const r = await rig(running);
      r.mount();
      await resume(userEvent.setup());
      await screen.findByTestId('fake-game');
      expect(captured?.initialState).toEqual({ round: 3 });
    });

    it('persists game state, used content and the result (GAME_STATE, CONTENT_USED, GAME_WON)', async () => {
      const { r } = await startFeud();
      act(() => {
        captured?.onStateChange({ round: 2 });
        captured?.onContentUsed(['q1', 'q2']);
      });
      let cached = parseSession(loadCached(r.event.id)?.state);
      expect(cached?.game?.state).toEqual({ round: 2 });
      expect(cached?.usedContentIds).toEqual(['q1', 'q2']);

      act(() => {
        captured?.onGameEnd({
          winnerId: 1,
          roundScore: 120,
          extraScores: [{ team: 2, points: 30 }],
          bonusChips: 1,
        });
      });
      expect(await screen.findByRole('listbox', { name: 'Hub' })).toBeInTheDocument();
      cached = parseSession(loadCached(r.event.id)?.state);
      expect(cached?.teams.map((t) => [t.score, t.chips])).toEqual([
        [120, 2],
        [30, 0],
      ]);
      expect(cached?.completedGames).toEqual(['feud']);
    });

    it('credits a game result exactly once even if the game reports it twice', async () => {
      const { r } = await startFeud();
      const report = { winnerId: 2, roundScore: 50 };
      act(() => {
        captured?.onGameEnd(report);
      });
      const first = captured;
      act(() => {
        first?.onGameEnd(report); // a stale report: the instance moved on
      });
      await screen.findByRole('listbox', { name: 'Hub' });
      const cached = parseSession(loadCached(r.event.id)?.state);
      expect(cached?.teams[1]?.score).toBe(50);
      expect(cached?.teams[1]?.chips).toBe(1);
    });

    it('freezes inputLocked while paused (F8), swallows Enter and Space, and resumes with F8 or Escape', async () => {
      await startFeud();
      expect(captured?.inputLocked).toBe(false);
      fireEvent.keyDown(window, { key: 'F8' });
      expect(await screen.findByTestId('pause-card')).toBeInTheDocument();
      await waitFor(() => {
        expect(captured?.inputLocked).toBe(true);
      });

      const gameKeys = vi.fn();
      window.addEventListener('keydown', gameKeys);
      const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      window.dispatchEvent(enter);
      window.dispatchEvent(space);
      window.removeEventListener('keydown', gameKeys);
      expect(enter.defaultPrevented).toBe(true);
      expect(space.defaultPrevented).toBe(true);
      expect(gameKeys).not.toHaveBeenCalled();
      expect(screen.getByTestId('pause-card')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'Escape' });
      await waitFor(() => {
        expect(captured?.inputLocked).toBe(false);
      });
      expect(screen.queryByTestId('pause-card')).toBeNull();

      fireEvent.keyDown(window, { key: 'F8' });
      await waitFor(() => {
        expect(captured?.inputLocked).toBe(true);
      });
      fireEvent.keyDown(window, { key: 'F8' });
      await waitFor(() => {
        expect(captured?.inputLocked).toBe(false);
      });
    });

    it('pauses with the sidebar button and resumes with the card button', async () => {
      const { u } = await startFeud();
      await u.click(screen.getByRole('button', { name: 'Pause' }));
      expect(await screen.findByTestId('pause-card')).toBeInTheDocument();
      await u.click(within(screen.getByTestId('pause-card')).getByRole('button', { name: 'Resume' }));
      expect(screen.queryByTestId('pause-card')).toBeNull();
      expect(captured?.inputLocked).toBe(false);
    });

    it('locks input while a dialog is open', async () => {
      const { u } = await startFeud();
      await u.click(screen.getByRole('button', { name: 'Settings' }));
      expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
      await waitFor(() => {
        expect(captured?.inputLocked).toBe(true);
      });
      await u.click(screen.getByRole('button', { name: 'Close' }));
      await waitFor(() => {
        expect(captured?.inputLocked).toBe(false);
      });
    });

    it('abandons a game only on the second tap', async () => {
      const { u } = await startFeud();
      await u.click(screen.getByRole('button', { name: 'Abandon game, back to hub' }));
      expect(screen.getByTestId('fake-game')).toBeInTheDocument();
      await u.click(screen.getByRole('button', { name: 'Tap again: abandon, no scores' }));
      expect(await screen.findByRole('listbox', { name: 'Hub' })).toBeInTheDocument();
    });

    it('turns keyboard digits into buzzes through the phone bridge, honouring the lock', async () => {
      await startFeud();
      const presses: number[] = [];
      act(() => {
        captured?.phones.onPress((p) => presses.push(p.team));
      });
      fireEvent.keyDown(window, { key: '2' });
      expect(presses).toEqual([2]);
      fireEvent.keyDown(window, { key: '7' });
      expect(presses).toEqual([2]); // no team 7
      fireEvent.keyDown(window, { key: '1', repeat: true });
      expect(presses).toEqual([2]);
      fireEvent.keyDown(window, { key: 'F8' });
      await waitFor(() => {
        expect(captured?.inputLocked).toBe(true);
      });
      fireEvent.keyDown(window, { key: '1' });
      expect(presses).toEqual([2]);
    });

    it('delivers a phone press to the game, and refuses it while paused', async () => {
      const { r } = await startFeud();
      await waitForRoom();
      const code = await r.services.data.rooms.openRoom(r.event.id);
      const phone = new MemoryRoomTransport({ hub: r.services.hub });
      await phone.connect({ code, role: 'phone', team: 1 });
      const presses: string[] = [];
      act(() => {
        captured?.phones.onPress((p) => presses.push(p.pressId));
      });
      await phone.publish('phones', 'press', { pressId: 'p1', team: 1, at: 1 });
      await waitFor(() => {
        expect(presses).toEqual(['p1']);
      });
      fireEvent.keyDown(window, { key: 'F8' });
      await waitFor(() => {
        expect(captured?.inputLocked).toBe(true);
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      await phone.publish('phones', 'press', { pressId: 'p2', team: 1, at: 2 });
      await flushPromises();
      expect(presses).toEqual(['p1']);
    });

    it('recovers from a crash in the game with a way back to the hub', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const r = await rig(hubState());
      r.mount({ games: { feud: Exploding } });
      const u = userEvent.setup();
      await resume(u);
      await u.click(await screen.findByRole('option', { name: /Family Feud/ }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
      await u.click(screen.getByRole('button', { name: 'Back to hub' }));
      expect(await screen.findByRole('listbox', { name: 'Hub' })).toBeInTheDocument();
    });
  });

  describe('show mode and the scoreboard', () => {
    const atHub = async () => {
      const r = await rig(hubState());
      r.mount();
      const u = userEvent.setup();
      await resume(u);
      await screen.findByRole('listbox', { name: 'Hub' });
      return { r, u };
    };

    it('shows the scoreboard with teams, scores, chips and the room code', async () => {
      await atHub();
      const board = screen.getByTestId('scoreboard');
      expect(within(board).getByText('Team 1')).toBeInTheDocument();
      expect(within(board).getByText('Team 2')).toBeInTheDocument();
      expect(within(board).getAllByText(/Chips 0/)).toHaveLength(2);
      await waitFor(() => {
        expect(within(board).getByLabelText('Room code')).toHaveTextContent(/^[A-Z]{4}$/);
      });
    });

    it('adds and subtracts score and chips, never below zero', async () => {
      const { u } = await atHub();
      const row = within(screen.getByTestId('scoreboard')).getByRole('listitem', { name: 'Team 1' });
      await u.click(within(row).getByRole('button', { name: 'Team 1 score plus 10' }));
      await u.click(within(row).getByRole('button', { name: 'Team 1 score plus 10' }));
      expect(scoreOf(row)).toBe('20');
      await u.click(within(row).getByRole('button', { name: 'Team 1 score minus 10' }));
      expect(scoreOf(row)).toBe('10');
      await u.click(within(row).getByRole('button', { name: 'Team 1 chips plus 1' }));
      expect(row).toHaveTextContent('Chips 1');
      await u.click(within(row).getByRole('button', { name: 'Team 1 chips minus 1' }));
      await u.click(within(row).getByRole('button', { name: 'Team 1 chips minus 1' }));
      expect(row).toHaveTextContent('Chips 0');
      await u.click(within(row).getByRole('button', { name: 'Team 1 score minus 10' }));
      await u.click(within(row).getByRole('button', { name: 'Team 1 score minus 10' }));
      expect(scoreOf(row)).toBe('0');
    });

    it('toggles show mode with F9: hides the sidebar, is remembered, and comes back', async () => {
      await atHub();
      expect(screen.getByTestId('scoreboard')).toBeInTheDocument();
      fireEvent.keyDown(window, { key: 'F9' });
      await waitFor(() => {
        expect(screen.queryByTestId('scoreboard')).toBeNull();
      });
      expect(localStorage.getItem('gst:showMode')).toBe('1');
      expect(screen.getByTestId('stage-root')).toHaveAttribute('data-show-mode', 'true');
      fireEvent.keyDown(window, { key: 'F9' });
      expect(await screen.findByTestId('scoreboard')).toBeInTheDocument();
      expect(localStorage.getItem('gst:showMode')).toBe('0');
    });

    it('starts in show mode when it was left on, and tells the game', async () => {
      localStorage.setItem('gst:showMode', '1');
      const r = await rig(hubState());
      r.mount();
      const u = userEvent.setup();
      await resume(u);
      await u.click(await screen.findByRole('option', { name: /Family Feud/ }));
      await screen.findByTestId('fake-game');
      expect(screen.queryByTestId('scoreboard')).toBeNull();
      expect(captured?.showMode).toBe(true);
    });

    it('hides the pause card button in show mode', async () => {
      localStorage.setItem('gst:showMode', '1');
      const r = await rig(hubState());
      r.mount();
      await resume(userEvent.setup());
      await screen.findByRole('listbox', { name: 'Hub' });
      fireEvent.keyDown(window, { key: 'F8' });
      const card = await screen.findByTestId('pause-card');
      expect(within(card).queryByRole('button')).toBeNull();
    });

    it('F2 toggles the host drawer flag', async () => {
      await atHub();
      const root = screen.getByTestId('stage-root');
      expect(root).toHaveAttribute('data-host-drawer', 'false');
      fireEvent.keyDown(window, { key: 'F2' });
      await waitFor(() => {
        expect(root).toHaveAttribute('data-host-drawer', 'true');
      });
      fireEvent.keyDown(window, { key: 'F2' });
      await waitFor(() => {
        expect(root).toHaveAttribute('data-host-drawer', 'false');
      });
    });

    it('plays the hub loop only on the hub, and only with music on', async () => {
      const r = await rig(hubState());
      const loop = vi.spyOn(r.services.audio, 'loop');
      const stopLoop = vi.spyOn(r.services.audio, 'stopLoop');
      r.mount();
      const u = userEvent.setup();
      await resume(u);
      await screen.findByRole('listbox', { name: 'Hub' });
      expect(loop).toHaveBeenCalledWith('hub_theme');
      await u.click(screen.getByRole('button', { name: 'Music on' }));
      expect(stopLoop).toHaveBeenCalledWith('hub_theme');
      expect(localStorage.getItem('gst:musicOn')).toBe('0');
    });

    it('holds all audio while paused and releases it on resume', async () => {
      const r = await rig(hubState());
      const pauseAll = vi.spyOn(r.services.audio, 'pauseAll');
      const resumeAll = vi.spyOn(r.services.audio, 'resumeAll');
      r.mount();
      await resume(userEvent.setup());
      await screen.findByRole('listbox', { name: 'Hub' });
      fireEvent.keyDown(window, { key: 'F8' });
      await waitFor(() => {
        expect(pauseAll).toHaveBeenCalled();
      });
      fireEvent.keyDown(window, { key: 'F8' });
      await waitFor(() => {
        expect(resumeAll).toHaveBeenCalled();
      });
    });
  });

  describe('dialogs', () => {
    it('edits teams from the hub, keeping scores, and tells the phones', async () => {
      const scored = reduce(hubState(), { type: 'SCORE_CHANGE', team: 1, delta: 30 });
      const r = await rig(scored);
      const code = await r.services.data.rooms.openRoom(r.event.id);
      const phone = new MemoryRoomTransport({ hub: r.services.hub });
      const teamMessages: TeamsMessage[] = [];
      phone.subscribe('stage', (m: ParsedMessage<'stage'>) => {
        if (m.event === 'teams') teamMessages.push(m.message);
      });
      await phone.connect({ code, role: 'phone', team: 1 });
      r.mount();
      const u = userEvent.setup();
      await resume(u);
      await screen.findByRole('listbox', { name: 'Hub' });
      await waitFor(() => {
        expect(teamMessages.length).toBeGreaterThan(0);
      });

      await u.click(screen.getByRole('option', { name: /Edit Teams/ }));
      const dialog = screen.getByRole('dialog', { name: 'Edit teams' });
      const name = within(dialog).getByLabelText('Team 1 name');
      await u.clear(name);
      await u.type(name, 'Reds');
      await u.click(within(dialog).getByRole('button', { name: 'Save teams' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      const row = within(screen.getByTestId('scoreboard')).getByRole('listitem', { name: 'Reds' });
      expect(scoreOf(row)).toBe('30');
      await waitFor(() => {
        expect(teamMessages.at(-1)?.teams.map((t) => t.name)).toEqual(['Reds', 'Team 2']);
      });
    });

    it('refuses to save teams with a duplicate name in the dialog', async () => {
      const r = await rig(hubState());
      r.mount();
      const u = userEvent.setup();
      await resume(u);
      await u.click(await screen.findByRole('option', { name: /Edit Teams/ }));
      const dialog = screen.getByRole('dialog', { name: 'Edit teams' });
      const name = within(dialog).getByLabelText('Team 2 name');
      await u.clear(name);
      await u.type(name, 'Team 1');
      expect(within(dialog).getByRole('button', { name: 'Save teams' })).toBeDisabled();
      expect(within(dialog).getByRole('alert')).toHaveTextContent('already has this name');
    });

    it('settings: sets CRT curve on the document, saves volume, and resets scores only on the second tap', async () => {
      const scored = reduce(hubState(), { type: 'SCORE_CHANGE', team: 1, delta: 30 });
      const r = await rig(scored);
      r.mount();
      const u = userEvent.setup();
      await resume(u);
      await u.click(await screen.findByRole('option', { name: /Settings/ }));
      const dialog = screen.getByRole('dialog', { name: 'Settings' });

      await u.click(within(dialog).getByRole('button', { name: 'CRT curve: off' }));
      expect(document.documentElement.dataset.crt).toBe('on');
      await u.click(within(dialog).getByRole('button', { name: 'Verbose logging: off' }));
      expect(localStorage.getItem('gst:debug')).toBe('1');
      fireEvent.change(within(dialog).getByLabelText('Volume'), { target: { value: '40' } });
      expect(localStorage.getItem('gst:volume')).toBe('0.4');

      await u.click(within(dialog).getByRole('button', { name: 'Reset scores & chips' }));
      const team1 = () => within(screen.getByTestId('scoreboard')).getByRole('listitem', { name: 'Team 1' });
      expect(scoreOf(team1())).toBe('30');
      await u.click(within(dialog).getByRole('button', { name: 'Tap again: zero all scores and chips' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(scoreOf(team1())).toBe('0');
    });

    it('leaving from the winner screen closes the event as finished', async () => {
      const winner = reduce(
        hubState(),
        { type: 'SCORE_CHANGE', team: 1, delta: 10 },
        { type: 'ANNOUNCE_WINNER' },
      );
      const r = await rig(winner);
      r.mount({ games: {} });
      const u = userEvent.setup();
      await resume(u);
      await screen.findByRole('heading', { name: 'Announce the Winner' });
      await u.click(screen.getByRole('button', { name: 'Settings' }));
      await u.click(screen.getByRole('button', { name: 'Back to my events' }));
      await waitFor(() => {
        expect(r.onExit).toHaveBeenCalledTimes(1);
      });
      const events = await r.services.data.events.listEvents();
      expect(events[0]?.status).toBe('finished');
    });

    it('leaving from the hub keeps the event open', async () => {
      const r = await rig(hubState());
      r.mount();
      const u = userEvent.setup();
      await resume(u);
      await u.click(await screen.findByRole('option', { name: /Settings/ }));
      await u.click(screen.getByRole('button', { name: 'Back to my events' }));
      expect(r.onExit).toHaveBeenCalledTimes(1);
      const events = await r.services.data.events.listEvents();
      expect(events[0]?.status).toBe('setup');
    });

    it('leaves from the setup screen without finishing', async () => {
      const r = await rig();
      r.mount();
      const u = userEvent.setup();
      await u.click(await screen.findByRole('button', { name: 'Back to my events' }));
      expect(r.onExit).toHaveBeenCalledTimes(1);
    });

    it('credits opens from the hub', async () => {
      const r = await rig(hubState());
      r.mount();
      const u = userEvent.setup();
      await resume(u);
      await u.click(await screen.findByRole('option', { name: /Credits/ }));
      expect(screen.getByRole('dialog', { name: 'Credits' })).toHaveTextContent('Game Show Takeover test');
      await u.click(screen.getByRole('button', { name: 'Close' }));
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  describe('the room and the host view', () => {
    it('publishes the hub snapshot to a host view, and keeps republishing it', async () => {
      const r = await rig(hubState());
      const code = await r.services.data.rooms.openRoom(r.event.id);
      const host = new MemoryRoomTransport({ hub: r.services.hub });
      const snapshots: { kind: string; data: unknown; inputLocked: boolean }[] = [];
      host.subscribe('host', (m) => {
        if (m.event === 'snapshot') snapshots.push(m.message);
      });
      await host.connect({ code, role: 'host', key: 'host-1' });
      r.mount();
      await resume(userEvent.setup());
      await screen.findByRole('listbox', { name: 'Hub' });
      await waitFor(() => {
        expect(snapshots.some((s) => s.kind === 'hub')).toBe(true);
      });
      const latest = snapshots.filter((s) => s.kind === 'hub').at(-1);
      expect(latest?.data).toMatchObject({
        phase: 'hub',
        paused: false,
        showMode: false,
        gameVisible: true,
        activeGame: null,
        playOrder: [1, 2],
        teams: [
          { id: 1, name: 'Team 1', score: 0, chips: 0 },
          { id: 2, name: 'Team 2', score: 0, chips: 0 },
        ],
      });
      await waitFor(() => {
        expect(latest?.data).toMatchObject({ roomCode: code });
      });
      const before = snapshots.length;
      await waitFor(
        () => {
          expect(snapshots.length).toBeGreaterThan(before);
        },
        { timeout: 3500 },
      );
    }, 10_000);

    it('answers hub commands from a host view: pause, resume, buzz, show-mode, quit-game', async () => {
      const r = await rig(hubState());
      const code = await r.services.data.rooms.openRoom(r.event.id);
      const host = new MemoryRoomTransport({ hub: r.services.hub });
      const results: { cmdId: string; applied: boolean; reason?: string }[] = [];
      host.subscribe('host', (m) => {
        if (m.event === 'result') results.push(m.message);
      });
      await host.connect({ code, role: 'host', key: 'host-1' });
      r.mount();
      const u = userEvent.setup();
      await resume(u);
      await u.click(await screen.findByRole('option', { name: /Family Feud/ }));
      await screen.findByTestId('fake-game');
      await waitFor(() => {
        expect(host.status).toBe('connected');
      });
      const send = async (cmdId: string, name: string, extra: Record<string, unknown> = {}) => {
        await host.publish('host', 'command', { cmdId, target: 'hub', gameRev: 0, name, ...extra });
        await waitFor(() => {
          expect(results.some((x) => x.cmdId === cmdId)).toBe(true);
        });
        return results.find((x) => x.cmdId === cmdId);
      };

      expect(await send('c1', 'pause')).toMatchObject({ applied: true });
      await waitFor(() => {
        expect(captured?.inputLocked).toBe(true);
      });
      // While paused a buzz is refused and a game command never reaches the game.
      expect(await send('c2', 'buzz', { teamId: 1 })).toMatchObject({ applied: false });
      expect(await send('c3', 'resume')).toMatchObject({ applied: true });
      await waitFor(() => {
        expect(captured?.inputLocked).toBe(false);
      });

      const presses: number[] = [];
      act(() => {
        captured?.phones.onPress((p) => presses.push(p.team));
      });
      expect(await send('c4', 'buzz', { teamId: 2 })).toMatchObject({ applied: true });
      expect(presses).toEqual([2]);

      expect(await send('c5', 'show-mode', { args: { on: true } })).toMatchObject({ applied: true });
      await waitFor(() => {
        expect(screen.queryByTestId('scoreboard')).toBeNull();
      });

      expect(await send('c6', 'quit-game')).toMatchObject({ applied: true });
      expect(await screen.findByRole('listbox', { name: 'Hub' })).toBeInTheDocument();
      expect(await send('c7', 'quit-game')).toMatchObject({ applied: false });
    }, 15_000);

    it('refuses game commands while paused, through the host bridge a game holds', async () => {
      const r = await rig(hubState());
      const code = await r.services.data.rooms.openRoom(r.event.id);
      const host = new MemoryRoomTransport({ hub: r.services.hub });
      const results: { cmdId: string; applied: boolean; reason?: string }[] = [];
      host.subscribe('host', (m) => {
        if (m.event === 'result') results.push(m.message);
      });
      await host.connect({ code, role: 'host', key: 'host-1' });
      r.mount();
      const u = userEvent.setup();
      await resume(u);
      await u.click(await screen.findByRole('option', { name: /Family Feud/ }));
      await screen.findByTestId('fake-game');
      await waitFor(() => {
        expect(host.status).toBe('connected');
      });
      const handler = vi.fn(() => ({ applied: true as const }));
      act(() => {
        captured?.host.onCommand('feud', handler);
      });
      const send = async (cmdId: string, name: string) => {
        await host.publish('host', 'command', { cmdId, target: 'feud', gameRev: 0, name });
        await waitFor(() => {
          expect(results.some((x) => x.cmdId === cmdId)).toBe(true);
        });
        return results.find((x) => x.cmdId === cmdId);
      };

      expect(await send('g1', 'reveal')).toMatchObject({ applied: true });
      expect(handler).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(window, { key: 'F8' });
      await waitFor(() => {
        expect(captured?.inputLocked).toBe(true);
      });
      expect(await send('g2', 'reveal-all')).toMatchObject({ applied: false });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('tells phones the buzzers are off outside a game, and again after a game ends', async () => {
      const r = await rig(hubState());
      const code = await r.services.data.rooms.openRoom(r.event.id);
      const phone = new MemoryRoomTransport({ hub: r.services.hub });
      const labels: (string | undefined)[] = [];
      phone.subscribe('stage', (m) => {
        if (m.event === 'controls') labels.push(m.message.offLabel);
      });
      await phone.connect({ code, role: 'phone', team: 1 });
      r.mount();
      const u = userEvent.setup();
      await resume(u);
      await waitFor(() => {
        expect(labels).toContain('Buzzers are off');
      });
      await u.click(await screen.findByRole('option', { name: /Family Feud/ }));
      await screen.findByTestId('fake-game');
      await new Promise((resolve) => setTimeout(resolve, 150));
      const before = labels.length;
      act(() => {
        captured?.phones.publishControls({
          activeTeam: 1,
          canBuy: false,
          canSpin: false,
          canSolve: false,
          turnName: 'Team 1',
          buzzTeams: [1, 2],
        });
      });
      await waitFor(() => {
        expect(labels).toHaveLength(before + 1);
      });
      expect(labels.at(-1)).toBeUndefined(); // the game's own controls have no off label
      act(() => {
        captured?.onQuitToHub();
      });
      await waitFor(() => {
        expect(labels).toHaveLength(before + 2);
      });
      expect(labels.at(-1)).toBe('Buzzers are off');
    });

    it('opens the room on mount and reports connection trouble without stopping the show', async () => {
      const r = await rig(hubState());
      vi.spyOn(r.services.data.rooms, 'openRoom').mockRejectedValue(new Error('offline'));
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      r.mount();
      const u = userEvent.setup();
      await resume(u);
      await u.click(await screen.findByRole('option', { name: /Family Feud/ }));
      expect(await screen.findByTestId('fake-game')).toBeInTheDocument();
      act(() => {
        captured?.phones.onPress(() => undefined);
      });
      expect(screen.getByLabelText('Room code')).toHaveTextContent('----');
    });
  });

  describe('director lease', () => {
    it('turns read-only with a banner when another stage saved first', async () => {
      const r = await rig(hubState());
      r.mount();
      const u = userEvent.setup();
      await resume(u);
      await screen.findByRole('listbox', { name: 'Hub' });
      await waitFor(() => {
        expect(r.services.transports[0]?.status).toBe('connected');
      });

      // Another stage saves the event.
      const record = await r.services.data.events.loadState(r.event.id);
      await r.services.data.events.saveState(r.event.id, hubState(), record?.rev ?? 0);

      const row = within(screen.getByTestId('scoreboard')).getByRole('listitem', { name: 'Team 1' });
      await u.click(within(row).getByRole('button', { name: 'Team 1 score plus 10' }));
      expect(scoreOf(row)).toBe('10');

      expect(
        await screen.findByText(/Another stage is running this event/, undefined, { timeout: 4000 }),
      ).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('read-only');

      // Read-only: later changes are ignored and the room is released to the other stage.
      await u.click(within(row).getByRole('button', { name: 'Team 1 score plus 10' }));
      expect(scoreOf(row)).toBe('10');
      await waitFor(() => {
        expect(r.services.transports.at(-1)?.status).toBe('offline');
      });
      expect(screen.getByRole('button', { name: 'Reload this event' })).toBeInTheDocument();
    }, 10_000);

    it('is read-only within seconds when another stage already holds the lease, without a save', async () => {
      const r = await rig(hubState());
      await r.services.data.events.claimDirector(r.event.id, 'other-stage-tab');
      r.mount();
      const u = userEvent.setup();
      await resume(u);

      expect(await screen.findByText(/Another stage is running this event/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reload this event' })).toBeInTheDocument();

      // The room is not opened and nothing connects as the stage.
      expect(screen.getByLabelText('Room code')).toHaveTextContent('----');
      expect(r.services.transports.every((t) => t.status === 'offline')).toBe(true);

      // Changes are ignored and never written over the director's copy.
      const row = within(screen.getByTestId('scoreboard')).getByRole('listitem', { name: 'Team 1' });
      await u.click(within(row).getByRole('button', { name: 'Team 1 score plus 10' }));
      expect(scoreOf(row)).toBe('0');
      await new Promise((resolve) => setTimeout(resolve, 800)); // past the 500 ms save debounce
      expect((await r.services.data.events.loadState(r.event.id))?.rev).toBe(1);
    });

    it('claims the lease again on "Reload this event" once the other stage has left', async () => {
      const r = await rig(hubState());
      await r.services.data.events.claimDirector(r.event.id, 'other-stage-tab');
      r.mount();
      const u = userEvent.setup();
      await resume(u);
      await u.click(await screen.findByRole('button', { name: 'Reload this event' })); // still held: read-only again
      await resume(u);
      await screen.findByText(/Another stage is running this event/);

      await r.services.data.events.releaseDirector(r.event.id, 'other-stage-tab');
      await u.click(screen.getByRole('button', { name: 'Reload this event' }));
      await resume(u);
      await waitForRoom();
      expect(screen.queryByText(/Another stage is running this event/)).toBeNull();
      await waitFor(() => {
        expect(r.services.transports.some((t) => t.status === 'connected')).toBe(true);
      });
    });

    it('reloads the event from the cloud copy when asked', async () => {
      const r = await rig(hubState());
      r.mount();
      const u = userEvent.setup();
      await resume(u);
      await screen.findByRole('listbox', { name: 'Hub' });
      const record = await r.services.data.events.loadState(r.event.id);
      await r.services.data.events.saveState(
        r.event.id,
        reduce(hubState(), { type: 'SCORE_CHANGE', team: 2, delta: 80 }),
        record?.rev ?? 0,
      );
      await u.click(
        within(within(screen.getByTestId('scoreboard')).getByRole('listitem', { name: 'Team 1' })).getByRole(
          'button',
          { name: 'Team 1 score plus 10' },
        ),
      );
      await u.click(await screen.findByRole('button', { name: 'Reload this event' }, { timeout: 4000 }));
      await resume(u);
      const row2 = within(await screen.findByTestId('scoreboard')).getByRole('listitem', { name: 'Team 2' });
      expect(scoreOf(row2)).toBe('80');
    }, 10_000);
  });

  describe('signing out while the event is open (FR-007)', () => {
    it('keeps a running game on screen with a banner', async () => {
      const running = reduce(hubState(), { type: 'START_GAME', kind: 'feud', instanceSeed: 1 });
      const r = await rig(running);
      r.mount({ signedOut: true });
      await resume(userEvent.setup());
      expect(await screen.findByTestId('fake-game')).toBeInTheDocument();
      expect(screen.getByText(/You are signed out/)).toBeInTheDocument();
      expect(screen.queryByTestId('reauth')).toBeNull();
    });

    it('asks to sign in again over the hub when no game is running', async () => {
      const r = await rig(hubState());
      r.mount({ signedOut: true });
      await resume(userEvent.setup());
      const overlay = await screen.findByTestId('reauth');
      expect(within(overlay).getByRole('heading', { name: 'Host sign in' })).toBeInTheDocument();
    });
  });
  describe('the host drawer (F2)', () => {
    /** A game console with one button per command and a text field. */
    const FeudConsoleStub = ({ snapshot, send }: HostConsoleProps) => {
      const [outcome, setOutcome] = useState('none');
      const run = (name: string, gameRev?: number) => {
        void Promise.resolve(
          send({ target: 'feud', name, ...(gameRev === undefined ? {} : { gameRev }) }),
        ).then((r) => {
          setOutcome(r.applied ? 'applied' : r.reason);
        });
      };
      return (
        <div>
          <p>Feud console rev {snapshot.gameRev}</p>
          <button
            type="button"
            onClick={() => {
              run('reveal');
            }}
          >
            Reveal
          </button>
          <button
            type="button"
            onClick={() => {
              run('reveal-old', 1);
            }}
          >
            Reveal old
          </button>
          <input aria-label="Note" />
          <p data-testid="outcome">{outcome}</p>
        </div>
      );
    };

    let unregister: (() => void) | null = null;

    afterEach(() => {
      unregister?.();
      unregister = null;
    });

    const atHub = async () => {
      const r = await rig(hubState());
      r.mount();
      const u = userEvent.setup();
      await resume(u);
      await screen.findByRole('listbox', { name: 'Hub' });
      return { r, u };
    };

    const atFeud = async () => {
      const { r, u } = await atHub();
      await u.click(await screen.findByRole('option', { name: /Family Feud/ }));
      await screen.findByTestId('fake-game');
      const handler = vi.fn(() => ({ applied: true as const }));
      act(() => {
        captured?.host.onCommand('feud', handler);
        captured?.host.publishSnapshot({ kind: 'feud', gameRev: 5, inputLocked: false, data: {} });
      });
      return { r, u, handler };
    };

    it('shows the hub console at the hub and closes with its button', async () => {
      const { u } = await atHub();
      const root = screen.getByTestId('stage-root');
      expect(screen.queryByRole('complementary', { name: 'Host tools' })).toBeNull();
      fireEvent.keyDown(window, { key: 'F2' });
      const drawer = await screen.findByRole('complementary', { name: 'Host tools' });
      expect(root).toHaveAttribute('data-host-drawer', 'true');
      expect(await within(drawer).findByRole('button', { name: /Stand by/ })).toBeInTheDocument();
      await u.click(within(drawer).getByRole('button', { name: 'Close' }));
      expect(root).toHaveAttribute('data-host-drawer', 'false');
      expect(screen.queryByRole('complementary', { name: 'Host tools' })).toBeNull();
      // F2 opens it again after a button close.
      fireEvent.keyDown(window, { key: 'F2' });
      expect(await screen.findByRole('complementary', { name: 'Host tools' })).toBeInTheDocument();
    });

    it('drives the stage from the hub console without a round trip, and does not lock input', async () => {
      const { u } = await atHub();
      fireEvent.keyDown(window, { key: 'F2' });
      const drawer = await screen.findByRole('complementary', { name: 'Host tools' });
      await u.click(await within(drawer).findByRole('button', { name: 'Show mode: off' }));
      expect(await screen.findByRole('button', { name: 'Show mode: on' })).toBeInTheDocument();
      expect(screen.getByTestId('stage-root')).toHaveAttribute('data-show-mode', 'true');
    });

    it('follows the active game: its console gets commands that reach the game handler', async () => {
      unregister = registerHostConsole('feud', FeudConsoleStub);
      const { u, handler } = await atFeud();
      fireEvent.keyDown(window, { key: 'F2' });
      const drawer = await screen.findByRole('complementary', { name: 'Host tools' });
      expect(await within(drawer).findByText('Feud console rev 5')).toBeInTheDocument();
      // The drawer must not lock the game while the host rules.
      expect(captured?.inputLocked).toBe(false);

      await u.click(within(drawer).getByRole('button', { name: 'Reveal' }));
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ target: 'feud', name: 'reveal', gameRev: 5 }),
      );
      await waitFor(() => {
        expect(within(drawer).getByTestId('outcome')).toHaveTextContent('applied');
      });
      expect(captured?.inputLocked).toBe(false);
    });

    it('refuses a stale command from the drawer', async () => {
      unregister = registerHostConsole('feud', FeudConsoleStub);
      const { u, handler } = await atFeud();
      fireEvent.keyDown(window, { key: 'F2' });
      const drawer = await screen.findByRole('complementary', { name: 'Host tools' });
      await u.click(await within(drawer).findByRole('button', { name: 'Reveal old' }));
      await waitFor(() => {
        expect(within(drawer).getByTestId('outcome')).toHaveTextContent('stale');
      });
      expect(handler).not.toHaveBeenCalled();
    });

    it('goes back to the hub console when the game ends', async () => {
      unregister = registerHostConsole('feud', FeudConsoleStub);
      const { u } = await atFeud();
      fireEvent.keyDown(window, { key: 'F2' });
      const drawer = await screen.findByRole('complementary', { name: 'Host tools' });
      await within(drawer).findByText('Feud console rev 5');
      act(() => {
        captured?.onQuitToHub();
      });
      expect(await within(drawer).findByRole('button', { name: /Stand by/ })).toBeInTheDocument();
      expect(within(drawer).queryByText('Feud console rev 5')).toBeNull();
      await u.click(within(drawer).getByRole('button', { name: 'Close' }));
      expect(screen.getByTestId('stage-root')).toHaveAttribute('data-host-drawer', 'false');
    });

    it('does not steal hotkeys typed into a drawer text field, but keeps them elsewhere', async () => {
      unregister = registerHostConsole('feud', FeudConsoleStub);
      const { u } = await atFeud();
      const presses: number[] = [];
      act(() => {
        captured?.phones.onPress((p) => presses.push(p.team));
      });
      fireEvent.keyDown(window, { key: 'F2' });
      const drawer = await screen.findByRole('complementary', { name: 'Host tools' });
      const note = await within(drawer).findByRole('textbox', { name: 'Note' });
      await u.click(note);
      await u.keyboard('12');
      expect(note).toHaveValue('12');
      expect(presses).toEqual([]);
      expect(screen.getByTestId('stage-root')).toHaveAttribute('data-host-drawer', 'true');
      // Focus back on the page: the digits buzz again.
      note.blur();
      fireEvent.keyDown(document.body, { key: '2' });
      await waitFor(() => {
        expect(presses).toEqual([2]);
      });
    });

    it('shows the same settings form as the Settings dialog on its Settings tab', async () => {
      const { u } = await atHub();
      fireEvent.keyDown(window, { key: 'F2' });
      const drawer = await screen.findByRole('complementary', { name: 'Host tools' });
      await u.click(within(drawer).getByRole('tab', { name: 'Settings' }));
      expect(within(drawer).getByRole('slider', { name: 'Volume' })).toBeInTheDocument();
      expect(within(drawer).getByRole('button', { name: 'Reset scores & chips' })).toBeInTheDocument();
      await u.click(within(drawer).getByRole('button', { name: 'Back to my events' }));
    });
  });
});
