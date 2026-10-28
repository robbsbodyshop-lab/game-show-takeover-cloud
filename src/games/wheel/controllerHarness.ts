/**
 * Test doubles for the Wheel controller: a recording audio player, a phone bridge and a host bridge
 * that tests drive by hand. Used by *.test.ts only.
 */
import { vi } from 'vitest';
import type { Rng } from '@/content';
import { seededRng } from '@/content/testUtils';
import type { CommandResult, HostCommand, HostSnapshot, SnapshotKind } from '@/host/hostProtocol';
import type { GameEndReport, PhoneBridge, PhoneControls } from '@/stage/gameContract';

type PressMessage = Parameters<Parameters<PhoneBridge['onPress']>[0]>[0];
type ActionMessage = Parameters<Parameters<PhoneBridge['onAction']>[0]>[0];
import type { WheelSettings, WheelState } from '@/engines/wheel/types';
import { WheelController } from './WheelController';
import type { WheelAudio, WheelControllerOptions } from './WheelController';
import { readWheelHostData } from './hostData';
import type { SoundName } from '@/audio/cues';

export class FakeAudio implements WheelAudio {
  readonly calls: { fn: string; args: unknown[] }[] = [];
  private record(fn: string, ...args: unknown[]): void {
    this.calls.push({ fn, args });
  }
  play = vi.fn((name: SoundName, options?: { overlap?: boolean }) => {
    this.record('play', name, options);
  });
  loop = vi.fn((name: SoundName) => {
    this.record('loop', name);
  });
  stopLoop = vi.fn((name: SoundName) => {
    this.record('stopLoop', name);
  });
  bed = vi.fn((name: SoundName, options?: { offsetSec?: number }) => {
    this.record('bed', name, options);
  });
  stop = vi.fn((name: SoundName) => {
    this.record('stop', name);
  });
  stopAll = vi.fn(() => {
    this.record('stopAll');
  });
  pauseAll = vi.fn(() => {
    this.record('pauseAll');
  });
  resumeAll = vi.fn(() => {
    this.record('resumeAll');
  });

  /** How many times `name` was played with `play`. */
  played(name: SoundName): number {
    return this.play.mock.calls.filter(([n]) => n === name).length;
  }
  reset(): void {
    this.calls.length = 0;
    for (const fn of [
      this.play,
      this.loop,
      this.stopLoop,
      this.bed,
      this.stop,
      this.stopAll,
      this.pauseAll,
      this.resumeAll,
    ])
      fn.mockClear();
  }
}

export class FakePhones implements PhoneBridge {
  readonly controls: PhoneControls[] = [];
  readonly acks: { team: number; pressId: string; accepted: boolean }[] = [];
  private presses = new Set<(press: PressMessage) => void>();
  private actions = new Set<(action: ActionMessage) => void>();
  private seq = 0;

  publishControls(controls: PhoneControls): void {
    this.controls.push(controls);
  }
  onPress(handler: (press: PressMessage) => void): () => void {
    this.presses.add(handler);
    return () => {
      this.presses.delete(handler);
    };
  }
  onAction(handler: (action: ActionMessage) => void): () => void {
    this.actions.add(handler);
    return () => {
      this.actions.delete(handler);
    };
  }
  onFeudAnswer(): () => void {
    return () => undefined;
  }
  ack(team: number, pressId: string, accepted: boolean): void {
    this.acks.push({ team, pressId, accepted });
  }

  get lastControls(): PhoneControls | undefined {
    return this.controls[this.controls.length - 1];
  }
  get lastAck(): { team: number; pressId: string; accepted: boolean } | undefined {
    return this.acks[this.acks.length - 1];
  }

  /** A phone BUZZ; returns whether the game accepted it. */
  press(team: number): boolean {
    this.seq += 1;
    const pressId = `p${String(this.seq)}`;
    for (const h of [...this.presses])
      h({ v: 1, from: 'phone', sent: Date.now(), pressId, team, at: Date.now() });
    return this.acks.find((a) => a.pressId === pressId)?.accepted ?? false;
  }
  action(team: number, action: ActionMessage['action'], answer?: string): boolean {
    this.seq += 1;
    const pressId = `a${String(this.seq)}`;
    for (const h of [...this.actions])
      h({
        v: 1,
        from: 'phone',
        sent: Date.now(),
        pressId,
        team,
        action,
        ...(answer === undefined ? {} : { answer }),
      });
    return this.acks.find((a) => a.pressId === pressId)?.accepted ?? false;
  }
}

