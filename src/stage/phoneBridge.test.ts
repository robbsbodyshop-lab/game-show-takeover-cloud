import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRoomHub, MemoryRoomTransport, type AckMessage, type ControlsMessage } from '@/realtime';
import { IDLE_PHONE_CONTROLS } from './gameContract';
import { createPhoneBridge, type StagePhoneBridge } from './phoneBridge';
import { flushPromises } from './testKit';

const CODE = 'BCDF';

interface Rig {
  hub: MemoryRoomHub;
  stage: MemoryRoomTransport;
  phone: MemoryRoomTransport;
  bridge: StagePhoneBridge;
  teamIds: number[];
  clock: { t: number };
  controls: ControlsMessage[];
  acks: AckMessage[];
}

async function rig(): Promise<Rig> {
  const hub = new MemoryRoomHub();
  const clock = { t: 1000 };
  const stage = new MemoryRoomTransport({ hub, now: () => clock.t });
  const phone = new MemoryRoomTransport({ hub, now: () => clock.t });
  const teamIds = [1, 2, 3];
  const bridge = createPhoneBridge({ transport: stage, getTeamIds: () => teamIds, now: () => clock.t });
  await stage.connect({ code: CODE, role: 'stage' });
  await phone.connect({ code: CODE, role: 'phone', team: 1 });
  const controls: ControlsMessage[] = [];
  const acks: AckMessage[] = [];
  phone.subscribe('stage', (m) => {
    if (m.event === 'controls') controls.push(m.message);
    if (m.event === 'ack') acks.push(m.message);
  });
  return { hub, stage, phone, bridge, teamIds, clock, controls, acks };
}

const press = (r: Rig, team: number, pressId: string) =>
  r.phone.publish('phones', 'press', { pressId, team, at: r.clock.t });

