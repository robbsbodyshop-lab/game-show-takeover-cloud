/**
 * Behaviour every RoomTransport must share. Each implementation's test file calls
 * `runTransportContract` with a harness that knows how to build transports on a shared backend
 * and how to simulate a dropped connection (memory hub, or the fake Supabase backend).
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { logger } from '../lib/logger';
import type { ConnectionStatus, PresenceEntry, RoomTransport } from './RoomTransport';
import type { ParsedMessage } from './schemas';
import type { TopicKind } from './roomCodes';

export interface ContractHarness {
  /** A valid room code for this backend. */
  code: string;
  /** A new transport on the shared backend. */
  createTransport(): RoomTransport;
  /** Lets in-flight (microtask) deliveries finish. */
  settle(): Promise<void>;
  /** The connection of everyone in the room is lost. */
  drop(): Promise<void>;
  /** The backend is reachable again; resolves once clients have reconnected. */
  recover(): Promise<void>;
  teardown(): void;
}

interface Room {
  h: ContractHarness;
  stage: RoomTransport;
  host: RoomTransport;
  phone1: RoomTransport;
  phone2: RoomTransport;
}

function collect<K extends TopicKind>(transport: RoomTransport, topic: K): ParsedMessage<K>[] {
  const seen: ParsedMessage<K>[] = [];
  transport.subscribe(topic, (msg) => {
    seen.push(msg);
  });
  return seen;
}

function lastOf<T>(items: T[]): T | undefined {
  return items[items.length - 1];
}

