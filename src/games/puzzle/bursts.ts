/** Clear bursts: a 4-frame pop drawn over each cleared cell, driven by the engine's `clear` events. */
import type { Color, PuzzleEvent } from '@/engines/puzzle';

export const BURST_FRAMES = 4;
/** Matches the design's `--motion-tick` (125 ms), so a whole burst lasts half a second. */
export const BURST_FRAME_MS = 125;

export interface Burst {
  player: number;
  row: number;
  col: number;
  color: Color;
  /** The cell held a germ (its flash frame shows first). */
  germ: boolean;
  startMs: number;
}

export interface ActiveBurst extends Burst {
  /** 1..4 */
  frame: 1 | 2 | 3 | 4;
}

export class BurstTracker {
  private bursts: Burst[] = [];

  add(events: readonly PuzzleEvent[], nowMs: number): void {
    for (const event of events) {
      if (event.type !== 'clear') continue;
      for (const cell of event.cells) {
        this.bursts.push({
          player: event.player,
          row: cell.row,
          col: cell.col,
          color: cell.color,
          germ: cell.germ,
          startMs: nowMs,
        });
      }
    }
  }

  clear(): void {
    this.bursts = [];
  }

  /** Bursts still playing at `nowMs`, with their current frame; finished ones are dropped. */
  active(nowMs: number): ActiveBurst[] {
    const out: ActiveBurst[] = [];
    const keep: Burst[] = [];
    for (const burst of this.bursts) {
      const index = Math.floor((nowMs - burst.startMs) / BURST_FRAME_MS);
      if (index >= BURST_FRAMES) continue;
      keep.push(burst);
      out.push({ ...burst, frame: (Math.max(0, index) + 1) as ActiveBurst['frame'] });
    }
    this.bursts = keep;
    return out;
  }
}
