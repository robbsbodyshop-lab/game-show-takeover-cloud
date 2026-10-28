/** Small display helpers shared by the Wheel components. */

export const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

export const points = (n: number): string =>
  `${Math.round(n).toLocaleString('en-US')} ${n === 1 ? 'point' : 'points'}`;
