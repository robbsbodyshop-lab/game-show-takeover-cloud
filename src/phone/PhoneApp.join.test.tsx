import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_TEAMS } from './demoTeams';
import { connectStage, createHarness, renderPhone, TEAMS } from './phoneTestKit';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PhoneApp join flow', () => {
  it('asks for a code, uppercases it, drops vowels and moves on when the 4th letter is typed', async () => {
    const h = createHarness();
    const { code } = await h.seedRoom(TEAMS);
    const user = userEvent.setup();
    renderPhone(h);

    const input = await screen.findByLabelText('Room code');
    await user.type(input, `a${code.toLowerCase().slice(0, 2)}1`);
    expect(input).toHaveValue(code.slice(0, 2));
    await user.type(input, code.toLowerCase().slice(2));

    expect(await screen.findByRole('heading', { name: 'Pick your team' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Reds/ })).toBeInTheDocument();
    expect(localStorage.getItem('gst:buzz:room')).toBe(code);
  });

  it('reads the code from ?room= and signs in anonymously before joining', async () => {
    const h = createHarness();
    const { code } = await h.seedRoom(TEAMS);
    const signIn = vi.spyOn(h.data.auth, 'signInAnonymously');
    renderPhone(h, `?room=${code.toLowerCase()}`);
    expect(await screen.findByRole('heading', { name: 'Pick your team' })).toBeInTheDocument();
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it('says "Room not found" and clears everything with Change room', async () => {
    const h = createHarness();
    await h.seedRoom(TEAMS);
    const user = userEvent.setup();
    renderPhone(h);

    const input = await screen.findByLabelText('Room code');
    await user.type(input, 'BCDF');
    expect(await screen.findByRole('alert')).toHaveTextContent('Room not found');
    expect(localStorage.getItem('gst:buzz:room')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Change room' }));
    expect(screen.getByLabelText('Room code')).toHaveValue('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a stale stored room as "Room not found" with a Change room button (FR-028)', async () => {
    const h = createHarness();
    await h.seedRoom(TEAMS);
    localStorage.setItem('gst:buzz:room', 'BCDF');
    localStorage.setItem('gst:buzz:team:BCDF', '2');
    renderPhone(h);
    expect(await screen.findByRole('alert')).toHaveTextContent('Room not found');
    expect(screen.getByLabelText('Room code')).toHaveValue('BCDF');
    expect(screen.getByRole('button', { name: 'Change room' })).toBeInTheDocument();
    // The dead code is forgotten so a reload does not loop on it.
    expect(localStorage.getItem('gst:buzz:room')).toBeNull();
  });

  it('says to wait a few minutes after five wrong codes', async () => {
    const h = createHarness();
    await h.seedRoom(TEAMS);
    const user = userEvent.setup();
    renderPhone(h);

    // Each failed attempt remounts the join screen, so look the field up again every time.
    for (const wrong of ['BCDF', 'BCDG', 'BCDH', 'BCDJ', 'BCDK']) {
      const field = await screen.findByLabelText('Room code');
      await user.clear(field);
      await user.type(field, wrong);
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Room not found');
      });
    }
    const last = await screen.findByLabelText('Room code');
    await user.clear(last);
    await user.type(last, 'BCDL');
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Too many tries, wait a few minutes');
    });
  });

  it('shows "Host is still setting up" and polls every 5 s until teams exist', async () => {
    const h = createHarness();
    const { code, eventId } = await h.seedRoom([]);
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const joinRoom = vi.spyOn(h.data.rooms, 'joinRoom');
    renderPhone(h, `?room=${code}`);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('Host is still setting up')).toBeInTheDocument();
    expect(joinRoom).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(joinRoom).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Host is still setting up')).toBeInTheDocument();

    h.setTeams(eventId, TEAMS);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(joinRoom).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('heading', { name: 'Pick your team' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Greens/ })).toBeInTheDocument();
  });
});

