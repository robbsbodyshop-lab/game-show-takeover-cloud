/** Fakes and fixtures for the Feud controller and component tests. Not part of the runtime bundle. */
import { vi } from 'vitest';
import type { SoundName } from '@/audio/cues';
import type { Team } from '@/engines/event';
import type { CommandResult, HostBridge, HostCommand, HostSnapshot, SnapshotKind } from '@/host/hostProtocol';
import type { GameProps, PhoneBridge, PhoneControls } from '@/stage/gameContract';
import { FeudController, type FeudAudio, type FeudControllerDeps } from './FeudController';
import type { FeudGameProps } from './FeudGame.types';
import type { FeudContentPools } from './runtime';
import type { FeudSettings } from './settings';
import type { SpeechRecognizer, SpeechRecognizerHandlers } from './speech';
import type { FeudHostData } from './types';

type FeudSurveyRow = FeudContentPools['surveys'][number];
type FastMoneyRow = FeudContentPools['fastMoney'][number];

const row = (answer: string, points: number, aliases?: string[]) => ({
  answer,
  points,
  ...(aliases ? { aliases } : {}),
});

export const FOOD: FeudSurveyRow = {
  id: 'food',
  question: 'Name a food people order for delivery.',
  answers: [row('PIZZA', 40, ['pie']), row('BURGER', 25), row('TACOS', 15), row('SALAD', 10), row('SOUP', 5)],
};

export const COLORS: FeudSurveyRow = {
  id: 'colors',
  question: 'Name a color on a flag.',
  answers: [row('RED', 35), row('BLUE', 30), row('WHITE', 20), row('GREEN', 10)],
};

/** Multi-word answers so a near miss ("phone call please") lands in host review. */
export const COMMS: FeudSurveyRow = {
  id: 'comms',
  question: 'Name a way to reach a friend.',
  answers: [row('PHONE CALL', 40), row('TEXT MESSAGE', 30), row('EMAIL', 20), row('VIDEO CHAT', 10)],
};

export const SUDDEN: FeudSurveyRow = {
  id: 'sudden',
  question: 'Name a day of the week.',
  answers: [row('SATURDAY', 45), row('MONDAY', 30), row('FRIDAY', 20)],
};

const fmQuestion = (id: string, base: string): FastMoneyRow => ({
  id,
  question: `Name something ${base}.`,
  answers: [
    row(`${base} ONE`.toUpperCase(), 40),
    row(`${base} TWO`.toUpperCase(), 25),
    row(`${base} THREE`.toUpperCase(), 15),
    row(`${base} FOUR`.toUpperCase(), 10),
    row(`${base} FIVE`.toUpperCase(), 5),
  ],
});

export const FM_QUESTIONS: FastMoneyRow[] = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'].map(
  (name, index) => fmQuestion(`fm-${(index + 1).toString()}`, name),
);

export const CONTENT: FeudContentPools = { surveys: [FOOD, COLORS, SUDDEN], fastMoney: FM_QUESTIONS };

