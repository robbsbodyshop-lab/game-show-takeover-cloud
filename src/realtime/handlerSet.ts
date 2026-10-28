import { logger } from '../lib/logger';

/** A set of listeners where one throwing listener cannot stop the others. */
export class HandlerSet<T extends unknown[]> {
  private readonly handlers = new Set<(...args: T) => void>();

  add(handler: (...args: T) => void): () => void {
    // Wrap so the same function registered twice is two independent subscriptions.
    const entry = (...args: T): void => {
      handler(...args);
    };
    this.handlers.add(entry);
    return () => {
      this.handlers.delete(entry);
    };
  }

  emit(...args: T): void {
    for (const handler of [...this.handlers]) {
      try {
        handler(...args);
      } catch (error) {
        logger.error('[realtime] handler threw', error);
      }
    }
  }

  get size(): number {
    return this.handlers.size;
  }

  clear(): void {
    this.handlers.clear();
  }
}
