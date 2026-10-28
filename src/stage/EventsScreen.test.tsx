import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@/data';
import { EventsScreen } from './EventsScreen';
import { createTestServices, signUpHost, type TestServices } from './testKit';

describe('EventsScreen', () => {
  let services: TestServices;
  let user: AuthUser;
  const onOpen = vi.fn();
  const onSignOut = vi.fn();

  beforeEach(async () => {
    onOpen.mockReset();
    onSignOut.mockReset();
    services = createTestServices();
    user = await signUpHost(services.data);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mount = () =>
    render(<EventsScreen data={services.data} user={user} onOpen={onOpen} onSignOut={onSignOut} />);

  it('says so when the host has no events yet', async () => {
    mount();
    expect(await screen.findByText(/No events yet/)).toBeInTheDocument();
  });

  it('lists only this host events, newest first', async () => {
    await services.data.events.createEvent('First');
    await services.data.events.createEvent('Second');
    await services.data.events.createEvent('Third');
    await services.data.auth.signOut();
    await services.data.auth.signUp('other@example.com', 'secret-pass');
    await services.data.events.createEvent('Not mine');
    await services.data.auth.signOut();
    await services.data.auth.signInWithPassword('host@example.com', 'secret-pass');

    mount();
    const items = await screen.findAllByRole('listitem');
    expect(items.map((li) => within(li).getByText(/First|Second|Third|Not mine/).textContent)).toEqual([
      'Third',
      'Second',
      'First',
    ]);
  });

  it('creates an event with a name and opens it', async () => {
    const u = userEvent.setup();
    mount();
    await screen.findByText(/No events yet/);
    await u.type(screen.getByLabelText('New event name'), '  Quiz night  ');
    await u.click(screen.getByRole('button', { name: 'Create event' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    const events = await services.data.events.listEvents();
    expect(events.map((e) => e.name)).toEqual(['Quiz night']);
    expect(onOpen).toHaveBeenCalledWith(events[0]?.id);
  });

  it('refuses an empty name with an inline message', async () => {
    const u = userEvent.setup();
    mount();
    await screen.findByText(/No events yet/);
    await u.click(screen.getByRole('button', { name: 'Create event' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Give the event a name');
    expect(onOpen).not.toHaveBeenCalled();
    expect(await services.data.events.listEvents()).toHaveLength(0);
  });

  it('opens an existing event', async () => {
    const created = await services.data.events.createEvent('Old one');
    const u = userEvent.setup();
    mount();
    await u.click(await screen.findByRole('button', { name: 'Open Old one' }));
    expect(onOpen).toHaveBeenCalledWith(created.id);
  });

  it('deletes only on the second tap', async () => {
    await services.data.events.createEvent('Doomed');
    const u = userEvent.setup();
    mount();
    await u.click(await screen.findByRole('button', { name: 'Delete Doomed' }));
    expect(screen.getByRole('button', { name: 'Tap again to delete Doomed' })).toHaveTextContent(
      'Tap again: delete',
    );
    expect(await services.data.events.listEvents()).toHaveLength(1);
    await u.click(screen.getByRole('button', { name: 'Tap again to delete Doomed' }));
    expect(screen.queryByText('Doomed')).toBeNull();
    expect(await services.data.events.listEvents()).toHaveLength(0);
  });

  it('forgets a first tap after 4 seconds', async () => {
    await services.data.events.createEvent('Safe');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const u = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    mount();
    await u.click(await screen.findByRole('button', { name: 'Delete Safe' }));
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(screen.getByRole('button', { name: 'Delete Safe' })).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Delete Safe' }));
    expect(screen.getByText('Safe')).toBeInTheDocument();
  });

  it('keeps finished events readable: they are marked and open with View', async () => {
    const created = await services.data.events.createEvent('Done night');
    await services.data.events.finishEvent(created.id);
    const u = userEvent.setup();
    mount();
    expect(await screen.findByText('Finished')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Open Done night' }));
    expect(onOpen).toHaveBeenCalledWith(created.id);
  });

  it('signs out', async () => {
    const u = userEvent.setup();
    mount();
    await screen.findByText(/No events yet/);
    await u.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalled();
  });
});
