import type { WheelHostData } from './hostData';

/** How a console section sends a command; the console stamps the acting team where the game needs it. */
export type ConsoleSend = (name: string, args?: Record<string, unknown>, teamId?: number) => void;

export interface ConsoleSectionProps {
  data: WheelHostData;
  send: ConsoleSend;
}

export const has = (data: WheelHostData, ...types: string[]): boolean =>
  types.some((t) => data.legal.includes(t));
