/**
 * Wire protocol for the three room topics (design.md §5), validated with zod on receipt.
 *
 * Every message carries the envelope `{ v: 1, from, sent }`. `from` is fixed per event (for example
 * `press` can only come from a phone), so a message that claims the wrong sender is dropped even if
 * its body is well formed. Unknown events, invalid bodies and oversized payloads make `parseMessage`
 * return `null`; it never throws (conventions: unknown messages are dropped and logged).
 */
// zod/mini: the tree-shakable build. The phone bundles this file, and full zod would cost ~25 KB gzipped (NFR-004).
import * as z from 'zod/mini';
import { logger } from '../lib/logger';
import type { TopicKind } from './roomCodes';

export const PROTOCOL_VERSION = 1;
/** Payloads stay under 32 KB (design.md §5); the hosted limit is 256 KB. */
export const MAX_PAYLOAD_BYTES = 32 * 1024;

export const ROLES = ['stage', 'host', 'phone'] as const;
export type Role = (typeof ROLES)[number];

export const MAX_TEAMS = 8;
export const MAX_NICKNAME_LENGTH = 24;

// ---------------------------------------------------------------------------------------------
// Building blocks

const envelope = <F extends Role>(from: F) =>
  ({
    v: z.literal(PROTOCOL_VERSION),
    from: z.literal(from),
    sent: z.int().check(z.nonnegative()),
  }) as const;

/** Team numbers are 1..MAX_TEAMS everywhere (rooms.room_members.team CHECK 1..8). */
const teamId = z.int().check(z.minimum(1), z.maximum(MAX_TEAMS));
const shortText = (max: number) => z.string().check(z.maxLength(max));
const boundedText = (min: number, max: number) => z.string().check(z.minLength(min), z.maxLength(max));
const idText = boundedText(1, 64);
const nonNegativeInt = z.int().check(z.nonnegative());

export const PHONE_ACTIONS = ['buy', 'spin', 'solve', 'solve-start', 'solve-cancel'] as const;
export type PhoneAction = (typeof PHONE_ACTIONS)[number];

// ---------------------------------------------------------------------------------------------
// Topic `room:<code>:stage` (stage -> everyone)

export const teamsMessageSchema = z.object({
  ...envelope('stage'),
  teams: z
    .array(z.object({ id: teamId, name: boundedText(1, 40), color: boundedText(1, 32) }))
    .check(z.maxLength(MAX_TEAMS)),
});

export const controlsMessageSchema = z.object({
  ...envelope('stage'),
  activeTeam: z.nullable(teamId),
  canBuy: z.boolean(),
  canSpin: z.boolean(),
  canSolve: z.boolean(),
  turnName: shortText(80),
  buzzTeams: z.optional(z.array(teamId).check(z.maxLength(MAX_TEAMS))),
  offLabel: z.optional(shortText(80)),
});

export const ackMessageSchema = z.object({
  ...envelope('stage'),
  team: teamId,
  pressId: idText,
  accepted: z.boolean(),
});

export const audienceMessageSchema = z.object({
  ...envelope('stage'),
  phase: shortText(40),
  paused: z.boolean(),
  scores: z.array(z.object({ team: teamId, score: z.int() })).check(z.maxLength(MAX_TEAMS)),
  clock: z.optional(z.object({ endsAt: nonNegativeInt, label: shortText(40) })),
});

// ---------------------------------------------------------------------------------------------
// Topic `room:<code>:phones` (phone -> stage)

export const pressMessageSchema = z.object({
  ...envelope('phone'),
  pressId: idText,
  team: teamId,
  at: nonNegativeInt,
});

export const actionMessageSchema = z.object({
  ...envelope('phone'),
  pressId: idText,
  team: teamId,
  action: z.enum(PHONE_ACTIONS),
  answer: z.optional(shortText(200)),
});

export const feudAnswerMessageSchema = z.object({
  ...envelope('phone'),
  pressId: idText,
  team: teamId,
  text: shortText(300),
});

// ---------------------------------------------------------------------------------------------
// Topic `room:<code>:host` (stage <-> host views)

export const helloMessageSchema = z.object({
  ...envelope('host'),
  hostId: idText,
});