export const makeTeams = (count = 3): Team[] =>
  Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Team ${(index + 1).toString()}`,
    color: ['#e23b4a', '#2f6fe8', '#3dc24f'][index] ?? '#ffd23f',
    players: ['One', 'Two', 'Three', 'Four', 'Five'].map((name) => `${name}-${(index + 1).toString()}`),
    score: 0,
    chips: 0,
  }));

// ---------------------------------------------------------------- audio

export interface AudioCall {
  kind: 'play' | 'bed' | 'stop' | 'pauseAll' | 'resumeAll';
  cue?: SoundName;
  options?: unknown;
}

export class FakeAudio implements FeudAudio {
  calls: AudioCall[] = [];
  play = (cue: SoundName, options?: unknown): void => {
    this.calls.push({ kind: 'play', cue, options });
  };
  bed = (cue: SoundName, options?: unknown): void => {
    this.calls.push({ kind: 'bed', cue, options });
  };
  stop = (cue: SoundName): void => {
    this.calls.push({ kind: 'stop', cue });
  };
  pauseAll = (): void => {
    this.calls.push({ kind: 'pauseAll' });
  };
  resumeAll = (): void => {
    this.calls.push({ kind: 'resumeAll' });
  };
  played(cue: SoundName): number {
    return this.calls.filter((call) => call.kind === 'play' && call.cue === cue).length;
  }
  beds(cue: SoundName): AudioCall[] {
    return this.calls.filter((call) => call.kind === 'bed' && call.cue === cue);
  }
}

// ---------------------------------------------------------------- phones

type PressMessage = Parameters<Parameters<PhoneBridge['onPress']>[0]>[0];
type FeudAnswerMessage = Parameters<Parameters<PhoneBridge['onFeudAnswer']>[0]>[0];
type ActionMessage = Parameters<Parameters<PhoneBridge['onAction']>[0]>[0];

export class FakePhones implements PhoneBridge {
  controls: PhoneControls[] = [];
  acks: { team: number; pressId: string; accepted: boolean }[] = [];
  private presses = new Set<(press: PressMessage) => void>();
  private answers = new Set<(answer: FeudAnswerMessage) => void>();
  private actions = new Set<(action: ActionMessage) => void>();

  publishControls(controls: PhoneControls): void {
    this.controls.push(controls);
  }
  onPress(handler: (press: PressMessage) => void): () => void {
    this.presses.add(handler);
    return () => this.presses.delete(handler);
  }
  onAction(handler: (action: ActionMessage) => void): () => void {
    this.actions.add(handler);
    return () => this.actions.delete(handler);
  }
  onFeudAnswer(handler: (answer: FeudAnswerMessage) => void): () => void {
    this.answers.add(handler);
    return () => this.answers.delete(handler);
  }
  ack(team: number, pressId: string, accepted: boolean): void {
    this.acks.push({ team, pressId, accepted });
  }

  press(team: number, pressId: string, at = 1000): void {
    for (const handler of this.presses) handler({ v: 1, from: 'phone', sent: 0, pressId, team, at });
  }
  answer(team: number, text: string, pressId: string): void {
    for (const handler of this.answers) handler({ v: 1, from: 'phone', sent: 0, pressId, team, text });
  }
  get last(): PhoneControls | undefined {
    return this.controls.at(-1);
  }
  lastAck(): { team: number; pressId: string; accepted: boolean } | undefined {
    return this.acks.at(-1);
  }
}

// ---------------------------------------------------------------- host bridge

export class FakeHost implements HostBridge {
  snapshots: HostSnapshot[] = [];
  private handlers = new Map<SnapshotKind, (command: HostCommand) => CommandResult>();
  private counter = 0;

  publishSnapshot(snapshot: HostSnapshot): void {
    this.snapshots.push(snapshot);
  }
  onCommand(target: SnapshotKind, handler: (command: HostCommand) => CommandResult): () => void {
    this.handlers.set(target, handler);
    return () => {
      this.handlers.delete(target);
    };
  }

  get data(): FeudHostData {
    const snapshot = this.snapshots.at(-1);
    if (snapshot === undefined) throw new Error('no snapshot yet');
    return snapshot.data as FeudHostData;
  }
  get gameRev(): number {
    return this.snapshots.at(-1)?.gameRev ?? 0;
  }

  /** Sends a command stamped with the latest published revision unless told otherwise. */
  send(
    name: string,
    args?: Record<string, unknown>,
    options: { gameRev?: number; teamId?: number; cmdId?: string } = {},
  ): CommandResult {
    const handler = this.handlers.get('feud');
    if (handler === undefined) throw new Error('the game did not register a command handler');
    this.counter += 1;
    const command: HostCommand = {
      cmdId: options.cmdId ?? `cmd-${this.counter.toString()}`,
      target: 'feud',
      gameRev: options.gameRev ?? this.gameRev,
      name,
      ...(args === undefined ? {} : { args }),
      ...(options.teamId === undefined ? {} : { teamId: options.teamId }),
    };
    return handler(command);
  }
}

// ---------------------------------------------------------------- speech

export interface FakeSession {
  handlers: SpeechRecognizerHandlers;
  stopped: boolean;
}

export class FakeRecognizer implements SpeechRecognizer {
  sessions: FakeSession[] = [];
  start(handlers: SpeechRecognizerHandlers): { stop(): void } {
    const session: FakeSession = { handlers, stopped: false };
    this.sessions.push(session);
    return {
      stop: () => {
        session.stopped = true;
      },
    };
  }
  get live(): FakeSession[] {
    return this.sessions.filter((session) => !session.stopped);
  }
  /** What the browser would do: deliver a result to a session, unless it was stopped. */
  say(session: FakeSession | undefined, alternatives: string[], isFinal = true): void {
    if (session === undefined || session.stopped) return;
    session.handlers.onResult(alternatives, isFinal);
  }
  /** The session ends by itself. */
  end(session: FakeSession | undefined): void {
    if (session === undefined || session.stopped) return;
    session.stopped = true;
    session.handlers.onEnd();
  }
}

// ---------------------------------------------------------------- harness

export interface Harness {
  controller: FeudController;
  audio: FakeAudio;
  phones: FakePhones;
  host: FakeHost;
  recognizer: FakeRecognizer;
  speak: ReturnType<typeof vi.fn<(text: string) => void>>;
  onGameEnd: ReturnType<typeof vi.fn>;
  onStateChange: ReturnType<typeof vi.fn>;
  onContentUsed: ReturnType<typeof vi.fn>;
  deps: FeudControllerDeps;
}

export interface HarnessOptions {
  settings?: Partial<FeudSettings>;
  initialState?: unknown;
  content?: FeudContentPools;
  voice?: boolean;
  teams?: Team[];
  usedContentIds?: string[];
  inputLocked?: boolean;
  /** Do not call `start()`. */
  manual?: boolean;
}

/** A controller wired to fakes. Call `vi.useFakeTimers()` first for time control. */
export const makeHarness = (options: HarnessOptions = {}): Harness => {
  const audio = new FakeAudio();
  const phones = new FakePhones();
  const host = new FakeHost();
  const recognizer = new FakeRecognizer();
  const speak = vi.fn<(text: string) => void>();
  const onGameEnd = vi.fn();
  const onStateChange = vi.fn();
  const onContentUsed = vi.fn();
  let seed = 7;
  const deps: FeudControllerDeps = {
    teams: options.teams ?? makeTeams(),
    match: { a: 1, b: 2 },
    usedContentIds: options.usedContentIds ?? [],
    onContentUsed,
    onStateChange,
    onGameEnd,
    audio,
    phones,
    host,
    settings: options.settings ?? {},
    initialState: options.initialState,
    inputLocked: options.inputLocked ?? false,
    runtime: {
      rng: () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      },
      recognizer: options.voice === true ? recognizer : null,
      speak,
      content: () => options.content ?? CONTENT,
    },
  };
  const controller = new FeudController(deps);
  if (options.manual !== true) controller.start();
  return {
    controller,
    audio,
    phones,
    host,
    recognizer,
    speak,
    onGameEnd,
    onStateChange,
    onContentUsed,
    deps,
  };
};

// ---------------------------------------------------------------- component tests

export interface GameFixture {
  props: FeudGameProps;
  audio: FakeAudio;
  phones: FakePhones;
  host: FakeHost;
  onGameEnd: ReturnType<typeof vi.fn>;
  onStateChange: ReturnType<typeof vi.fn>;
}

/** Props for <FeudGame> wired to fakes; the game builds and starts its own controller. */
export const makeGameProps = (overrides: Partial<FeudGameProps> = {}): GameFixture => {
  const audio = new FakeAudio();
  const phones = new FakePhones();
  const host = new FakeHost();
  const onGameEnd = vi.fn();
  const onStateChange = vi.fn();
  let seed = 11;
  const props: FeudGameProps = {
    teams: makeTeams(),
    playOrder: [1, 2, 3],
    usedContentIds: [],
    onContentUsed: vi.fn(),
    inputLocked: false,
    showMode: false,
    onStateChange,
    onGameEnd,
    onQuitToHub: vi.fn(),
    audio: audio as unknown as GameProps['audio'],
    phones,
    host,
    gameInstance: 1,
    settings: { answerTimerSec: 0, format: 'one-round' },
    runtime: {
      rng: () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      },
      recognizer: null,
      speak: vi.fn(),
      content: () => CONTENT,
    },
    ...overrides,
  };
  return { props, audio, phones, host, onGameEnd, onStateChange };
};
