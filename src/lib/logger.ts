/**
 * Minimal logger. `debug` is silent in production unless localStorage["gst:debug"] = "1";
 * `warn` and `error` always print. ESLint forbids raw console.log elsewhere.
 */
const debugEnabled = (): boolean => {
  if (import.meta.env.DEV) return true;
  try {
    return globalThis.localStorage.getItem('gst:debug') === '1';
  } catch {
    return false;
  }
};

export const logger = {
  debug: (...args: unknown[]): void => {
    if (debugEnabled()) console.warn('[gst]', ...args);
  },
  warn: (...args: unknown[]): void => {
    console.warn('[gst]', ...args);
  },
  error: (...args: unknown[]): void => {
    console.error('[gst]', ...args);
  },
};
