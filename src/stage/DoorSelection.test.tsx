import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { defaultTeamEdits, eventReducer, createEventSession, type EventAction } from '@/engines/event';
import { DoorSelection } from './DoorSelection';
import { ReducerHarness } from './reducerHarness';

const threeTeamDoors = () => eventReducer(createEventSession(defaultTeamEdits(3)), { type: 'START_DOORS' });

const mount = (draw: () => number, onDispatch?: (a: EventAction) => void) =>
  render(
    <ReducerHarness initial={threeTeamDoors()} onDispatch={onDispatch}>
      {({ session, dispatch }) => <DoorSelection session={session} dispatch={dispatch} draw={draw} />}
    </ReducerHarness>,
  );

describe('DoorSelection', () => {
  it('asks the next team without a pick to choose, and advances after each pick', async () => {
    const u = userEvent.setup();
    mount(() => 0.5);
    expect(screen.getByRole('status')).toHaveTextContent('Team 1, choose your door');
    await u.click(screen.getByRole('button', { name: 'Door 2' }));
    expect(screen.getByRole('status')).toHaveTextContent('Team 2, choose your door');
    expect(screen.getByRole('button', { name: 'Door 2, picked by Team 1' })).toBeDisabled();
  });

  it('lets the host pick for a different team and change a pick', async () => {
    const u = userEvent.setup();
    mount(() => 0.5);
    await u.click(screen.getByRole('button', { name: 'Team 3, no door yet' }));
    expect(screen.getByRole('status')).toHaveTextContent('Team 3, choose your door');
    await u.click(screen.getByRole('button', { name: 'Door 1' }));
    expect(screen.getByRole('button', { name: 'Team 3, door 1' })).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Team 3, door 1' }));
    await u.click(screen.getByRole('button', { name: 'Door 3' }));
    expect(screen.getByRole('button', { name: 'Team 3, door 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Door 1' })).toBeEnabled();
  });

  it('offers the reveal only once every team has picked, then draws one number per door', async () => {
    const u = userEvent.setup();
    const draw = vi.fn(() => 0.5);
    const dispatched: EventAction[] = [];
    mount(draw, (a) => dispatched.push(a));
    expect(screen.queryByRole('button', { name: 'Open the doors!' })).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Door 1' }));
    await u.click(screen.getByRole('button', { name: 'Door 2' }));
    expect(screen.queryByRole('button', { name: 'Open the doors!' })).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Door 3' }));
    expect(screen.getByRole('status')).toHaveTextContent('Every team has picked');
    expect(draw).not.toHaveBeenCalled();

    await u.click(screen.getByRole('button', { name: 'Open the doors!' }));
    expect(draw).toHaveBeenCalledTimes(3);
    expect(dispatched.at(-1)).toEqual({ type: 'DOORS_REVEAL', draw: [0.5, 0.5, 0.5] });
  });

  it('reveals who plays when, with a flourish, and continues to the hub', async () => {
    const u = userEvent.setup();
    const dispatched: EventAction[] = [];
    // The draw below makes the shuffle reverse the doors: door 1 hides position 3, door 3 hides position 1.
    const numbers = [0.1, 0.1, 0.9];
    let i = 0;
    mount(
      () => numbers[i++ % numbers.length] ?? 0,
      (a) => dispatched.push(a),
    );
    await u.click(screen.getByRole('button', { name: 'Door 1' }));
    await u.click(screen.getByRole('button', { name: 'Door 2' }));
    await u.click(screen.getByRole('button', { name: 'Door 3' }));
    await u.click(screen.getByRole('button', { name: 'Open the doors!' }));

    expect(screen.getByRole('status')).toHaveTextContent('The play order is set.');
    const doors = screen.getByRole('group', { name: 'Doors' });
    const labels = within(doors)
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'));
    expect(labels).toHaveLength(3);
    for (const label of labels) expect(label).toMatch(/^Door \d: Team \d plays (1st|2nd|3rd)$/);
    const order = within(screen.getByRole('list', { name: 'Play order' })).getAllByRole('listitem');
    expect(order).toHaveLength(3);
    // The shown order matches the order each door says its team plays.
    const byPosition = ['1st', '2nd', '3rd'].map(
      (p) => labels.find((l) => l?.endsWith(`plays ${p}`))?.match(/(Team \d)/)?.[1],
    );
    expect(order.map((li) => li.textContent)).toEqual(byPosition);

    await u.click(screen.getByRole('button', { name: 'Continue to the hub' }));
    expect(dispatched.at(-1)).toEqual({ type: 'GO_HUB' });
  });
});
