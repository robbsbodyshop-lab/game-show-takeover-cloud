import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppServicesProvider } from '@/app/AppContext';
import {
  createEventSession,
  defaultTeamEdits,
  eventReducer,
  type EventAction,
  type EventSession,
} from '@/engines/event';
import { FeudGame } from '@/games/feud/FeudGame';
import { WheelGame } from '@/games/wheel/WheelGame';
import { MemoryRoomTransport, type ParsedMessage } from '@/realtime';
import { EventStage } from './EventStage';
import type { GameProps } from './gameContract';
import { createTestServices, signUpHost, type TestServices } from './testKit';

vi.mock('qrcode', () => ({ toCanvas: vi.fn(() => Promise.resolve()) }));

let captured: GameProps | null = null;

const SpyGame = (props: GameProps) => {
  useEffect(() => {
    captured = props;
  });
  return <div data-testid="spy-game">spy game</div>;
};

/** The real Feud game, with the props it was given kept for the test to read. */
const SpyFeud = (props: GameProps) => {
  useEffect(() => {
    captured = props;
  });
  return <FeudGame {...props} />;
};

const SpyWheel = (props: GameProps) => {
  useEffect(() => {
    captured = props;
  });
  return <WheelGame {...props} />;
};

const reduce = (s: EventSession, ...actions: EventAction[]): EventSession => actions.reduce(eventReducer, s);

const hubState = (): EventSession => {
  const s = createEventSession(defaultTeamEdits(2));
  return reduce(s, { type: 'SET_PLAY_ORDER', order: s.teams.map((t) => t.id) }, { type: 'GO_HUB' });
};

async function mountStage(
  games: Record<string, React.ComponentType<GameProps>>,
  prepare?: (services: TestServices) => Promise<void>,
) {
  const services = createTestServices();
  const user = await signUpHost(services.data);
  const event = await services.data.events.createEvent('Friday night');
  await services.data.events.saveState(event.id, hubState(), 0);
  await prepare?.(services);
  render(
    <AppServicesProvider value={services}>
      <EventStage
        eventId={event.id}
        user={user}
        signedOut={false}
        draw={() => 0.5}
        now={() => 1_000}
        onExit={vi.fn()}
        onSignOut={vi.fn()}
        games={games}
      />
    </AppServicesProvider>,
  );
  const u = userEvent.setup();
  await u.click(await screen.findByRole('button', { name: 'Resume' }));
  await screen.findByRole('listbox', { name: 'Hub' });
  return { services, event, u };
}

const startGame = async (u: ReturnType<typeof userEvent.setup>, name: RegExp) => {
  await u.click(screen.getByRole('option', { name }));
};

const openSettings = async (u: ReturnType<typeof userEvent.setup>) => {
  await u.click(screen.getByRole('option', { name: /Settings/ }));
  return screen.getByRole('dialog', { name: 'Settings' });
};

beforeEach(() => {
  captured = null;
  localStorage.clear();
  sessionStorage.clear();
});

