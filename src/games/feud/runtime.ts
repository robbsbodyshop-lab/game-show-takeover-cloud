/**
 * Everything the controller takes from the outside world that tests replace: time, timers,
 * randomness, content, the microphone and the voice. Defaults read the globals lazily so
 * `vi.useFakeTimers()` works whenever it is called.
 */
import { getFeudContent } from '@/content';
import type { FastMoneyQuestion, FeudSurvey, Rng } from '@/content';
import { createBrowserRecognizer, speakBrowser, type SpeechRecognizer } from './speech';

export interface FeudContentPools {
  readonly surveys: readonly FeudSurvey[];
  readonly fastMoney: readonly FastMoneyQuestion[];
}

export interface FeudRuntime {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
  rng: Rng;
  /** Null when voice cannot run (no Web Speech). */
  recognizer: SpeechRecognizer | null;
  /** Says a line aloud ("Survey says"). */
  speak(text: string): void;
  /** Loaded on first use so a test that injects its own content never parses the bundled files. */
  content(): FeudContentPools;
}

export const defaultRuntime = (): FeudRuntime => ({
  now: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => {
    globalThis.clearTimeout(id as ReturnType<typeof setTimeout>);
  },
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (id) => {
    globalThis.clearInterval(id as ReturnType<typeof setInterval>);
  },
  rng: () => Math.random(),
  recognizer: createBrowserRecognizer(),
  speak: speakBrowser,
  content: () => {
    const file = getFeudContent();
    return { surveys: file.surveys, fastMoney: file.fastMoney };
  },
});