export function runTransportContract(label: string, makeHarness: () => ContractHarness): void {
  describe(`RoomTransport contract: ${label}`, () => {
    let h: ContractHarness;
    let warn: MockInstance<typeof logger.warn>;

    beforeEach(() => {
      h = makeHarness();
      warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
      h.teardown();
      vi.restoreAllMocks();
    });

    async function openRoom(): Promise<Room> {
      const stage = h.createTransport();
      const host = h.createTransport();
      const phone1 = h.createTransport();
      const phone2 = h.createTransport();
      await stage.connect({ code: h.code, role: 'stage' });
      await host.connect({ code: h.code, role: 'host', nickname: 'Hosty' });
      await phone1.connect({ code: h.code, role: 'phone', team: 1, nickname: 'Ann' });
      await phone2.connect({ code: h.code, role: 'phone', team: 2, nickname: 'Bob' });
      await h.settle();
      warn.mockClear();
      return { h, stage, host, phone1, phone2 };
    }

    describe('connection', () => {
      it('starts offline, goes connecting then connected', async () => {
        const t = h.createTransport();
        const seen: ConnectionStatus[] = [];
        t.onStatus((s) => seen.push(s));
        expect(t.status).toBe('offline');
        await t.connect({ code: h.code, role: 'stage' });
        expect(t.status).toBe('connected');
        expect(seen).toEqual(['connecting', 'connected']);
      });

      it('disconnect returns to offline and is idempotent', async () => {
        const t = h.createTransport();
        const seen: ConnectionStatus[] = [];
        t.onStatus((s) => seen.push(s));
        await t.connect({ code: h.code, role: 'stage' });
        await t.disconnect();
        await t.disconnect();
        expect(t.status).toBe('offline');
        expect(seen).toEqual(['connecting', 'connected', 'offline']);
      });

      it('rejects a phone without a team and reports status error', async () => {
        const t = h.createTransport();
        const seen: ConnectionStatus[] = [];
        t.onStatus((s) => seen.push(s));
        await expect(t.connect({ code: h.code, role: 'phone' })).rejects.toThrow();
        expect(t.status).toBe('error');
        expect(seen).toContain('error');
      });

      it('rejects an invalid room code', async () => {
        const t = h.createTransport();
        await expect(t.connect({ code: 'no:pe', role: 'stage' })).rejects.toThrow();
        expect(t.status).toBe('error');
      });

      it('can connect again after a disconnect', async () => {
        const t = h.createTransport();
        await t.connect({ code: h.code, role: 'stage' });
        await t.disconnect();
        await t.connect({ code: h.code, role: 'host' });
        expect(t.status).toBe('connected');
      });
    });

    describe('press to ack flow', () => {
      it('delivers a phone press to the stage and the stage ack to every phone and host view', async () => {
        const { stage, host, phone1, phone2 } = await openRoom();
        const presses = collect(stage, 'phones');
        const acksP1 = collect(phone1, 'stage');
        const acksP2 = collect(phone2, 'stage');
        const acksHost = collect(host, 'stage');

        await phone1.publish('phones', 'press', { pressId: 'p-1', team: 1, at: 1000 });
        await h.settle();

        expect(presses).toHaveLength(1);
        const press = presses[0];
        expect(press?.event).toBe('press');
        expect(press?.message).toMatchObject({ v: 1, from: 'phone', pressId: 'p-1', team: 1, at: 1000 });
        expect(press?.message.sent).toBeGreaterThan(0);

        await stage.publish('stage', 'ack', { team: 1, pressId: 'p-1', accepted: true });
        await h.settle();

        for (const inbox of [acksP1, acksP2, acksHost]) {
          expect(inbox).toHaveLength(1);
          expect(inbox[0]?.message).toMatchObject({ from: 'stage', team: 1, pressId: 'p-1', accepted: true });
        }
        expect(warn).not.toHaveBeenCalled();
      });

      it('does not echo a message back to its sender', async () => {
        const { phone1 } = await openRoom();
        const ownPhones = collect(phone1, 'phones');
        await phone1.publish('phones', 'press', { pressId: 'p-1', team: 1, at: 1 });
        await h.settle();
        expect(ownPhones).toEqual([]);
      });

      it('does not let phones or host views read the phones topic', async () => {
        const { stage, host, phone1, phone2 } = await openRoom();
        const hostSeesPhones = collect(host, 'phones');
        const phone2SeesPhones = collect(phone2, 'phones');
        await phone1.publish('phones', 'press', { pressId: 'p-1', team: 1, at: 1 });
        await stage.publish('stage', 'audience', { phase: 'hub', paused: false, scores: [] });
        await h.settle();
        expect(hostSeesPhones).toEqual([]);
        expect(phone2SeesPhones).toEqual([]);
      });

      it('delivers action and feud-answer messages with their fields', async () => {
        const { stage, phone2 } = await openRoom();
        const inbox = collect(stage, 'phones');
        await phone2.publish('phones', 'action', {
          pressId: 'a-1',
          team: 2,
          action: 'solve',
          answer: 'HELLO',
        });
        await phone2.publish('phones', 'feud-answer', { pressId: 'f-1', team: 2, text: 'a banana' });
        await h.settle();
        expect(inbox.map((m) => m.event)).toEqual(['action', 'feud-answer']);
        expect(inbox[0]?.message).toMatchObject({ action: 'solve', answer: 'HELLO' });
        expect(inbox[1]?.message).toMatchObject({ text: 'a banana' });
      });
    });

    describe('per-team phones topics (FR-025, P-004)', () => {
      it('drops a press whose payload team differs from the sender team, and logs it', async () => {
        const { stage, phone2 } = await openRoom();
        const inbox = collect(stage, 'phones');
        // phone2 is on team 2 and claims to press for team 1
        await phone2.publish('phones', 'press', { pressId: 'forged', team: 1, at: 1 });
        await phone2.publish('phones', 'action', { pressId: 'forged-a', team: 1, action: 'buy' });
        await phone2.publish('phones', 'feud-answer', { pressId: 'forged-f', team: 1, text: 'x' });
        await h.settle();
        expect(inbox).toEqual([]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('payload claims team 1'));
      });

      it('stamps every phones message with the team of the topic it arrived on', async () => {
        const { stage, phone1, phone2 } = await openRoom();
        const inbox = collect(stage, 'phones');
        await phone1.publish('phones', 'press', { pressId: 'p-1', team: 1, at: 1 });
        await phone2.publish('phones', 'press', { pressId: 'p-2', team: 2, at: 2 });
        await phone2.publish('phones', 'feud-answer', { pressId: 'f-2', team: 2, text: 'ok' });
        await h.settle();
        expect(inbox.map((m) => [m.event, m.topicTeam, m.message.team])).toEqual([
          ['press', 1, 1],
          ['press', 2, 2],
          ['feud-answer', 2, 2],
        ]);
      });

      it('shows one roster for phones on different team topics', async () => {
        const stage = h.createTransport();
        let roster: PresenceEntry[] = [];
        stage.onPresence((r) => {
          roster = r;
        });
        await stage.connect({ code: h.code, role: 'stage' });
        const phone3 = h.createTransport();
        const phone8 = h.createTransport();
        await phone3.connect({ code: h.code, role: 'phone', team: 3, nickname: 'Cy' });
        await phone8.connect({ code: h.code, role: 'phone', team: 8, nickname: 'Di' });
        await h.settle();
        expect(roster.map((e) => [e.role, e.team, e.nickname])).toEqual([
          ['phone', 3, 'Cy'],
          ['phone', 8, 'Di'],
        ]);
        await phone3.disconnect();
        await h.settle();
        expect(roster.map((e) => e.team)).toEqual([8]);
      });
    });

    describe('controls fan-out', () => {
      it('sends teams, controls and audience to all phones and host views in order', async () => {
        const { stage, host, phone1, phone2 } = await openRoom();
        const inboxes = [collect(host, 'stage'), collect(phone1, 'stage'), collect(phone2, 'stage')];
        const own = collect(stage, 'stage');

        await stage.publish('stage', 'teams', { teams: [{ id: 1, name: 'Red', color: '#f00' }] });
        await stage.publish('stage', 'controls', {
          activeTeam: 1,
          canBuy: true,
          canSpin: false,
          canSolve: true,
          turnName: 'Red',
          offLabel: 'Wait',
        });
        await stage.publish('stage', 'audience', {
          phase: 'round',
          paused: false,
          scores: [{ team: 1, score: 100 }],
          clock: { endsAt: 123, label: 'Round' },
        });
        await h.settle();

        for (const inbox of inboxes) {
          expect(inbox.map((m) => m.event)).toEqual(['teams', 'controls', 'audience']);
        }
        const controls = inboxes[0]?.[1];
        expect(controls?.event === 'controls' && controls.message.activeTeam).toBe(1);
        expect(own).toEqual([]);
      });

      it('delivers asynchronously, never inside the publish call stack', async () => {
        const { stage, phone1 } = await openRoom();
        const inbox = collect(phone1, 'stage');
        const pending = stage.publish('stage', 'audience', { phase: 'hub', paused: true, scores: [] });
        expect(inbox).toHaveLength(0);
        await pending;
        await h.settle();
        expect(inbox).toHaveLength(1);
      });

      it('gives each subscriber its own copy', async () => {
        const { stage, host, phone1 } = await openRoom();
        const a = collect(host, 'stage');
        const b = collect(phone1, 'stage');
        await stage.publish('stage', 'teams', { teams: [{ id: 1, name: 'Red', color: '#f00' }] });
        await h.settle();
        expect(a[0]?.message).not.toBe(b[0]?.message);
      });
    });

    describe('host hello, snapshot, command, result', () => {
      it('runs the full host handshake', async () => {
        const { stage, host, phone1 } = await openRoom();
        const atStage = collect(stage, 'host');
        const atHost = collect(host, 'host');

        await host.publish('host', 'hello', { hostId: 'host-1' });
        await h.settle();
        expect(atStage.map((m) => m.event)).toEqual(['hello']);

        await stage.publish('host', 'snapshot', {
          kind: 'feud',
          gameRev: 4,
          inputLocked: false,
          data: { strikes: 1, answers: ['hidden'] },
        });
        await h.settle();
        expect(atHost.map((m) => m.event)).toEqual(['snapshot']);
        expect(atHost[0]?.event === 'snapshot' && atHost[0].message.data).toEqual({
          strikes: 1,
          answers: ['hidden'],
        });

        await host.publish('host', 'command', {
          cmdId: 'c-1',
          target: 'feud',
          gameRev: 4,
          teamId: 2,
          name: 'strike',
          args: { count: 1 },
        });
        await h.settle();
        expect(atStage.map((m) => m.event)).toEqual(['hello', 'command']);
        expect(atStage[1]?.event === 'command' && atStage[1].message).toMatchObject({
          cmdId: 'c-1',
          gameRev: 4,
        });

        await stage.publish('host', 'result', { cmdId: 'c-1', applied: false, reason: 'stale gameRev' });
        await h.settle();
        expect(atHost.map((m) => m.event)).toEqual(['snapshot', 'result']);
        expect(atHost[1]?.event === 'result' && atHost[1].message).toMatchObject({
          applied: false,
          reason: 'stale gameRev',
        });

        // Phones cannot read the host topic (hidden information).
        const phoneHostInbox = collect(phone1, 'host');
        await stage.publish('host', 'snapshot', { kind: 'hub', gameRev: 5, inputLocked: true, data: null });
        await h.settle();
        expect(phoneHostInbox).toEqual([]);
        expect(warn).toHaveBeenCalled(); // subscribing to a topic the role cannot read is warned about
      });

      it('lets several host views each see the stage snapshot', async () => {
        const { stage, host } = await openRoom();
        const host2 = h.createTransport();
        await host2.connect({ code: h.code, role: 'host', nickname: 'Second' });
        const inbox1 = collect(host, 'host');
        const inbox2 = collect(host2, 'host');
        await stage.publish('host', 'snapshot', { kind: 'hub', gameRev: 1, inputLocked: false, data: {} });
        await h.settle();
        expect(inbox1).toHaveLength(1);
        expect(inbox2).toHaveLength(1);
        // One host view's hello reaches the stage and the other host view, never itself.
        const hostsHear = collect(host2, 'host');
        await host.publish('host', 'hello', { hostId: 'a' });
        await h.settle();
        expect(hostsHear.map((m) => m.event)).toEqual(['hello']);
        expect(inbox1.map((m) => m.event)).toEqual(['snapshot']);
      });
    });

    describe('role guard', () => {
      it.each([
        ['phone -> stage topic', 'phone1', 'stage', 'ack', { team: 1, pressId: 'x', accepted: true }],
        ['phone -> host topic', 'phone1', 'host', 'hello', { hostId: 'x' }],
        ['host -> stage topic', 'host', 'stage', 'ack', { team: 1, pressId: 'x', accepted: true }],
        ['host -> phones topic', 'host', 'phones', 'press', { pressId: 'x', team: 1, at: 1 }],
        ['stage -> phones topic', 'stage', 'phones', 'press', { pressId: 'x', team: 1, at: 1 }],
        ['stage sends a host-only event', 'stage', 'host', 'hello', { hostId: 'x' }],
        [
          'host sends a stage-only event',
          'host',
          'host',
          'snapshot',
          { kind: 'hub', gameRev: 0, inputLocked: false, data: {} },
        ],
        ['event on the wrong topic', 'phone1', 'phones', 'ack', { team: 1, pressId: 'x', accepted: true }],
      ] as const)('drops and warns: %s', async (_name, who, topic, event, payload) => {
        const room = await openRoom();
        const sender = room[who];
        const inboxes = (['stage', 'phones', 'host'] as const).flatMap((t) => [
          collect(room.stage, t),
          ...(t === 'phones' ? [] : [collect(room.host, t)]),
          ...(t === 'stage' ? [collect(room.phone1, t), collect(room.phone2, t)] : []),
        ]);
        warn.mockClear();

        // The tables are typed per topic; the guard exists for callers that bypass the types.
        await (sender.publish as (t: string, e: string, p: unknown) => Promise<void>)(topic, event, payload);
        await h.settle();

        expect(warn).toHaveBeenCalledTimes(1);
        for (const inbox of inboxes) expect(inbox).toEqual([]);
      });

      it('drops an invalid payload locally with a warning', async () => {
        const { stage, phone1 } = await openRoom();
        const inbox = collect(stage, 'phones');
        warn.mockClear();
        await phone1.publish('phones', 'press', { pressId: 'x', team: 99, at: 1 });
        await h.settle();
        expect(inbox).toEqual([]);
        expect(warn).toHaveBeenCalled();
      });

      it('drops an oversized payload locally with a warning', async () => {
        const { stage, host } = await openRoom();
        const inbox = collect(host, 'host');
        warn.mockClear();
        await stage.publish('host', 'snapshot', {
          kind: 'hub',
          gameRev: 0,
          inputLocked: false,
          data: 'x'.repeat(40_000),
        });
        await h.settle();
        expect(inbox).toEqual([]);
        expect(warn).toHaveBeenCalled();
      });

      it('stamps the envelope itself and ignores one supplied by the caller', async () => {
        const { stage, phone1 } = await openRoom();
        const inbox = collect(stage, 'phones');
        const forged = { pressId: 'x', team: 1, at: 1, from: 'stage', v: 7, sent: 0 };
        await (phone1.publish as (t: string, e: string, p: unknown) => Promise<void>)(
          'phones',
          'press',
          forged,
        );
        await h.settle();
        expect(inbox).toHaveLength(1);
        expect(inbox[0]?.message).toMatchObject({ v: 1, from: 'phone' });
        expect(inbox[0]?.message.sent).toBeGreaterThan(0);
      });

      it('drops a publish while not connected, with a warning, without throwing', async () => {
        const t = h.createTransport();
        await expect(
          t.publish('stage', 'audience', { phase: 'x', paused: false, scores: [] }),
        ).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalled();
      });
    });

    describe('subscriptions', () => {
      it('stops delivering after unsubscribe and supports several handlers', async () => {
        const { stage, phone1 } = await openRoom();
        const a: unknown[] = [];
        const b: unknown[] = [];
        const offA = phone1.subscribe('stage', (m) => a.push(m));
        phone1.subscribe('stage', (m) => b.push(m));
        await stage.publish('stage', 'audience', { phase: 'a', paused: false, scores: [] });
        await h.settle();
        offA();
        await stage.publish('stage', 'audience', { phase: 'b', paused: false, scores: [] });
        await h.settle();
        expect(a).toHaveLength(1);
        expect(b).toHaveLength(2);
      });

      it('keeps delivering when one handler throws', async () => {
        const { stage, phone1 } = await openRoom();
        const errors = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
        const good: unknown[] = [];
        phone1.subscribe('stage', () => {
          throw new Error('boom');
        });
        phone1.subscribe('stage', (m) => good.push(m));
        await stage.publish('stage', 'audience', { phase: 'a', paused: false, scores: [] });
        await h.settle();
        expect(good).toHaveLength(1);
        expect(errors).toHaveBeenCalled();
      });

      it('receives nothing after disconnect', async () => {
        const { stage, phone1 } = await openRoom();
        const inbox = collect(phone1, 'stage');
        await phone1.disconnect();
        await stage.publish('stage', 'audience', { phase: 'a', paused: false, scores: [] });
        await h.settle();
        expect(inbox).toEqual([]);
      });

      it('keeps rooms separate', async () => {
        const { stage, phone1 } = await openRoom();
        const otherCode = h.code === 'BKDX' ? 'WZTV' : 'BKDX';
        const other = h.createTransport();
        await other.connect({ code: otherCode, role: 'stage' });
        const inbox = collect(other, 'stage');
        await stage.publish('stage', 'audience', { phase: 'a', paused: false, scores: [] });
        await h.settle();
        expect(inbox).toEqual([]);
        expect(phone1.status).toBe('connected');
      });
    });

    describe('presence roster', () => {
      it('shows phones and host views to the stage, and updates on join and leave', async () => {
        const stage = h.createTransport();
        let roster: PresenceEntry[] = [];
        stage.onPresence((r) => {
          roster = r;
        });
        await stage.connect({ code: h.code, role: 'stage' });
        const phone1 = h.createTransport();
        const phone2 = h.createTransport();
        const host = h.createTransport();
        await phone1.connect({ code: h.code, role: 'phone', team: 1, nickname: 'Ann' });
        await phone2.connect({ code: h.code, role: 'phone', team: 2, nickname: 'Bob' });
        await host.connect({ code: h.code, role: 'host', nickname: 'Hosty' });
        await h.settle();

        expect(roster.map((e) => [e.role, e.team, e.nickname])).toEqual([
          ['host', 0, 'Hosty'],
          ['phone', 1, 'Ann'],
          ['phone', 2, 'Bob'],
        ]);
        expect(new Set(roster.map((e) => e.key)).size).toBe(3);
        expect(roster.every((e) => e.ua.length > 0)).toBe(true);

        await phone1.disconnect();
        await h.settle();
        expect(roster.map((e) => e.nickname)).toEqual(['Hosty', 'Bob']);
      });

      it('shows host views to host views but nothing to phones', async () => {
        const { host, phone1 } = await openRoom();
        const rosterAtHost: PresenceEntry[][] = [];
        const rosterAtPhone: PresenceEntry[][] = [];
        host.onPresence((r) => rosterAtHost.push(r));
        phone1.onPresence((r) => rosterAtPhone.push(r));
        const host2 = h.createTransport();
        await host2.connect({ code: h.code, role: 'host', nickname: 'Second' });
        await h.settle();
        expect(
          lastOf(rosterAtHost)
            ?.map((e) => e.nickname)
            .sort(),
        ).toEqual(['Hosty', 'Second']);
        expect(lastOf(rosterAtHost)?.every((e) => e.role === 'host')).toBe(true);
        expect(rosterAtPhone).toEqual([]);
      });

      it('truncates long nicknames to the schema limit', async () => {
        const stage = h.createTransport();
        let roster: PresenceEntry[] = [];
        stage.onPresence((r) => {
          roster = r;
        });
        await stage.connect({ code: h.code, role: 'stage' });
        const phone = h.createTransport();
        await phone.connect({ code: h.code, role: 'phone', team: 3, nickname: 'N'.repeat(60) });
        await h.settle();
        expect(roster).toHaveLength(1);
        expect(roster[0]?.nickname).toHaveLength(24);
      });

      it('replaces the entry when a phone reconnects with the same key', async () => {
        const stage = h.createTransport();
        let roster: PresenceEntry[] = [];
        stage.onPresence((r) => {
          roster = r;
        });
        await stage.connect({ code: h.code, role: 'stage' });
        const phone = h.createTransport();
        await phone.connect({ code: h.code, role: 'phone', team: 1, nickname: 'Ann', key: 'user-1' });
        await h.settle();
        await phone.connect({ code: h.code, role: 'phone', team: 2, nickname: 'Ann', key: 'user-1' });
        await h.settle();
        expect(roster.map((e) => [e.key, e.team])).toEqual([['user-1', 2]]);
      });
    });

    describe('disconnect and reconnect', () => {
      it('reports reconnecting then connected, drops traffic during the outage, and recovers', async () => {
        const { stage, phone1, host } = await openRoom();
        const statuses: ConnectionStatus[] = [];
        phone1.onStatus((s) => statuses.push(s));
        const atPhone = collect(phone1, 'stage');
        const atStage = collect(stage, 'phones');
        let roster: PresenceEntry[] = [];
        stage.onPresence((r) => {
          roster = r;
        });

        await h.drop();
        expect(phone1.status).toBe('reconnecting');
        expect(host.status).toBe('reconnecting');

        warn.mockClear();
        await phone1.publish('phones', 'press', { pressId: 'lost', team: 1, at: 1 });
        await h.settle();
        expect(atStage).toEqual([]);
        expect(warn).toHaveBeenCalled();

        await h.recover();
        await h.settle();
        expect(phone1.status).toBe('connected');
        expect(statuses).toEqual(['reconnecting', 'connected']);

        await stage.publish('stage', 'audience', { phase: 'back', paused: false, scores: [] });
        await phone1.publish('phones', 'press', { pressId: 'again', team: 1, at: 2 });
        await h.settle();
        expect(atPhone.map((m) => m.event)).toEqual(['audience']);
        expect(atStage.map((m) => m.message)).toMatchObject([{ pressId: 'again' }]);
        expect(roster.map((e) => e.nickname)).toEqual(['Hosty', 'Ann', 'Bob']);
      });
    });
  });
}