export const snapshotMessageSchema = z.object({
  ...envelope('stage'),
  /** 'hub' | 'feud' | 'wheel' | 'puzzle' | ... (open set, owned by the game modules). */
  kind: boundedText(1, 32),
  gameRev: nonNegativeInt,
  inputLocked: z.boolean(),
  /** Host-view snapshot of the running engine; its shape belongs to each game, not the transport. */
  data: z.unknown(),
});

export const commandMessageSchema = z.object({
  ...envelope('host'),
  cmdId: idText,
  target: boundedText(1, 32),
  gameRev: nonNegativeInt,
  teamId: z.optional(teamId),
  name: boundedText(1, 64),
  args: z.optional(z.record(z.string(), z.unknown())),
});

export const resultMessageSchema = z.object({
  ...envelope('stage'),
  cmdId: idText,
  applied: z.boolean(),
  reason: z.optional(shortText(200)),
});

/** Presence payload tracked on the phones topic (phones) and the host topic (host views). */
export const presencePayloadSchema = z.object({
  /** 1..8 for a phone; 0 for a host view, which belongs to no team. */
  team: z.int().check(z.minimum(0), z.maximum(MAX_TEAMS)),
  nickname: shortText(MAX_NICKNAME_LENGTH),
  ua: shortText(200),
});

// ---------------------------------------------------------------------------------------------
// Types

type Body<M> = Omit<M, 'v' | 'from' | 'sent'>;

export type TeamsMessage = z.infer<typeof teamsMessageSchema>;
export type ControlsMessage = z.infer<typeof controlsMessageSchema>;
export type AckMessage = z.infer<typeof ackMessageSchema>;
export type AudienceMessage = z.infer<typeof audienceMessageSchema>;
export type PressMessage = z.infer<typeof pressMessageSchema>;
export type ActionMessage = z.infer<typeof actionMessageSchema>;
export type FeudAnswerMessage = z.infer<typeof feudAnswerMessageSchema>;
export type HelloMessage = z.infer<typeof helloMessageSchema>;
export type SnapshotMessage = z.infer<typeof snapshotMessageSchema>;
export type CommandMessage = z.infer<typeof commandMessageSchema>;
export type ResultMessage = z.infer<typeof resultMessageSchema>;
export type PresencePayload = z.infer<typeof presencePayloadSchema>;

/** Full wire message (envelope included) by topic and event. */
export interface MessageMap {
  stage: { teams: TeamsMessage; controls: ControlsMessage; ack: AckMessage; audience: AudienceMessage };
  phones: { press: PressMessage; action: ActionMessage; 'feud-answer': FeudAnswerMessage };
  host: { hello: HelloMessage; snapshot: SnapshotMessage; command: CommandMessage; result: ResultMessage };
}

export type EventNameFor<K extends TopicKind> = keyof MessageMap[K] & string;

/** What a caller passes to `publish`: the message without its envelope (the transport adds it). */
export type PayloadFor<K extends TopicKind, E extends EventNameFor<K>> = Body<MessageMap[K][E]>;

interface UnstampedEvent<K extends TopicKind, E extends EventNameFor<K>> {
  topic: K;
  event: E;
  message: MessageMap[K][E];
}

/**
 * Phones messages also carry `topicTeam`: the team of the topic they arrived on
 * (`room:<CODE>:phones:<TEAM>`). RLS only lets a phone publish on its own team's topic, so this,
 * unlike `message.team`, cannot be forged. The transports guarantee `message.team === topicTeam`
 * (a mismatch is dropped and logged).
 */
export type ParsedEvent<K extends TopicKind, E extends EventNameFor<K>> = UnstampedEvent<K, E> &
  (K extends 'phones' ? { topicTeam: number } : unknown);

/** Discriminated on `event` for a given topic. */
export type ParsedMessage<K extends TopicKind> = K extends TopicKind
  ? { [E in EventNameFor<K>]: ParsedEvent<K, E> }[EventNameFor<K>]
  : never;

/** What `parseMessage` returns: a parsed message that has not been tied to a topic team yet. */
export type UnstampedMessage<K extends TopicKind> = K extends TopicKind
  ? { [E in EventNameFor<K>]: UnstampedEvent<K, E> }[EventNameFor<K>]
  : never;

// ---------------------------------------------------------------------------------------------
// Registry

