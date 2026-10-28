/**
 * Browser speech, behind small interfaces so tests can use fakes (FR-034). Everything here is
 * guarded: a browser without Web Speech gets `null` / a silent speaker, never an exception.
 */

export interface SpeechRecognizerHandlers {
  /** `alternatives` are the recogniser's guesses, best first. Interim results have `isFinal` false. */
  onResult(alternatives: readonly string[], isFinal: boolean): void;
  /** The session ended by itself (silence, network, or the browser's time limit). */
  onEnd(): void;
  onError?(code: string): void;
}

export interface SpeechRecognizerSession {
  /** Ends the session without delivering anything more. */
  stop(): void;
}

export interface SpeechRecognizer {
  start(handlers: SpeechRecognizerHandlers): SpeechRecognizerSession;
}

// ---------------------------------------------------------------- Web Speech adapter

interface BrowserAlternative {
  readonly transcript: string;
}
interface BrowserResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: BrowserAlternative | undefined;
}
interface BrowserResultEvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; readonly [index: number]: BrowserResult | undefined };
}
interface BrowserRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: BrowserResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start(): void;
  abort(): void;
}
type RecognitionConstructor = new () => BrowserRecognition;

const recognitionConstructor = (): RecognitionConstructor | null => {
  const scope = globalThis as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
};

/** True when this browser can listen (Chrome and Edge, online). */
export const speechRecognitionAvailable = (): boolean => recognitionConstructor() !== null;

/** A recogniser on the browser's Web Speech API, or null when it is missing. */
export const createBrowserRecognizer = (lang = 'en-US'): SpeechRecognizer | null => {
  const Ctor = recognitionConstructor();
  if (Ctor === null) return null;
  return {
    start(handlers) {
      let live = true;
      const recognition = new Ctor();
      recognition.lang = lang;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 5;
      recognition.onresult = (event) => {
        if (!live) return;
        const result = event.results[event.results.length - 1];
        if (result === undefined) return;
        const alternatives = Array.from({ length: result.length }, (_, index) =>
          (result[index]?.transcript ?? '').trim(),
        ).filter((text) => text !== '');
        if (alternatives.length > 0) handlers.onResult(alternatives, result.isFinal);
      };
      recognition.onerror = (event) => {
        if (live) handlers.onError?.(event.error ?? 'error');
      };
      recognition.onend = () => {
        if (!live) return;
        live = false;
        handlers.onEnd();
      };
      try {
        recognition.start();
      } catch {
        live = false;
        queueMicrotask(() => {
          handlers.onError?.('start-failed');
          handlers.onEnd();
        });
      }
      return {
        stop() {
          live = false;
          recognition.onresult = null;
          recognition.onend = null;
          recognition.onerror = null;
          try {
            recognition.abort();
          } catch {
            // Already stopped.
          }
        },
      };
    },
  };
};

// ---------------------------------------------------------------- speech synthesis

interface SynthesisLike {
  speak(utterance: unknown): void;
}
type UtteranceConstructor = new (text: string) => { rate: number };

/** Speaks a short line with the browser's voice; a silent no-op where speechSynthesis is missing. */
export const speakBrowser = (text: string): void => {
  const scope = globalThis as unknown as {
    speechSynthesis?: SynthesisLike;
    SpeechSynthesisUtterance?: UtteranceConstructor;
  };
  if (!scope.speechSynthesis || !scope.SpeechSynthesisUtterance) return;
  try {
    const utterance = new scope.SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    scope.speechSynthesis.speak(utterance);
  } catch {
    // Speech is decoration; never let it break the show.
  }
};