describe('phone bridge', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('forwards phone presses, actions and typed answers to the registered handlers', async () => {
    const r = await rig();
    const presses: string[] = [];
    const actions: string[] = [];
    const answers: string[] = [];
    r.bridge.onPress((p) => presses.push(`${String(p.team)}:${p.pressId}`));
    r.bridge.onAction((a) => actions.push(`${String(a.team)}:${a.action}`));
    r.bridge.onFeudAnswer((a) => answers.push(a.text));
    await press(r, 1, 'p1');
    await r.phone.publish('phones', 'action', { pressId: 'a1', team: 1, action: 'spin' });
    await r.phone.publish('phones', 'feud-answer', { pressId: 'f1', team: 1, text: 'pizza' });
    await flushPromises();
    expect(presses).toEqual(['1:p1']);
    expect(actions).toEqual(['1:spin']);
    expect(answers).toEqual(['pizza']);
  });

  it('ignores teams that are not in the event', async () => {
    const r = await rig();
    const ghost = new MemoryRoomTransport({ hub: r.hub, now: () => r.clock.t });
    await ghost.connect({ code: CODE, role: 'phone', team: 7 });
    const seen = vi.fn();
    r.bridge.onPress(seen);
    await ghost.publish('phones', 'press', { pressId: 'ghost', team: 7, at: r.clock.t });
    await flushPromises();
    expect(seen).not.toHaveBeenCalled();
  });

  it('attributes messages to the topic team and drops a phone claiming another team (FR-025)', async () => {
    const r = await rig(); // r.phone is on team 1
    const presses: string[] = [];
    const actions: string[] = [];
    const answers: string[] = [];
    r.bridge.onPress((p) => presses.push(`${String(p.team)}:${p.pressId}`));
    r.bridge.onAction((a) => actions.push(`${String(a.team)}:${a.pressId}`));
    r.bridge.onFeudAnswer((a) => answers.push(`${String(a.team)}:${a.pressId}`));
    await press(r, 2, 'forged');
    await r.phone.publish('phones', 'action', { pressId: 'forged-a', team: 2, action: 'buy' });
    await r.phone.publish('phones', 'feud-answer', { pressId: 'forged-f', team: 2, text: 'x' });
    await flushPromises();
    expect(presses).toEqual([]);
    expect(actions).toEqual([]);
    expect(answers).toEqual([]);
  });

  it('delivers presses from phones on different teams, each under its own team', async () => {
    const r = await rig();
    const second = new MemoryRoomTransport({ hub: r.hub, now: () => r.clock.t });
    await second.connect({ code: CODE, role: 'phone', team: 2 });
    const seen: string[] = [];
    r.bridge.onPress((p) => seen.push(`${String(p.team)}:${p.pressId}`));
    await press(r, 1, 'a');
    await second.publish('phones', 'press', { pressId: 'b', team: 2, at: r.clock.t });
    await flushPromises();
    expect(seen.sort()).toEqual(['1:a', '2:b']);
  });

  it('rate limits presses to one per 150 ms per team, independently per team', async () => {
    const r = await rig();
    const seen: number[] = [];
    r.bridge.onPress((p) => seen.push(p.team));
    expect(r.bridge.injectPress(1)).toBe('delivered');
    r.clock.t += 149;
    expect(r.bridge.injectPress(1)).toBe('rate-limited');
    expect(r.bridge.injectPress(2)).toBe('delivered');
    r.clock.t += 1;
    expect(r.bridge.injectPress(1)).toBe('delivered');
    expect(seen).toEqual([1, 2, 1]);
  });

  it('treats a keyboard buzz like a phone press and refuses unknown teams', async () => {
    const r = await rig();
    const seen = vi.fn();
    r.bridge.onPress(seen);
    expect(r.bridge.injectPress(8)).toBe('unknown-team');
    expect(r.bridge.injectPress(3)).toBe('delivered');
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ team: 3, from: 'phone' }));
  });

  it('drops everything and acks a press as not accepted while locked', async () => {
    const r = await rig();
    const seen = vi.fn();
    r.bridge.onPress(seen);
    r.bridge.onAction(seen);
    r.bridge.setLocked(true);
    await press(r, 1, 'locked-1');
    await r.phone.publish('phones', 'action', { pressId: 'locked-2', team: 1, action: 'buy' });
    await flushPromises();
    expect(seen).not.toHaveBeenCalled();
    expect(r.acks.map((a) => [a.pressId, a.accepted])).toEqual([
      ['locked-1', false],
      ['locked-2', false],
    ]);
    expect(r.bridge.injectPress(1)).toBe('locked');
    r.bridge.setLocked(false);
    expect(r.bridge.injectPress(1)).toBe('delivered');
  });

  it('acks over the network but never acks a keyboard press', async () => {
    const r = await rig();
    r.bridge.ack(1, 'p9', true);
    r.bridge.ack(1, 'kb-1', true);
    await flushPromises();
    expect(r.acks).toHaveLength(1);
    expect(r.acks[0]).toMatchObject({ team: 1, pressId: 'p9', accepted: true });
  });

  it('publishes controls debounced by 50 ms and only the latest value', async () => {
    vi.useFakeTimers();
    const r = await rig();
    r.bridge.publishControls({ ...IDLE_PHONE_CONTROLS, turnName: 'one' });
    r.bridge.publishControls({ ...IDLE_PHONE_CONTROLS, turnName: 'two' });
    await vi.advanceTimersByTimeAsync(49);
    expect(r.controls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();
    expect(r.controls.map((c) => c.turnName)).toEqual(['two']);
  });

  it('does not resend identical controls, but republish() resends them after a reconnect', async () => {
    vi.useFakeTimers();
    const r = await rig();
    r.bridge.publishControls(IDLE_PHONE_CONTROLS);
    await vi.advanceTimersByTimeAsync(60);
    r.bridge.publishControls({ ...IDLE_PHONE_CONTROLS });
    await vi.advanceTimersByTimeAsync(60);
    await flushPromises();
    expect(r.controls).toHaveLength(1);
    r.bridge.republish();
    await flushPromises();
    expect(r.controls).toHaveLength(2);
  });

  it('stops listening after dispose', async () => {
    const r = await rig();
    const seen = vi.fn();
    r.bridge.onPress(seen);
    r.bridge.dispose();
    await press(r, 1, 'late');
    await flushPromises();
    expect(seen).not.toHaveBeenCalled();
  });
});

describe('phone bridge before the transport connects', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('keeps the latest controls and sends nothing while offline', async () => {
    const hub = new MemoryRoomHub();
    const stage = new MemoryRoomTransport({ hub });
    const bridge = createPhoneBridge({ transport: stage, getTeamIds: () => [1] });
    bridge.publishControls(IDLE_PHONE_CONTROLS);
    await vi.advanceTimersByTimeAsync(100);
    expect(stage.status).toBe('offline');
    // A keyboard buzz still works without a network (P-001).
    const seen = vi.fn();
    bridge.onPress(seen);
    expect(bridge.injectPress(1)).toBe('delivered');
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