export class FakeHost {
  readonly snapshots: HostSnapshot[] = [];
  private handlers = new Map<SnapshotKind, (command: HostCommand) => CommandResult>();
  private seq = 0;

  readonly bridge = {
    publishSnapshot: (snapshot: HostSnapshot): void => {
      this.snapshots.push(snapshot);
    },
    onCommand: (target: SnapshotKind, handler: (command: HostCommand) => CommandResult): (() => void) => {
      this.handlers.set(target, handler);
      return () => {
        this.handlers.delete(target);
      };
    },
  };

  get last(): HostSnapshot {
    const s = this.snapshots[this.snapshots.length - 1];
    if (!s) throw new Error('no host snapshot yet');
    return s;
  }
  get data() {
    return readWheelHostData(this.last.data);
  }

  /** Sends a command the way the host view does: stamped with the latest snapshot's revision. */
  send(
    name: string,
    args?: Record<string, unknown>,
    extra: { teamId?: number; gameRev?: number; cmdId?: string } = {},
  ): CommandResult {
    this.seq += 1;
    const handler = this.handlers.get('wheel');
    if (!handler) return { applied: false, reason: 'no-handler' };
    return handler({
      cmdId: extra.cmdId ?? `c${String(this.seq)}`,
      target: 'wheel',
      gameRev: extra.gameRev ?? this.last.gameRev,
      name,
      ...(extra.teamId === undefined ? {} : { teamId: extra.teamId }),
      ...(args === undefined ? {} : { args }),
    });
  }
}

export interface HarnessOptions {
  settings?: Partial<WheelSettings>;
  initialState?: unknown;
  /** Draws returned first by the injected rng; then a seeded sequence. */
  draws?: number[];
  seed?: number;
  inputLocked?: boolean;
  usedContentIds?: readonly string[];
  allowHostWhileLocked?: boolean;
  teams?: { id: number; name: string; color?: string }[];
}

export interface Harness {
  controller: WheelController;
  audio: FakeAudio;
  phones: FakePhones;
  host: FakeHost;
  ended: GameEndReport[];
  used: string[][];
  changes: unknown[];
  saved: WheelSettings[];
  /** Queue more draws to be returned next. */
  queueDraws(...draws: number[]): void;
  engine(): WheelState;
  advance(ms: number): void;
}

export const DEFAULT_TEAMS = [
  { id: 1, name: 'Red', color: '#e63946' },
  { id: 2, name: 'Blue', color: '#2a9df4' },
  { id: 3, name: 'Green', color: '#2ecc71' },
];

export function makeHarness(opts: HarnessOptions = {}): Harness {
  const audio = new FakeAudio();
  const phones = new FakePhones();
  const host = new FakeHost();
  const ended: GameEndReport[] = [];
  const used: string[][] = [];
  const changes: unknown[] = [];
  const saved: WheelSettings[] = [];
  const queue = [...(opts.draws ?? [])];
  const fallback: Rng = seededRng(opts.seed ?? 7);
  const rng: Rng = () => queue.shift() ?? fallback();
  const options: WheelControllerOptions = {
    teams: opts.teams ?? DEFAULT_TEAMS,
    ...(opts.settings ? { settings: opts.settings } : {}),
    ...(opts.initialState === undefined ? {} : { initialState: opts.initialState }),
    rng,
    audio,
    phones,
    host: host.bridge,
    ...(opts.inputLocked === undefined ? {} : { inputLocked: opts.inputLocked }),
    ...(opts.usedContentIds ? { usedContentIds: opts.usedContentIds } : {}),
    ...(opts.allowHostWhileLocked === undefined ? {} : { allowHostWhileLocked: opts.allowHostWhileLocked }),
    onStateChange: (s) => changes.push(s),
    onGameEnd: (r) => ended.push(r),
    onContentUsed: (ids) => used.push(ids),
    onSettingsSave: (s) => saved.push(s),
  };
  const controller = new WheelController(options);
  controller.start();
  return {
    controller,
    audio,
    phones,
    host,
    ended,
    used,
    changes,
    saved,
    queueDraws: (...draws) => {
      queue.push(...draws);
    },
    engine: () => controller.getEngineState(),
    advance: (ms) => {
      vi.advanceTimersByTime(ms);
    },
  };
}