describe('PhoneApp team persistence', () => {
  it('stores the chosen team and rejoins silently after a reload', async () => {
    const h = createHarness();
    const { code } = await h.seedRoom(TEAMS);
    const user = userEvent.setup();
    const first = renderPhone(h, `?room=${code}`);

    await user.type(await screen.findByLabelText('Nickname (optional)'), 'Ada');
    await user.click(await screen.findByRole('option', { name: /Blues/ }));
    expect(await screen.findByText('Blues')).toBeInTheDocument();
    expect(localStorage.getItem(`gst:buzz:team:${code}`)).toBe('2');
    expect(localStorage.getItem('gst:buzz:room')).toBe(code);
    first.unmount();

    // Reload with no query string: room and team come from storage, no picker.
    renderPhone(h, '');
    expect(await screen.findByText('Blues')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pick your team' })).toBeNull();
    expect(screen.getByText(`Room ${code}`)).toBeInTheDocument();
  });

  it('goes back to the picker when the stored team no longer exists', async () => {
    const h = createHarness();
    const { code } = await h.seedRoom([TEAMS[0]!]);
    localStorage.setItem('gst:buzz:room', code);
    localStorage.setItem(`gst:buzz:team:${code}`, '3');
    renderPhone(h);
    expect(await screen.findByRole('heading', { name: 'Pick your team' })).toBeInTheDocument();
    expect(localStorage.getItem(`gst:buzz:team:${code}`)).toBeNull();
  });

  it('Change team returns to the picker and Change room to the code screen', async () => {
    const h = createHarness();
    const { code } = await h.seedRoom(TEAMS);
    const leave = vi.spyOn(h.data.rooms, 'leaveRoom');
    const user = userEvent.setup();
    renderPhone(h, `?room=${code}`);
    await user.click(await screen.findByRole('option', { name: /Reds/ }));
    await screen.findByText('Reds');

    await user.click(screen.getByRole('button', { name: 'Change team' }));
    expect(await screen.findByRole('heading', { name: 'Pick your team' })).toBeInTheDocument();
    expect(localStorage.getItem(`gst:buzz:team:${code}`)).toBeNull();
    await user.click(screen.getByRole('option', { name: /Greens/ }));
    await screen.findByText('Greens');

    await user.click(screen.getByRole('button', { name: 'Change room' }));
    expect(await screen.findByLabelText('Room code')).toHaveValue('');
    expect(leave).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('gst:buzz:room')).toBeNull();
    expect(localStorage.getItem(`gst:buzz:team:${code}`)).toBeNull();
  });

  it('Change team reconnects on the new team topic, so presses carry the new team (FR-025)', async () => {
    const h = createHarness();
    const { code } = await h.seedRoom(TEAMS);
    const stage = await connectStage(h.hub, code);
    const user = userEvent.setup();
    renderPhone(h, `?room=${code}`);
    await user.click(await screen.findByRole('option', { name: /Reds/ }));
    await screen.findByText('Live');
    await act(async () => {
      await stage.controls({ buzzTeams: [1, 3] });
    });
    await user.click(await screen.findByRole('button', { name: 'BUZZ' }));
    await waitFor(() => {
      expect(stage.phones).toHaveLength(1);
    });
    expect(stage.phones[0]).toMatchObject({ event: 'press', topicTeam: 1, message: { team: 1 } });

    await user.click(screen.getByRole('button', { name: 'Change team' }));
    await user.click(await screen.findByRole('option', { name: /Greens/ }));
    await screen.findByText('Greens');
    await screen.findByText('Live');
    await act(async () => {
      await stage.controls({ buzzTeams: [1, 3] });
    });
    await user.click(await screen.findByRole('button', { name: 'BUZZ' }));
    await waitFor(() => {
      expect(stage.phones).toHaveLength(2);
    });
    expect(stage.phones[1]).toMatchObject({ event: 'press', topicTeam: 3, message: { team: 3 } });
  });

  it('sends the phone back to the picker when the stage removes its team', async () => {
    const h = createHarness();
    const { code } = await h.seedRoom(TEAMS);
    const user = userEvent.setup();
    renderPhone(h, `?room=${code}`);
    const stage = await connectStage(h.hub, code);
    await user.click(await screen.findByRole('option', { name: /Greens/ }));
    await screen.findByText('Greens');

    await act(async () => {
      await stage.teams([TEAMS[0]!, TEAMS[1]!]);
    });
    expect(await screen.findByRole('heading', { name: 'Pick your team' })).toBeInTheDocument();
  });

  it('follows a team rename from the stage', async () => {
    const h = createHarness();
    const { code } = await h.seedRoom(TEAMS);
    const user = userEvent.setup();
    renderPhone(h, `?room=${code}`);
    const stage = await connectStage(h.hub, code);
    await user.click(await screen.findByRole('option', { name: /Reds/ }));
    await screen.findByText('Reds');
    await act(async () => {
      await stage.teams([{ id: 1, name: 'Crimson', color: '#ff0000' }, TEAMS[1]!]);
    });
    expect(await screen.findByText('Crimson')).toBeInTheDocument();
  });
});

describe('PhoneApp demo mode', () => {
  it('skips joinRoom and offers the 8 demo teams', async () => {
    const h = createHarness('demo');
    const joinRoom = vi.spyOn(h.data.rooms, 'joinRoom');
    const user = userEvent.setup();
    renderPhone(h, '?demo=1&room=DMKT');

    expect(await screen.findAllByRole('option')).toHaveLength(DEMO_TEAMS.length);
    expect(joinRoom).not.toHaveBeenCalled();
    await user.click(screen.getByRole('option', { name: /Team 5/ }));
    expect(await screen.findByText('Room DMKT')).toBeInTheDocument();
    expect(joinRoom).not.toHaveBeenCalled();
  });

  it('reaches a demo stage over the shared hub', async () => {
    const h = createHarness('demo');
    const stage = await connectStage(h.hub, 'DMKT');
    const user = userEvent.setup();
    renderPhone(h, '?demo=1&room=DMKT');
    await user.click(await screen.findByRole('option', { name: /Team 2/ }));
    await act(async () => {
      await stage.controls({ buzzTeams: [2] });
    });
    await user.click(await screen.findByRole('button', { name: 'BUZZ' }));
    await waitFor(() => {
      expect(stage.phones).toHaveLength(1);
    });
    expect(stage.phones[0]).toMatchObject({ event: 'press', message: { team: 2 } });
  });

  it('rejects a code that cannot exist', async () => {
    const h = createHarness('demo');
    renderPhone(h, '?demo=1');
    const user = userEvent.setup();
    const input = await screen.findByLabelText('Room code');
    await user.type(input, 'abcd');
    // "A" is not a consonant, so only B C D remain and nothing is submitted.
    expect(input).toHaveValue('BCD');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
