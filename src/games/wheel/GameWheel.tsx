import type { Wedge } from '@/engines/wheel/wheels';
import { cx } from '@/design/cx';
import { money } from './format';
import {
  BULB_COUNT,
  CENTER,
  HUB_RADIUS,
  WEDGE_RADIUS,
  polar,
  ringSlicePath,
  slicePath,
  wedgeMid,
  wedgeStart,
} from './wheelGeometry';
import styles from './GameWheel.module.css';

export interface GameWheelProps {
  /** The 24 wedges in play; null shows an empty wheel. */
  wedges: readonly Wedge[] | null;
  /** Rotation of the wheel, degrees clockwise (from the spin plan). */
  angleDeg: number;
  spinning?: boolean;
  className?: string;
}

const COUNT = 24;
const LABEL_RADIUS = 168;

function label(w: Wedge): string {
  switch (w.kind) {
    case 'cash':
      return money(w.value);
    case 'bankrupt':
      return 'BANKRUPT';
    case 'lose-turn':
      return 'LOSE A TURN';
    case 'wild-card':
      return 'WILD CARD';
    case 'million':
      return '1M';
    case 'trip':
      return 'TRIP';
    case 'mystery':
      return 'MYSTERY';
    case 'express':
      return 'EXPRESS';
  }
}

function WedgeArt({ wedge, index }: { wedge: Wedge; index: number }) {
  const start = wedgeStart(index, COUNT);
  const end = wedgeStart(index + 1, COUNT);
  const mid = wedgeMid(index, COUNT);
  const value = 'value' in wedge ? String(wedge.value) : '0';
  const top = wedge.kind === 'cash' && wedge.top === true;
  const labelPoint = polar(0, LABEL_RADIUS);
  return (
    <g
      data-testid="wedge"
      data-index={index}
      data-kind={wedge.kind}
      data-value={wedge.kind === 'cash' ? value : undefined}
    >
      <path
        className={styles.wedge}
        d={slicePath(start, end)}
        data-kind={wedge.kind}
        data-value={wedge.kind === 'cash' ? value : undefined}
        data-top={top ? 'true' : undefined}
      />
      {wedge.kind === 'million' ? (
        <>
          <path className={styles.thirdBankrupt} d={ringSlicePath(start, start + 5, 60, WEDGE_RADIUS)} />
          <path className={styles.thirdMillion} d={ringSlicePath(start + 5, start + 10, 60, WEDGE_RADIUS)} />
          <path className={styles.thirdBankrupt} d={ringSlicePath(start + 10, end, 60, WEDGE_RADIUS)} />
        </>
      ) : null}
      <g transform={`rotate(${String(mid)} ${String(CENTER)} ${String(CENTER)})`}>
        <text
          className={styles.label}
          data-kind={wedge.kind}
          data-top={top ? 'true' : undefined}
          x={labelPoint.x}
          y={wedge.kind === 'million' ? CENTER - WEDGE_RADIUS + 44 : labelPoint.y}
          transform={`rotate(-90 ${String(labelPoint.x)} ${String(wedge.kind === 'million' ? CENTER - WEDGE_RADIUS + 44 : labelPoint.y)})`}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {label(wedge)}
        </text>
      </g>
    </g>
  );
}

/**
 * The 24-wedge wheel (FR-042, docs/DESIGN.md): flat wedges, ink dividers, a ring of bulbs, a flat-shaded
 * steel hub and a gold pointer. The wedges sit on a layer that rotates with a CSS transform driven by the
 * spin plan; the bulbs, hub and pointer stay put.
 */
export const GameWheel = ({ wedges, angleDeg, spinning = false, className }: GameWheelProps) => (
  <div
    className={cx(styles.wheel, className)}
    data-testid="game-wheel"
    data-spinning={spinning}
    role="img"
    aria-label="The wheel"
  >
    <div
      className={styles.rotor}
      data-testid="wheel-rotor"
      data-angle={angleDeg}
      style={{ transform: `rotate(${String(angleDeg)}deg)` }}
    >
      <svg viewBox="0 0 600 600" className={styles.svg} aria-hidden="true">
        <circle className={styles.rim} cx={CENTER} cy={CENTER} r={WEDGE_RADIUS + 6} />
        {wedges
          ? wedges.map((w, i) => <WedgeArt key={i} wedge={w} index={i} />)
          : Array.from({ length: COUNT }, (_, i) => (
              <path
                key={i}
                className={styles.wedge}
                data-kind="empty"
                d={slicePath(wedgeStart(i, COUNT), wedgeStart(i + 1, COUNT))}
              />
            ))}
      </svg>
    </div>
    <svg viewBox="0 0 600 600" className={styles.overlay} aria-hidden="true">
      {Array.from({ length: BULB_COUNT }, (_, i) => {
        const p = polar((i * 360) / BULB_COUNT, WEDGE_RADIUS + 16);
        return (
          <rect
            key={i}
            className={styles.bulb}
            data-alt={i % 2 === 1 ? 'true' : undefined}
            x={p.x - 5}
            y={p.y - 5}
            width={10}
            height={10}
          />
        );
      })}
      <polygon className={styles.hubShade} points={hubPoints(HUB_RADIUS, 8)} />
      <polygon className={styles.hubBase} points={hubPoints(HUB_RADIUS - 8, 8)} />
      <polygon className={styles.hubLight} points={hubPoints(HUB_RADIUS - 22, 8)} />
      <polygon
        className={styles.pointer}
        points={`${String(CENTER - 22)},0 ${String(CENTER + 22)},0 ${String(CENTER)},50`}
      />
    </svg>
  </div>
);

/** A regular octagon (flat-shaded hub face). */
function hubPoints(r: number, sides: number): string {
  return Array.from({ length: sides }, (_, i) => {
    const p = polar((i * 360) / sides + 360 / sides / 2, r);
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(' ');
}
