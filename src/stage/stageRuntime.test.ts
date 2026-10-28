import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRoomTransport, type TeamsMessage } from '@/realtime';
import type { StageHostChannel } from './hostChannelAdapter';
import { StageRuntime, TOUCH_ROOM_INTERVAL_MS } from './stageRuntime';
import { createTestServices, flushPromises, signUpHost, type TestServices } from './testKit';

const fakeChannel = (): StageHostChannel => ({
  bridge: { publishSnapshot: vi.fn(), onCommand: () => () => undefined },
  publishHub: vi.fn(),
  onHubCommand: () => () => undefined,
  dispose: vi.fn(),
});

const TEAMS = [
  { id: 1, name: 'Reds', color: '#e63946' },
  { id: 2, name: 'Blues', color: '#2a9df4' },
];

describe('StageRuntime', () => {
  let services: TestServices;
  let eventId: string;
  let userId: string;

  beforeEach(async () => {
    services = createTestServices();
    userId = (await signUpHost(services.data)).id;
    eventId = (await services.data.events.createEvent('Night')).id;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const make = (teams = TEAMS) =>
    new StageRuntime({
      eventId,
      userId,
      data: services.data,
      createTransport: services.createTransport,
      createHostChannel: fakeChannel,
      teams,
    });

  const settle = async (rt: StageRuntime) => {
    for (let i = 0; i < 20 && rt.getSnapshot().status !== 'connected'; i += 1) await flushPromises(3);
  };

  const listenAsPhone = async (code: string) => {
    const phone = new MemoryRoomTransport({ hub: services.hub });
    const teamMessages: TeamsMessage[] = [];
    phone.subscribe('stage', (m) => {
      if (m.event === 'teams') teamMessages.push(m.message);
    });
    await phone.connect({ code, role: 'phone', team: 1 });
    return teamMessages;
  };

  it('opens the room, connects as the stage with the user id as key, and exposes the bridges', async () => {
    const rt = make();
    rt.start();
    expect(rt.getSnapshot().ready).toBe(true);
    expect(rt.getSnapshot().phones).not.toBeNull();
    expect(rt.getSnapshot().channel).not.toBeNull();
    await settle(rt);
    const snap = rt.getSnapshot();
    expect(snap.status).toBe('connected');
    expect(snap.code).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    expect(await services.data.rooms.openRoom(eventId)).toBe(snap.code);
    rt.stop();
    expect(rt.getSnapshot().ready).toBe(false);
  });

  it('publishes the teams when connected and again whenever they change', async () => {
    const rt = make();
    rt.start();
    await settle(rt);
    const code = rt.getSnapshot().code ?? '';
    const received = await listenAsPhone(code);
    await flushPromises();
    received.length = 0; // the welcome the phone got for joining
    rt.setTeams(TEAMS);
    await flushPromises();
    expect(received).toHaveLength(0); // unchanged: nothing re-sent
    rt.setTeams([{ id: 1, name: 'Greens', color: '#2ecc71' }, TEAMS[1]!]);
    await flushPromises();
    expect(received).toHaveLength(1);
    expect(received[0]?.teams.map((t) => t.name)).toEqual(['Greens', 'Blues']);
    rt.stop();
  });

  it('republishes the teams on every reconnect', async () => {
    // The phone attaches first, so the hub restores it before the stage (it is live when the stage speaks).
    const code = await services.data.rooms.openRoom(eventId);
    const received = await listenAsPhone(code);
    const rt = make();
    rt.start();
    await settle(rt);
    await flushPromises();
    received.length = 0;
    services.hub.simulateDisconnect(code);
    await flushPromises();
    expect(rt.getSnapshot().status).toBe('reconnecting');
    services.hub.simulateReconnect(code);
    await flushPromises();
    expect(rt.getSnapshot().status).toBe('connected');
    expect(received).toHaveLength(1);
    expect(received[0]?.teams).toEqual(TEAMS);
    services.hub.simulateDisconnect(code);
    services.hub.simulateReconnect(code);
    await flushPromises();
    expect(received).toHaveLength(2);
    rt.stop();
  });

  it('republishes the latest controls and audience state on reconnect', async () => {
    const code = await services.data.rooms.openRoom(eventId);
    const phone = new MemoryRoomTransport({ hub: services.hub });
    const kinds: string[] = [];
    phone.subscribe('stage', (m) => kinds.push(m.event));
    await phone.connect({ code, role: 'phone', team: 1 });
    const rt = make();
    rt.start();
    await settle(rt);
    await flushPromises();
    kinds.length = 0;
    rt.publishAudience({ phase: 'hub', paused: false, scores: [{ team: 1, score: 0 }] });
    await flushPromises();
    expect(kinds).toEqual(['audience']);
    rt.publishAudience({ phase: 'hub', paused: false, scores: [{ team: 1, score: 0 }] });
    await flushPromises();
    expect(kinds).toEqual(['audience']); // identical: not re-sent
    services.hub.simulateDisconnect(code);
    services.hub.simulateReconnect(code);
    await flushPromises();
    expect(kinds).toEqual(['audience', 'teams', 'audience']);
    rt.stop();
  });

  it('sends the teams and audience state to a phone that joins after the stage connected', async () => {
    const rt = make();
    rt.start();
    await settle(rt);
    rt.publishAudience({ phase: 'hub', paused: false, scores: [] });
    await flushPromises();
    const code = rt.getSnapshot().code ?? '';
    const phone = new MemoryRoomTransport({ hub: services.hub });
    const kinds: string[] = [];
    phone.subscribe('stage', (m) => kinds.push(m.event));
    await phone.connect({ code, role: 'phone', team: 2, nickname: 'Late' });
    await flushPromises();
    expect(kinds).toEqual(expect.arrayContaining(['teams', 'audience']));
    expect(rt.getSnapshot().roster.map((e) => e.nickname)).toEqual(['Late']);
    rt.stop();
  });

  it('keeps the room alive with touchRoom every 5 minutes', async () => {
    vi.useFakeTimers();
    const touch = vi.spyOn(services.data.rooms, 'touchRoom');
    const rt = make();
    rt.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(rt.getSnapshot().code).not.toBeNull();
    expect(touch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(TOUCH_ROOM_INTERVAL_MS);
    expect(touch).toHaveBeenCalledTimes(1);
    expect(touch).toHaveBeenCalledWith(rt.getSnapshot().code);
    await vi.advanceTimersByTimeAsync(TOUCH_ROOM_INTERVAL_MS);
    expect(touch).toHaveBeenCalledTimes(2);
    rt.stop();
    await vi.advanceTimersByTimeAsync(TOUCH_ROOM_INTERVAL_MS * 2);
    expect(touch).toHaveBeenCalledTimes(2);
  });

  it('survives a failing room and retries, leaving the bridges usable', async () => {
    vi.useFakeTimers();
    const open = vi.spyOn(services.data.rooms, 'openRoom').mockRejectedValueOnce(new Error('offline'));
    const rt = make();
    rt.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(rt.getSnapshot()).toMatchObject({ ready: true, code: null, error: 'offline' });
    expect(rt.getSnapshot().phones?.injectPress(1)).toBe('delivered');
    open.mockRestore();
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10);
    expect(rt.getSnapshot().status).toBe('connected');
    expect(rt.getSnapshot().error).toBeNull();
    rt.stop();
  });

  it('can be stopped and started again (React StrictMode mounts effects twice)', async () => {
    const rt = make();
    rt.start();
    rt.stop();
    rt.start();
    await settle(rt);
    expect(rt.getSnapshot().status).toBe('connected');
    expect(services.hub.clientCount(rt.getSnapshot().code ?? '')).toBe(1);
    rt.stop();
  });
});
