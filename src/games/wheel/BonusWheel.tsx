import { cx } from '@/design/cx';
import {
  BULB_COUNT,
  CENTER,
  HUB_RADIUS,
  WEDGE_RADIUS,
  polar,
  slicePath,
  wedgeMid,
  wedgeStart,
} from './wheelGeometry';
import styles from './BonusWheel.module.css';

export interface BonusWheelProps {
  /** Rotation of the wheel, degrees clockwise (from the spin plan). */
  angleDeg: number;
  spinning?: boolean;
  className?: string;
}

const COUNT = 24;

/**
 * The Bonus Wheel: 24 sealed envelopes (FR-042, rules "The Bonus Round"). Nothing printed on it says
 * what is inside; the value exists only in the host snapshot until the envelope is opened (P-002).
 */
export const BonusWheel = ({ angleDeg, spinning = false, className }: BonusWheelProps) => (
  <div
    className={cx(styles.wheel, className)}
    data-testid="bonus-wheel"
    data-spinning={spinning}
    role="img"
    aria-label="The Bonus Wheel of sealed envelopes"
  >
    <div
      className={styles.rotor}
      data-testid="bonus-rotor"
      data-angle={angleDeg}
      style={{ transform: `rotate(${String(angleDeg)}deg)` }}
    >
      <svg viewBox="0 0 600 600" className={styles.svg} aria-hidden="true">
        <circle className={styles.rim} cx={CENTER} cy={CENTER} r={WEDGE_RADIUS + 6} />
        {Array.from({ length: COUNT }, (_, i) => {
          const mid = wedgeMid(i, COUNT);
          const at = polar(0, 176);
          return (
            <g key={i} data-testid="envelope" data-index={i}>
              <path
                className={styles.slice}
                data-tone={i % 3}
                d={slicePath(wedgeStart(i, COUNT), wedgeStart(i + 1, COUNT))}
              />
              <g transform={`rotate(${String(mid)} ${String(CENTER)} ${String(CENTER)})`}>
                <g transform={`rotate(-90 ${String(at.x)} ${String(at.y)})`}>
                  <rect className={styles.paper} x={at.x - 30} y={at.y - 14} width={60} height={28} />
                  <polyline
                    className={styles.flap}
                    points={`${String(at.x - 30)},${String(at.y - 14)} ${String(at.x)},${String(at.y + 4)} ${String(at.x + 30)},${String(at.y - 14)}`}
                  />
                </g>
                <text
                  className={styles.number}
                  x={polar(0, 232).x}
                  y={polar(0, 232).y}
                  transform={`rotate(-90 ${String(polar(0, 232).x)} ${String(polar(0, 232).y)})`}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {i + 1}
                </text>
              </g>
            </g>
          );
        })}
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
      <circle className={styles.hub} cx={CENTER} cy={CENTER} r={HUB_RADIUS} />
      <circle className={styles.hubLight} cx={CENTER} cy={CENTER} r={HUB_RADIUS - 20} />
      <polygon
        className={styles.pointer}
        points={`${String(CENTER - 22)},0 ${String(CENTER + 22)},0 ${String(CENTER)},50`}
      />
    </svg>
  </div>
);
