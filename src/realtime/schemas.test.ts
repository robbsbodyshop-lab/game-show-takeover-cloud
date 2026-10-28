import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../lib/logger';
import { MAX_PAYLOAD_BYTES, parseMessage, parsePresencePayload, payloadWithinLimit } from './schemas';
import type { TopicKind } from './roomCodes';

const env = (from: 'stage' | 'host' | 'phone') => ({ v: 1, from, sent: 1_700_000_000_000 });

interface Case {
  topic: TopicKind;
  event: string;
  valid: Record<string, unknown>;
}

const cases: Case[] = [
  {
    topic: 'stage',
    event: 'teams',
    valid: {
      ...env('stage'),
      teams: [
        { id: 1, name: 'Red', color: '#e33' },
        { id: 2, name: 'Blue', color: '#33e' },
      ],
    },
  },
  {
    topic: 'stage',
    event: 'controls',
    valid: {
      ...env('stage'),
      activeTeam: 2,
      canBuy: true,
      canSpin: false,
      canSolve: true,
      turnName: 'Blue',
      buzzTeams: [1, 2],
      offLabel: 'Not your turn',
    },
  },
  { topic: 'stage', event: 'ack', valid: { ...env('stage'), team: 3, pressId: 'p-1', accepted: false } },
  {
    topic: 'stage',
    event: 'audience',
    valid: {
      ...env('stage'),
      phase: 'face-off',
      paused: false,
      scores: [
        { team: 1, score: 300 },
        { team: 2, score: -50 },
      ],
      clock: { endsAt: 1_700_000_030_000, label: 'Round' },
    },
  },
  {
    topic: 'phones',
    event: 'press',
    valid: { ...env('phone'), pressId: 'p-1', team: 1, at: 1_700_000_000_123 },
  },
  {
    topic: 'phones',
    event: 'action',
    valid: { ...env('phone'), pressId: 'p-2', team: 4, action: 'solve', answer: 'WHEEL OF FORTUNE' },
  },
  {
    topic: 'phones',
    event: 'feud-answer',
    valid: { ...env('phone'), pressId: 'p-3', team: 5, text: 'a banana' },
  },
  { topic: 'host', event: 'hello', valid: { ...env('host'), hostId: 'host-1' } },
  {
    topic: 'host',
    event: 'snapshot',
    valid: { ...env('stage'), kind: 'feud', gameRev: 12, inputLocked: false, data: { board: [1, 2, 3] } },
  },
  {
    topic: 'host',
    event: 'command',
    valid: {
      ...env('host'),
      cmdId: 'c-1',
      target: 'feud',
      gameRev: 12,
      teamId: 2,
      name: 'strike',
      args: { n: 1 },
    },
  },
  {
    topic: 'host',
    event: 'result',
    valid: { ...env('stage'), cmdId: 'c-1', applied: false, reason: 'stale gameRev' },
  },
];

beforeEach(() => {
  vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
});

describe('parseMessage accepts every message in design.md section 5', () => {
  it.each(cases)('$topic/$event', ({ topic, event, valid }) => {
    const parsed = parseMessage(topic, event, valid);
    expect(parsed).not.toBeNull();
    expect(parsed?.topic).toBe(topic);
    expect(parsed?.event).toBe(event);
    expect(parsed?.message).toMatchObject(valid);
  });

  it('accepts minimal forms without optional fields', () => {
    expect(
      parseMessage('stage', 'controls', {
        ...env('stage'),
        activeTeam: null,
        canBuy: false,
        canSpin: false,
        canSolve: false,
        turnName: '',
      }),
    ).not.toBeNull();
    expect(
      parseMessage('stage', 'audience', { ...env('stage'), phase: 'hub', paused: true, scores: [] }),
    ).not.toBeNull();
    expect(
      parseMessage('host', 'command', {
        ...env('host'),
        cmdId: 'c',
        target: 'hub',
        gameRev: 0,
        name: 'pause',
      }),
    ).not.toBeNull();
    expect(
      parseMessage('phones', 'action', { ...env('phone'), pressId: 'x', team: 1, action: 'buy' }),
    ).not.toBeNull();
  });

  it('strips unknown extra keys instead of failing (forward compatible)', () => {
    const parsed = parseMessage('phones', 'press', { ...cases[4]?.valid, extra: 'ignored' });
    expect(parsed).not.toBeNull();
    expect(parsed?.message).not.toHaveProperty('extra');
  });
});

