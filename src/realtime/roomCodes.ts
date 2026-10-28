/**
 * Room codes and channel topic names (design.md §3, §4, §5).
 *
 * Codes are 4 letters from 20 consonants (no vowels, so no accidental words): 160,000 codes.
 * The same pattern is enforced in Postgres by `rooms.code CHECK (code ~ '^[BCDFGHJKLMNPQRSTVWXZ]{4}$')`.
 */

export const ROOM_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';
export const ROOM_CODE_LENGTH = 4;

export const TOPIC_KINDS = ['stage', 'phones', 'host'] as const;
export type TopicKind = (typeof TOPIC_KINDS)[number];

const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${String(ROOM_CODE_LENGTH)}}$`);

/**
 * Loose shape accepted inside topic names. It is wider than `isRoomCode` only so that the in-memory
 * transport can host non-production codes (for example a demo room); its sole job is to guarantee
 * the code cannot contain `:` and so cannot forge another topic.
 */
const TOPIC_CODE_SHAPE = /^[A-Z0-9]{1,12}$/;

export function isTopicKind(value: unknown): value is TopicKind {
  return typeof value === 'string' && (TOPIC_KINDS as readonly string[]).includes(value);
}

/** True for a production room code: exactly 4 letters from `ROOM_CODE_ALPHABET`. */
export function isRoomCode(value: unknown): value is string {
  return typeof value === 'string' && ROOM_CODE_PATTERN.test(value);
}

/** Uppercases and strips whitespace, so "bk dx" typed on a phone becomes "BKDX". */
export function normalizeRoomCode(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

/** `rng` must behave like `Math.random`: a float in [0, 1). Injected so tests are deterministic. */
export function generateRoomCode(rng: () => number): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    const index = Math.min(
      ROOM_CODE_ALPHABET.length - 1,
      Math.max(0, Math.floor(rng() * ROOM_CODE_ALPHABET.length)),
    );
    code += ROOM_CODE_ALPHABET.charAt(index);
  }
  return code;
}

/** Team ids on the wire and in the phones topic: integers 1..8. */
export const MIN_TEAM = 1;
export const MAX_TOPIC_TEAM = 8;

export function isTeamId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= MIN_TEAM && (value as number) <= MAX_TOPIC_TEAM;
}

/**
 * `room:BKDX:stage`, `room:BKDX:host` and, for phones, `room:BKDX:phones:3`. The team is part of
 * the phones topic because RLS cannot read the message payload: the policy compares the topic's
 * team to the team in the caller's `room_members` row (FR-025, P-004).
 * Throws RangeError for a code that could break out of the topic format, or for a phones topic
 * without a team 1..8 (or a team on any other kind).
 */
export function topicFor(code: string, kind: TopicKind, team?: number): string {
  if (!TOPIC_CODE_SHAPE.test(code))
    throw new RangeError(`Invalid room code for topic: ${JSON.stringify(code)}`);
  if (kind === 'phones') {
    if (!isTeamId(team)) throw new RangeError(`A phones topic needs a team 1..8, got ${String(team)}`);
    return `room:${code}:phones:${String(team)}`;
  }
  if (team !== undefined) throw new RangeError(`The ${kind} topic has no team`);
  return `room:${code}:${kind}`;
}

export interface ParsedTopic {
  code: string;
  kind: TopicKind;
  /** Present exactly for the `phones` kind. */
  team?: number;
}

/** Inverse of `topicFor`; `null` for anything that is not one of our topics. */
export function parseTopic(topic: string): ParsedTopic | null {
  const parts = topic.split(':');
  if (parts[0] !== 'room') return null;
  const code = parts[1];
  const kind = parts[2];
  if (code === undefined || !TOPIC_CODE_SHAPE.test(code) || !isTopicKind(kind)) return null;
  if (kind === 'phones') {
    const teamPart = parts[3];
    if (parts.length !== 4 || teamPart === undefined || !/^[1-8]$/.test(teamPart)) return null;
    return { code, kind, team: Number(teamPart) };
  }
  if (parts.length !== 3) return null;
  return { code, kind };
}

/** Accepts a code in the loose topic shape (production codes and in-memory demo codes). */
export function isTopicCode(value: unknown): value is string {
  return typeof value === 'string' && TOPIC_CODE_SHAPE.test(value);
}