describe('host settings reach the games', () => {
  it('hands the saved Feud, Wheel and app groups to the game, with voice taken from the app group', async () => {
    const { u } = await mountStage({ feud: SpyGame }, async ({ data }) => {
      await data.settings.save({
        feud: { targetScore: 400, format: 'one-round', voice: 'off', answersFrom: 'host' },
        wheel: { opening: 'frenzy', bonusRound: false },
        app: { voice: 'on', answersFrom: 'both' },
      });
    });
    await startGame(u, /Family Feud/);
    await screen.findByTestId('spy-game');
    expect(captured?.gameSettings).toEqual({
      feud: {
        targetScore: 400,
        format: 'one-round',
        fastMoneyEnabled: true,
        answerTimerSec: 5,
        stealTimerSec: 0,
        voice: 'on',
        answersFrom: 'both',
      },
      wheel: { opening: 'frenzy', speedUpStart: 'bell', length: 'full', bonusRound: false, turnTimerSec: 0 },
      app: { voice: 'on', answersFrom: 'both' },
    });
  });

  it('gives a game the defaults when nothing was ever saved', async () => {
    const { u } = await mountStage({ feud: SpyGame });
    await startGame(u, /Family Feud/);
    await screen.findByTestId('spy-game');
    expect(captured?.gameSettings?.feud).toMatchObject({ targetScore: 300, format: 'full', voice: 'off' });
    expect(captured?.gameSettings?.wheel.opening).toBe('classic');
  });

  it('saves the Settings form through data.settings, and the next Feud game starts with that winning score', async () => {
    const { services, u } = await mountStage({ feud: SpyFeud });
    const dialog = await openSettings(u);
    expect(within(dialog).getByText('Family Feud (next game)')).toBeInTheDocument();
    expect(within(dialog).getByText('Wheel of Fortune (next game)')).toBeInTheDocument();
    await u.selectOptions(within(dialog).getByLabelText('Winning score'), '400');
    await u.selectOptions(within(dialog).getByLabelText('Steal huddle'), '30');
    await u.click(within(dialog).getByRole('checkbox', { name: 'Fast Money' }));
    await u.selectOptions(within(dialog).getByLabelText('Opening'), 'frenzy');
    await u.click(within(dialog).getByRole('checkbox', { name: 'Bonus Round' }));
    await waitFor(async () => {
      const record = await services.data.settings.load();
      expect(record.feud).toMatchObject({ targetScore: 400, stealTimerSec: 30, fastMoneyEnabled: false });
      expect(record.wheel).toMatchObject({ opening: 'frenzy', bonusRound: false });
    });
    await u.click(within(dialog).getByRole('button', { name: 'Close' }));

    await startGame(u, /Family Feud/);
    expect(await screen.findByText('First family to 400 points wins')).toBeInTheDocument();
    expect(captured?.gameSettings?.feud).toMatchObject({ targetScore: 400, fastMoneyEnabled: false });
  });

  it('offers the same sections in the F2 drawer Settings tab, saving to the same place', async () => {
    const { services, u } = await mountStage({ feud: SpyGame });
    fireEvent.keyDown(window, { key: 'F2' });
    await u.click(await screen.findByRole('tab', { name: 'Settings' }));
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText('Family Feud (next game)')).toBeInTheDocument();
    await u.selectOptions(within(panel).getByLabelText('Match format'), 'one-round');
    await waitFor(async () => {
      expect((await services.data.settings.load()).feud).toMatchObject({ format: 'one-round' });
    });
  });

  it('caches the saved choices in this browser, for a reload before the account copy arrives', async () => {
    const { services, u } = await mountStage({ feud: SpyGame });
    const dialog = await openSettings(u);
    await u.selectOptions(within(dialog).getByLabelText('Winning score'), '500');
    await waitFor(async () => {
      expect((await services.data.settings.load()).feud).toMatchObject({ targetScore: 500 });
    });
    expect(JSON.parse(localStorage.getItem('gst:feud-settings') ?? '{}')).toMatchObject({ targetScore: 500 });
  });

  it('saves what a game reports through onSaveSettings, parsed over the current group', async () => {
    const { services, u } = await mountStage({ wheel: SpyGame });
    await startGame(u, /Wheel of Fortune/);
    await screen.findByTestId('spy-game');
    act(() => {
      captured?.onSaveSettings?.('wheel', { length: 'short', turnTimerSec: 7, bonusRound: 'maybe' });
    });
    await waitFor(async () => {
      expect((await services.data.settings.load()).wheel).toEqual({
        opening: 'classic',
        speedUpStart: 'bell',
        length: 'short',
        bonusRound: true,
        turnTimerSec: 0,
      });
    });
    await waitFor(() => {
      expect(captured?.gameSettings?.wheel.length).toBe('short');
    });
  });

  it('saves the Wheel console next-game form to the same place', async () => {
    const { services, u, event } = await mountStage({ wheel: SpyWheel });
    const code = await services.data.rooms.openRoom(event.id);
    const host = new MemoryRoomTransport({ hub: services.hub });
    const snapshots: { kind: string; gameRev: number }[] = [];
    const results: { cmdId: string; applied: boolean }[] = [];
    host.subscribe('host', (m: ParsedMessage<'host'>) => {
      if (m.event === 'snapshot') snapshots.push(m.message);
      if (m.event === 'result') results.push(m.message);
    });
    await host.connect({ code, role: 'host', key: 'host-1' });
    await startGame(u, /Wheel of Fortune/);
    await waitFor(() => {
      expect(snapshots.some((s) => s.kind === 'wheel')).toBe(true);
    });
    const gameRev = snapshots.filter((s) => s.kind === 'wheel').at(-1)?.gameRev ?? 0;
    await host.publish('host', 'command', {
      cmdId: 'save-1',
      target: 'wheel',
      gameRev,
      name: 'save-settings',
      args: { opening: 'frenzy', speedUpStart: 'round4', length: 'short', bonusRound: false },
    });
    await waitFor(() => {
      expect(results.find((r) => r.cmdId === 'save-1')).toMatchObject({ applied: true });
    });
    await waitFor(async () => {
      expect((await services.data.settings.load()).wheel).toEqual({
        opening: 'frenzy',
        speedUpStart: 'round4',
        length: 'short',
        bonusRound: false,
        turnTimerSec: 0,
      });
    });
  });
});

describe('the host view saves settings and the stage re-reads them', () => {
  it('applies music, volume, CRT, voice and answer source live on settings-changed', async () => {
    const { services, u, event } = await mountStage({ feud: SpyGame });
    const setVolume = vi.spyOn(services.audio, 'setVolume');
    await startGame(u, /Family Feud/);
    await screen.findByTestId('spy-game');
    expect(captured?.gameSettings?.app).toEqual({ voice: 'off', answersFrom: 'host' });
    expect(document.documentElement.dataset.crt).toBeUndefined();

    const code = await services.data.rooms.openRoom(event.id);
    const host = new MemoryRoomTransport({ hub: services.hub });
    const results: { cmdId: string; applied: boolean }[] = [];
    host.subscribe('host', (m: ParsedMessage<'host'>) => {
      if (m.event === 'result') results.push(m.message);
    });
    await host.connect({ code, role: 'host', key: 'host-1' });
    await waitFor(() => {
      expect(host.status).toBe('connected');
    });

    // The host view's save lands in the account, then it sends the hub command.
    await services.data.settings.save({
      app: { musicOn: false, volume: 0.3, crtCurve: true, voice: 'on', answersFrom: 'phones' },
    });
    await host.publish('host', 'command', {
      cmdId: 'sc-1',
      target: 'hub',
      gameRev: 0,
      name: 'settings-changed',
    });
    await waitFor(() => {
      expect(results.find((r) => r.cmdId === 'sc-1')).toMatchObject({ applied: true });
    });
    await waitFor(() => {
      expect(document.documentElement.dataset.crt).toBe('on');
    });
    expect(setVolume).toHaveBeenLastCalledWith(0.3);
    await waitFor(() => {
      expect(captured?.gameSettings?.app).toEqual({ voice: 'on', answersFrom: 'phones' });
    });
    expect(captured?.gameSettings?.feud).toMatchObject({ voice: 'on', answersFrom: 'phones' });
    expect(localStorage.getItem('gst:musicOn')).toBe('0');
  });
});