describe('parseMessage rejects bad input', () => {
  const press = { ...env('phone'), pressId: 'p-1', team: 1, at: 1 };

  it.each<[string, TopicKind, string, unknown]>([
    ['unknown event', 'phones', 'shout', press],
    ['event from another topic', 'phones', 'teams', press],
    ['prototype key as event', 'stage', 'constructor', {}],
    ['__proto__ as event', 'stage', '__proto__', {}],
    ['null', 'phones', 'press', null],
    ['undefined', 'phones', 'press', undefined],
    ['string', 'phones', 'press', 'press'],
    ['array', 'phones', 'press', [press]],
    ['empty object', 'phones', 'press', {}],
    ['missing v', 'phones', 'press', { from: 'phone', sent: 1, pressId: 'p', team: 1, at: 1 }],
    ['wrong version', 'phones', 'press', { ...press, v: 2 }],
    ['version as string', 'phones', 'press', { ...press, v: '1' }],
    ['missing from', 'phones', 'press', { v: 1, sent: 1, pressId: 'p', team: 1, at: 1 }],
    ['phone claims to be stage', 'phones', 'press', { ...press, from: 'stage' }],
    [
      'host claims to be phone',
      'host',
      'command',
      { ...env('phone'), cmdId: 'c', target: 'feud', gameRev: 0, name: 'x' },
    ],
    ['phone sends a stage event', 'stage', 'ack', { ...env('phone'), team: 1, pressId: 'p', accepted: true }],
    ['stage sends hello', 'host', 'hello', { ...env('stage'), hostId: 'h' }],
    ['negative sent', 'phones', 'press', { ...press, sent: -1 }],
    ['fractional sent', 'phones', 'press', { ...press, sent: 1.5 }],
    ['team 0', 'phones', 'press', { ...press, team: 0 }],
    ['team 9', 'phones', 'press', { ...press, team: 9 }],
    ['team as string', 'phones', 'press', { ...press, team: '1' }],
    ['empty pressId', 'phones', 'press', { ...press, pressId: '' }],
    ['pressId too long', 'phones', 'press', { ...press, pressId: 'x'.repeat(65) }],
    ['missing at', 'phones', 'press', { ...env('phone'), pressId: 'p', team: 1 }],
    ['unknown action', 'phones', 'action', { ...env('phone'), pressId: 'p', team: 1, action: 'cheat' }],
    [
      'answer too long',
      'phones',
      'action',
      { ...env('phone'), pressId: 'p', team: 1, action: 'solve', answer: 'x'.repeat(201) },
    ],
    [
      'feud text too long',
      'phones',
      'feud-answer',
      { ...env('phone'), pressId: 'p', team: 1, text: 'x'.repeat(301) },
    ],
    ['feud text not a string', 'phones', 'feud-answer', { ...env('phone'), pressId: 'p', team: 1, text: 5 }],
    [
      'teams with 9 entries',
      'stage',
      'teams',
      {
        ...env('stage'),
        teams: Array.from({ length: 9 }, (_, i) => ({ id: 1 + (i % 8), name: 'T', color: '#fff' })),
      },
    ],
    [
      'team with empty name',
      'stage',
      'teams',
      { ...env('stage'), teams: [{ id: 1, name: '', color: '#fff' }] },
    ],
    ['team missing color', 'stage', 'teams', { ...env('stage'), teams: [{ id: 1, name: 'A' }] }],
    [
      'controls missing canBuy',
      'stage',
      'controls',
      { ...env('stage'), activeTeam: 1, canSpin: true, canSolve: true, turnName: 'A' },
    ],
    [
      'controls canBuy not boolean',
      'stage',
      'controls',
      { ...env('stage'), activeTeam: 1, canBuy: 'yes', canSpin: true, canSolve: true, turnName: 'A' },
    ],
    [
      'controls activeTeam 12',
      'stage',
      'controls',
      { ...env('stage'), activeTeam: 12, canBuy: true, canSpin: true, canSolve: true, turnName: 'A' },
    ],
    ['ack accepted missing', 'stage', 'ack', { ...env('stage'), team: 1, pressId: 'p' }],
    [
      'audience scores not array',
      'stage',
      'audience',
      { ...env('stage'), phase: 'x', paused: false, scores: 3 },
    ],
    [
      'audience fractional score',
      'stage',
      'audience',
      { ...env('stage'), phase: 'x', paused: false, scores: [{ team: 1, score: 1.5 }] },
    ],
    [
      'audience clock missing label',
      'stage',
      'audience',
      { ...env('stage'), phase: 'x', paused: false, scores: [], clock: { endsAt: 5 } },
    ],
    ['hello without hostId', 'host', 'hello', env('host')],
    [
      'snapshot negative gameRev',
      'host',
      'snapshot',
      { ...env('stage'), kind: 'feud', gameRev: -1, inputLocked: false, data: {} },
    ],
    [
      'snapshot empty kind',
      'host',
      'snapshot',
      { ...env('stage'), kind: '', gameRev: 0, inputLocked: false, data: {} },
    ],
    [
      'command empty name',
      'host',
      'command',
      { ...env('host'), cmdId: 'c', target: 'feud', gameRev: 0, name: '' },
    ],
    [
      'command args array',
      'host',
      'command',
      { ...env('host'), cmdId: 'c', target: 'feud', gameRev: 0, name: 'x', args: [1] },
    ],
    [
      'command teamId 0',
      'host',
      'command',
      { ...env('host'), cmdId: 'c', target: 'feud', gameRev: 0, name: 'x', teamId: 0 },
    ],
    ['result applied missing', 'host', 'result', { ...env('stage'), cmdId: 'c' }],
  ])('%s', (_name, topic, event, raw) => {
    expect(parseMessage(topic, event, raw)).toBeNull();
  });

  it('never throws, even for hostile values', () => {
    const circular: Record<string, unknown> = { ...press };
    circular.self = circular;
    const hostile: unknown[] = [
      circular,
      BigInt(1),
      Symbol('x'),
      () => 1,
      new Date(),
      Object.create(null),
      NaN,
    ];
    for (const raw of hostile) {
      expect(() => parseMessage('phones', 'press', raw)).not.toThrow();
      expect(parseMessage('phones', 'press', raw)).toBeNull();
    }
  });

  it('logs a warning for dropped messages', () => {
    parseMessage('phones', 'press', { nope: true });
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('payload size guard (32 KB)', () => {
  const base = { ...env('phone'), pressId: 'p', team: 1 };

  it('has the documented limit', () => {
    expect(MAX_PAYLOAD_BYTES).toBe(32 * 1024);
  });

  it('accepts a payload just under the limit', () => {
    const overhead = JSON.stringify({ ...base, action: 'solve', answer: '' }).length;
    expect(overhead).toBeLessThan(400);
    // answer is capped at 200 chars, so use the snapshot `data` field to reach the limit.
    const room =
      MAX_PAYLOAD_BYTES -
      JSON.stringify({ ...env('stage'), kind: 'feud', gameRev: 0, inputLocked: false, data: '' }).length -
      16;
    const msg = { ...env('stage'), kind: 'feud', gameRev: 0, inputLocked: false, data: 'x'.repeat(room) };
    expect(payloadWithinLimit(msg)).toBe(true);
    expect(parseMessage('host', 'snapshot', msg)).not.toBeNull();
  });

  it('rejects a payload over the limit', () => {
    const msg = {
      ...env('stage'),
      kind: 'feud',
      gameRev: 0,
      inputLocked: false,
      data: 'x'.repeat(MAX_PAYLOAD_BYTES),
    };
    expect(payloadWithinLimit(msg)).toBe(false);
    expect(parseMessage('host', 'snapshot', msg)).toBeNull();
  });

  it('measures bytes, not characters', () => {
    // 11,000 snowmen are 11,000 characters but 33,000 UTF-8 bytes.
    const msg = { ...env('stage'), kind: 'feud', gameRev: 0, inputLocked: false, data: '☃'.repeat(11_000) };
    expect(JSON.stringify(msg).length).toBeLessThan(MAX_PAYLOAD_BYTES);
    expect(payloadWithinLimit(msg)).toBe(false);
    expect(parseMessage('host', 'snapshot', msg)).toBeNull();
  });

  it('treats unserialisable values as too large', () => {
    expect(payloadWithinLimit(undefined)).toBe(false);
    expect(payloadWithinLimit(BigInt(1))).toBe(false);
  });
});

describe('parsePresencePayload', () => {
  it.each([
    [{ team: 1, nickname: 'Sam', ua: 'Mozilla/5.0' }, true],
    [{ team: 0, nickname: 'Host', ua: 'x' }, true],
    [{ team: 8, nickname: '', ua: '' }, true],
    [{ team: 9, nickname: 'Sam', ua: 'x' }, false],
    [{ team: -1, nickname: 'Sam', ua: 'x' }, false],
    [{ team: 1, nickname: 'x'.repeat(25), ua: 'x' }, false],
    [{ team: 1, nickname: 'Sam' }, false],
    [{ team: '1', nickname: 'Sam', ua: 'x' }, false],
    [null, false],
    ['Sam', false],
  ])('%j -> %s', (raw, ok) => {
    expect(parsePresencePayload(raw) !== null).toBe(ok);
  });

  it('drops the presence_ref that Supabase adds', () => {
    const parsed = parsePresencePayload({ presence_ref: 'abc', team: 2, nickname: 'Ann', ua: 'u' });
    expect(parsed).toEqual({ team: 2, nickname: 'Ann', ua: 'u' });
  });
});
