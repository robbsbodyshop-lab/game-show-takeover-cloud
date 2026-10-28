/**
 * Which topics each role joins, reads and publishes to (design.md §4 policies, §5).
 *
 * Both transports use these tables so the local guard is identical; the real security boundary is
 * the RLS policy on `realtime.messages`, this only stops honest bugs early and loudly.
 */
import { logger } from '../lib/logger';
import type { TopicKind } from './roomCodes';
import { isEventOf, parseMessage, PROTOCOL_VERSION, SENDER_OF, type Role } from './schemas';

/** One Realtime channel: a topic kind and, for `phones`, the team whose topic it is. */
export interface ChannelSpec {
  kind: TopicKind;
  team?: number;
}

/** Highest team id; the stage joins one phones topic per team. */
const TEAM_IDS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * Channels a client opens. A phone joins `stage` (to read) and only its own `phones:<team>` (to
 * send; it cannot read it). The stage joins `stage`, `host` and all eight `phones:<team>` topics,
 * so it hears every team; a host view joins `stage` and `host`. Eight plus two channels are far
 * below the 100 channels per connection limit.
 */
export function channelPlan(role: Role, team?: number): ChannelSpec[] {
  switch (role) {
    case 'stage':
      return [
        { kind: 'stage' },
        { kind: 'host' },
        ...TEAM_IDS.map((id): ChannelSpec => ({ kind: 'phones', team: id })),
      ];
    case 'host':
      return [{ kind: 'stage' }, { kind: 'host' }];
    case 'phone':
      return team === undefined ? [{ kind: 'stage' }] : [{ kind: 'stage' }, { kind: 'phones', team }];
  }
}

/** Topics whose messages a role may receive. */
export const READABLE_TOPICS: Readonly<Record<Role, readonly TopicKind[]>> = {
  stage: ['stage', 'phones', 'host'],
  host: ['stage', 'host'],
  phone: ['stage'],
};

/** Topics a role may publish to (stage: stage+host; host: host; phone: phones). */
export const PUBLISHABLE_TOPICS: Readonly<Record<Role, readonly TopicKind[]>> = {
  stage: ['stage', 'host'],
  host: ['host'],
  phone: ['phones'],
};

/** Topics where a role sees the presence roster. */
export const PRESENCE_READ_TOPICS: Readonly<Record<Role, readonly TopicKind[]>> = {
  stage: ['phones', 'host'],
  host: ['host'],
  phone: [],
};

/** Topic where a role announces itself with presence, if any. */
export const PRESENCE_TRACK_TOPIC: Readonly<Record<Role, TopicKind | null>> = {
  stage: null,
  host: 'host',
  phone: 'phones',
};

export function canRead(role: Role, topic: TopicKind): boolean {
  return READABLE_TOPICS[role].includes(topic);
}

export function canPublish(role: Role, topic: TopicKind, event: string): boolean {
  return PUBLISHABLE_TOPICS[role].includes(topic) && isEventOf(topic, event) && SENDER_OF[event] === role;
}

export type Outgoing = { ok: true; wire: Record<string, unknown> } | { ok: false; reason: string };

/**
 * Applies the role guard, adds the envelope and validates the result exactly as a receiver would
 * (size limit included). A rejection is logged here so both transports warn identically.
 */
export function prepareOutgoing(
  role: Role,
  topic: TopicKind,
  event: string,
  payload: unknown,
  sent: number,
): Outgoing {
  const reject = (reason: string): Outgoing => {
    logger.warn(`[realtime] ${role} may not publish "${event}" on topic ${topic}: ${reason}`);
    return { ok: false, reason };
  };
  if (!canPublish(role, topic, event)) return reject('not allowed for this role');
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return reject('payload must be an object');
  }
  // The envelope goes last so a payload can never override `v`, `from` or `sent`.
  const wire: Record<string, unknown> = { ...payload, v: PROTOCOL_VERSION, from: role, sent };
  if (parseMessage(topic, event, wire) === null) return reject('payload failed validation');
  return { ok: true, wire };
}
