/** Test helpers for the host protocol: a same-process BroadcastChannel and a connected memory room. */
import { MemoryRoomHub, MemoryRoomTransport, type RoomTransport } from '@/realtime';

type Listener = (event: MessageEvent) => void;

/**
 * Delivers to every other instance with the same name, asynchronously (a microtask), as the real
 * thing does. Install with `vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)`.
 */
export class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  static reset(): void {
    FakeBroadcastChannel.instances = [];
  }

  readonly name: string;
  closed = false;
  private readonly listeners = new Set<Listener>();

  constructor(name: string) {
    this.name = name;
    FakeBroadcastChannel.instances.push(this);
  }

  postMessage(data: unknown): void {
    if (this.closed) throw new Error('channel closed');
    const copy = JSON.parse(JSON.stringify(data)) as unknown;
    for (const other of FakeBroadcastChannel.instances) {
      if (other === this || other.closed || other.name !== this.name) continue;
      queueMicrotask(() => {
        for (const listener of [...other.listeners]) listener({ data: copy } as MessageEvent);
      });
    }
  }

  addEventListener(_type: 'message', listener: Listener): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: Listener): void {
    this.listeners.delete(listener);
  }

  close(): void {
    this.closed = true;
    this.listeners.clear();
  }
}

export const TEST_ROOM = 'DMKT';

export interface TestRoom {
  hub: MemoryRoomHub;
  stage: RoomTransport;
  host: RoomTransport;
}

/** A stage transport and a host transport joined to one in-memory room. */
export async function connectStageAndHost(code: string = TEST_ROOM): Promise<TestRoom> {
  const hub = new MemoryRoomHub();
  const stage = new MemoryRoomTransport({ hub });
  const host = new MemoryRoomTransport({ hub });
  await stage.connect({ code, role: 'stage' });
  await host.connect({ code, role: 'host', key: 'host-1' });
  return { hub, stage, host };
}