const SCHEMAS = {
  stage: {
    teams: teamsMessageSchema,
    controls: controlsMessageSchema,
    ack: ackMessageSchema,
    audience: audienceMessageSchema,
  },
  phones: {
    press: pressMessageSchema,
    action: actionMessageSchema,
    'feud-answer': feudAnswerMessageSchema,
  },
  host: {
    hello: helloMessageSchema,
    snapshot: snapshotMessageSchema,
    command: commandMessageSchema,
    result: resultMessageSchema,
  },
} as const;

export const EVENTS_BY_TOPIC: { readonly [K in TopicKind]: readonly EventNameFor<K>[] } = {
  stage: ['teams', 'controls', 'ack', 'audience'],
  phones: ['press', 'action', 'feud-answer'],
  host: ['hello', 'snapshot', 'command', 'result'],
};

/** Who may originate each event (matches the `from` literal in its schema). */
export const SENDER_OF: Readonly<Record<string, Role>> = {
  teams: 'stage',
  controls: 'stage',
  ack: 'stage',
  audience: 'stage',
  press: 'phone',
  action: 'phone',
  'feud-answer': 'phone',
  hello: 'host',
  snapshot: 'stage',
  command: 'host',
  result: 'stage',
};

export function isEventOf<K extends TopicKind>(topic: K, event: string): event is EventNameFor<K> {
  return (EVENTS_BY_TOPIC[topic] as readonly string[]).includes(event);
}

/** True when the serialised payload is at most `MAX_PAYLOAD_BYTES` UTF-8 bytes. Never throws. */
export function payloadWithinLimit(raw: unknown): boolean {
  try {
    // JSON.stringify returns undefined (despite its declared type) for undefined, functions, symbols.
    const text = JSON.stringify(raw) as string | undefined;
    if (text === undefined) return false;
    // UTF-8 is at most 3 bytes per UTF-16 code unit, so short strings need no encoding pass.
    if (text.length * 3 <= MAX_PAYLOAD_BYTES) return true;
    return new TextEncoder().encode(text).length <= MAX_PAYLOAD_BYTES;
  } catch {
    return false;
  }
}

/**
 * Validates one inbound broadcast. `null` means "drop it": unknown topic/event, oversized, not an
 * object, wrong envelope or sender, or an invalid body. Never throws.
 */
export function parseMessage<K extends TopicKind>(
  topic: K,
  event: string,
  raw: unknown,
): UnstampedMessage<K> | null {
  try {
    const table: Readonly<Record<string, z.ZodMiniType>> = SCHEMAS[topic];
    if (!Object.hasOwn(table, event)) {
      logger.warn(`[realtime] dropped unknown event "${event.slice(0, 40)}" on topic ${topic}`);
      return null;
    }
    const schema = table[event];
    if (schema === undefined) return null;
    if (!payloadWithinLimit(raw)) {
      logger.warn(`[realtime] dropped oversized or unserialisable "${event}" on topic ${topic}`);
      return null;
    }
    const result = schema.safeParse(raw);
    if (!result.success) {
      const issue = result.error.issues[0];
      const where = issue ? issue.path.join('.') : '';
      logger.warn(`[realtime] dropped invalid "${event}" on topic ${topic} (${where || 'body'})`);
      return null;
    }
    // The registry is looked up by string, so the precise per-event type is asserted here once.
    return { topic, event, message: result.data } as unknown as UnstampedMessage<K>;
  } catch {
    return null;
  }
}

/**
 * `parseMessage` for the phones topic: stamps the topic's team on the result and drops (with a
 * warning) a message whose payload `team` differs from it, i.e. a phone claiming another team.
 */
export function parsePhonesMessage(
  event: string,
  raw: unknown,
  topicTeam: number,
): ParsedMessage<'phones'> | null {
  const parsed = parseMessage('phones', event, raw);
  if (parsed === null) return null;
  if (parsed.message.team !== topicTeam) {
    logger.warn(
      `[realtime] dropped "${event}" on phones topic of team ${String(topicTeam)}: payload claims team ${String(parsed.message.team)}`,
    );
    return null;
  }
  return { ...parsed, topicTeam };
}

/** Validates a presence payload; `null` when it does not match `{ team, nickname, ua }`. */
export function parsePresencePayload(raw: unknown): PresencePayload | null {
  const result = presencePayloadSchema.safeParse(raw);
  return result.success ? result.data : null;
}
