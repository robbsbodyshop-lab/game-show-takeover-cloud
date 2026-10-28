/**
 * Messages on the same-browser `BroadcastChannel('gst-host')` mirror. Same four events as the
 * realtime `host` topic, validated with zod on receipt like every other boundary (TD-008).
 */
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { SNAPSHOT_KINDS } from './hostProtocol';

const cmdId = z.string().min(1).max(64);

export const bcMessageSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('snapshot'),
    /** Sender clock, so the host view can ignore a late copy that arrives after a newer one. */
    sent: z.number(),
    snapshot: z.object({
      kind: z.enum(SNAPSHOT_KINDS),
      gameRev: z.int().nonnegative(),
      inputLocked: z.boolean(),
      data: z.unknown(),
    }),
  }),
  z.object({ t: z.literal('hello'), hostId: z.string().min(1).max(64) }),
  z.object({
    t: z.literal('command'),
    command: z.object({
      cmdId,
      target: z.enum(SNAPSHOT_KINDS),
      gameRev: z.int().nonnegative(),
      teamId: z.int().min(1).max(8).optional(),
      name: z.string().min(1).max(64),
      args: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
  z.object({ t: z.literal('result'), cmdId, applied: z.boolean(), reason: z.string().max(200).optional() }),
]);

export type BcMessage = z.infer<typeof bcMessageSchema>;

export function parseBcMessage(raw: unknown): BcMessage | null {
  const parsed = bcMessageSchema.safeParse(raw);
  if (!parsed.success) {
    logger.debug('[host] dropped an invalid BroadcastChannel message');
    return null;
  }
  return parsed.data;
}

export interface BroadcastLink {
  post(message: BcMessage): void;
  /** Listens for valid messages; returns unsubscribe. */
  listen(handler: (message: BcMessage) => void): () => void;
  close(): void;
}

/** Opens the mirror, or returns null where `BroadcastChannel` does not exist or throws. */
export function openBroadcastLink(name: string): BroadcastLink | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  let channel: BroadcastChannel;
  try {
    channel = new BroadcastChannel(name);
  } catch {
    return null;
  }
  return {
    post(message) {
      try {
        channel.postMessage(message);
      } catch (error) {
        logger.warn('[host] BroadcastChannel post failed', error);
      }
    },
    listen(handler) {
      const onMessage = (event: MessageEvent) => {
        const message = parseBcMessage(event.data);
        if (message !== null) handler(message);
      };
      channel.addEventListener('message', onMessage);
      return () => {
        channel.removeEventListener('message', onMessage);
      };
    },
    close() {
      channel.close();
    },
  };
}
