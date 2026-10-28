/** Geometry for the SVG wheels: wedge 0 starts at the top and indices run clockwise. */

export const WHEEL_SIZE = 600;
export const CENTER = WHEEL_SIZE / 2;
export const WEDGE_RADIUS = 262;
export const HUB_RADIUS = 52;

export interface Point {
  x: number;
  y: number;
}

/** Point at `deg` degrees clockwise from the top, `r` from the centre. */
export function polar(deg: number, r: number, cx: number = CENTER, cy: number = CENTER): Point {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

const fix = (n: number): string => n.toFixed(2);

/** A pie slice from `startDeg` to `endDeg` (clockwise). */
export function slicePath(startDeg: number, endDeg: number, r: number = WEDGE_RADIUS): string {
  const a = polar(startDeg, r);
  const b = polar(endDeg, r);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${fix(CENTER)} ${fix(CENTER)} L ${fix(a.x)} ${fix(a.y)} A ${fix(r)} ${fix(r)} 0 ${String(large)} 1 ${fix(b.x)} ${fix(b.y)} Z`;
}

export const wedgeStart = (index: number, count: number): number => (index * 360) / count;
export const wedgeMid = (index: number, count: number): number => ((index + 0.5) * 360) / count;

/** An annular slice, for the thirds of the Million Dollar Wedge. */
export function ringSlicePath(startDeg: number, endDeg: number, inner: number, outer: number): string {
  const a = polar(startDeg, outer);
  const b = polar(endDeg, outer);
  const c = polar(endDeg, inner);
  const d = polar(startDeg, inner);
  return `M ${fix(a.x)} ${fix(a.y)} A ${fix(outer)} ${fix(outer)} 0 0 1 ${fix(b.x)} ${fix(b.y)} L ${fix(c.x)} ${fix(c.y)} A ${fix(inner)} ${fix(inner)} 0 0 0 ${fix(d.x)} ${fix(d.y)} Z`;
}

/** Number of bulbs on the ring around the wheel. */
export const BULB_COUNT = 48;
