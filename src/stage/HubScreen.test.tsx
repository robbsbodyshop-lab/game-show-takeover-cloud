import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  createEventSession,
  defaultTeamEdits,
  eventReducer,
  type EventAction,
  type EventSession,
} from '@/engines/event';
import { HubScreen } from './HubScreen';
import { hubTiles } from './hubTiles';

const hubSession = (teams = 2): EventSession => {
  const s = createEventSession(defaultTeamEdits(teams));
  const order = s.teams.map((t) => t.id);
  return [{ type: 'SET_PLAY_ORDER', order } as const, { type: 'GO_HUB' } as const].reduce(eventReducer, s);
};

const mount = (session: EventSession) => {
  const dispatch = vi.fn<(a: EventAction) => void>();
  const onOpenDialog = vi.fn();
  render(
    <HubScreen
      eventName="Friday night"
      session={session}
      dispatch={dispatch}
      draw={() => 0.5}
      onOpenDialog={onOpenDialog}
    />,
  );
  return { dispatch, onOpenDialog };
};

describe('HubScreen', () => {
  it('lists every hub tile', () => {
    mount(hubSession());
    const titles = within(screen.getByRole('listbox', { name: 'Hub' }))
      .getAllByRole('option')
      .map((o) => o.querySelector('span:nth-of-type(2)')?.textContent ?? '');
    expect(titles).toEqual([
      'Determine Play Order',
      'Family Feud',
      'Wheel of Fortune',
      'Speed Round',
      'Puzzle Game',
      'Run Final Plinko',
      'Announce the Winner',
      'Edit Teams',
      'Settings',
      'Credits',
    ]);
  });

  it.each([
    ['Family Feud', { type: 'START_GAME', kind: 'feud', instanceSeed: 2 ** 30 }],
    ['Wheel of Fortune', { type: 'START_GAME', kind: 'wheel', instanceSeed: 2 ** 30 }],
    ['Speed Round', { type: 'START_SPEED' }],
    ['Puzzle Game', { type: 'START_PUZZLE' }],
    ['Run Final Plinko', { type: 'START_PLINKO' }],
    ['Announce the Winner', { type: 'ANNOUNCE_WINNER' }],
  ])('%s starts its phase', async (title, action) => {
    const u = userEvent.setup();
    const { dispatch } = mount(hubSession());
    await u.click(screen.getByRole('option', { name: new RegExp(title) }));
    expect(dispatch).toHaveBeenCalledWith(action);
  });

  it('opens the dialogs for Edit Teams, Settings and Credits', async () => {
    const u = userEvent.setup();
    const { onOpenDialog, dispatch } = mount(hubSession());
    await u.click(screen.getByRole('option', { name: /Edit Teams/ }));
    await u.click(screen.getByRole('option', { name: /Settings/ }));
    await u.click(screen.getByRole('option', { name: /Credits/ }));
    expect(onOpenDialog.mock.calls.map((call) => call[0] as string)).toEqual([
      'teams',
      'settings',
      'credits',
    ]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('needs three teams for the door game, and starts it with three', async () => {
    const two = hubTiles(hubSession(2)).find((t) => t.id === 'order');
    expect(two).toMatchObject({ disabled: true, subtitle: 'Needs three or more teams' });

    const u = userEvent.setup();
    const { dispatch } = mount(hubSession(3));
    await u.click(screen.getByRole('option', { name: /Determine Play Order/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'START_DOORS' });
  });

  it('shows the play order once decided', () => {
    mount(hubSession(3));
    expect(screen.getByRole('option', { name: /Order: Team 1, Team 2, Team 3/ })).toBeInTheDocument();
  });

  it('notes the bracket for three or more teams and the two-family format for two', () => {
    expect(hubTiles(hubSession(3)).find((t) => t.id === 'feud')?.subtitle).toBe('Bracket: Team 2 vs Team 3');
    expect(hubTiles(hubSession(2)).find((t) => t.id === 'feud')?.subtitle).toBe(
      'Two families and Fast Money',
    );
  });

  it('marks a finished main game as played and disables it', () => {
    let s = hubSession(2);
    s = eventReducer(s, { type: 'START_GAME', kind: 'wheel', instanceSeed: 1 });
    s = eventReducer(s, { type: 'GAME_WON', winnerId: 1, roundScore: 5 });
    mount(s);
    const wheel = screen.getByRole('option', { name: /Wheel of Fortune/ });
    expect(wheel).toBeDisabled();
    expect(wheel).toHaveTextContent('(played)');
    expect(screen.getByRole('option', { name: /Family Feud/ })).toBeEnabled();
  });

  it('counts the chips waiting for Plinko', () => {
    let s = hubSession(2);
    s = eventReducer(s, { type: 'CHIP_CHANGE', team: 1, delta: 3 });
    expect(hubTiles(s).find((t) => t.id === 'plinko')?.subtitle).toBe('3 chips to drop');
  });
});
