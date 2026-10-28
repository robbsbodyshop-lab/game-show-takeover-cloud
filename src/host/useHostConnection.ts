import { useEffect, useState } from 'react';
import type { DataLayer } from '@/data';
import { logger } from '@/lib/logger';
import type { Role, RoomTransport } from '@/realtime';
import { createHostClient, type HostClient } from './hostClient';

export type HostConnection =
  | { phase: 'joining' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; client: HostClient; notes: string[] };

interface Settled {
  code: string;
  connection: Exclude<HostConnection, { phase: 'joining' }>;
}

export interface UseHostConnectionOptions {
  data: Pick<DataLayer, 'rooms' | 'mode'>;
  createTransport: (role: Role) => RoomTransport;
  /** Null until the host has chosen a room. */
  code: string | null;
  hostId: string;
}

/**
 * Attaches this device to the room as a host view (`joinRoomAsHost`), connects a `role: 'host'`
 * transport and builds the client. If realtime cannot connect the client still runs on the
 * same-browser BroadcastChannel, so a host view next to the stage works offline. In demo mode a failed
 * room check is tolerated for the same reason (the demo stage lives in another tab's memory).
 */
export function useHostConnection(opts: UseHostConnectionOptions): HostConnection {
  const { data, createTransport, code, hostId } = opts;
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (code === null) return;
    // One holder object: the effect, the async start and the cleanup all see the same fields.
    const run: { cancelled: boolean; transport: RoomTransport | null; client: HostClient | null } = {
      cancelled: false,
      transport: null,
      client: null,
    };

    // A function call, so TypeScript does not assume the flag is still false after an await.
    const isCancelled = (): boolean => run.cancelled;

    const start = async () => {
      const notes: string[] = [];
      try {
        await data.rooms.joinRoomAsHost(code);
      } catch (error) {
        logger.warn('[host] joinRoomAsHost failed', error);
        if (data.mode === 'supabase') {
          if (!run.cancelled) {
            setSettled({
              code,
              connection: { phase: 'error', message: 'Room not found, or it belongs to another host.' },
            });
          }
          return;
        }
        notes.push('Demo mode: the room was not found in this tab, so only the same browser can connect.');
      }
      if (run.cancelled) return;
      try {
        run.transport = createTransport('host');
        await run.transport.connect({ code, role: 'host', key: hostId, nickname: 'Host' });
      } catch (error) {
        logger.warn('[host] realtime connect failed', error);
        await run.transport?.disconnect().catch(() => undefined);
        run.transport = null;
        notes.push('Realtime is unavailable; only a stage in this same browser can be reached.');
      }
      if (isCancelled()) {
        await run.transport?.disconnect().catch(() => undefined);
        return;
      }
      const { transport } = run;
      run.client = createHostClient({ ...(transport === null ? {} : { transport }), hostId });
      setSettled({ code, connection: { phase: 'ready', client: run.client, notes } });
    };
    void start();

    return () => {
      run.cancelled = true;
      run.client?.dispose();
      void run.transport?.disconnect().catch(() => undefined);
    };
  }, [data, createTransport, code, hostId]);

  if (code === null || settled?.code !== code) return { phase: 'joining' };
  return settled.connection;
}
