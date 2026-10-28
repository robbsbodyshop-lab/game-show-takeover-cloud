import type { FeudHostData } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Checks a snapshot payload before the console trusts it; anything else renders "waiting". */
export const parseHostData = (data: unknown): FeudHostData | null => {
  if (!isRecord(data)) return null;
  const view = data.view;
  if (
    !isRecord(view) ||
    typeof view.phase !== 'string' ||
    !Array.isArray(view.board) ||
    !isRecord(data.teams) ||
    !isRecord(data.clocks) ||
    !Array.isArray(data.controls) ||
    !Array.isArray(data.sayThis) ||
    !isRecord(data.content) ||
    !isRecord(data.settings)
  ) {
    return null;
  }
  return data as unknown as FeudHostData;
};
