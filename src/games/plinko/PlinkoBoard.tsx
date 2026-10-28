import { PLINKO_SLOT_COUNT } from '@/engines/event';
import {
  BOARD_H,
  BOARD_LEFT,
  BOARD_W,
  CHIP_R,
  LANDED_STEP,
  SLOT_H,
  SLOT_TOP,
  SLOT_W,
  buildPegs,
  chipPosition,
  slotCenter,
  slotTier,
} from './geometry';
import styles from './PlinkoBoard.module.css';

const PEGS = buildPegs();
const PEG_R = 11;

export interface BoardChip {
  /** Increments per drop so a repeat of the same path restarts its pop. */
  id: number;
  color: string;
  column: number;
  xs: readonly number[];
  slot: number;
  points: number;
  step: number;
}

export interface PlinkoBoardProps {
  slotValues: readonly number[];
  /** The column the active team has picked (0-based) and its colour, or null. */
  marker: { column: number; color: string } | null;
  chip: BoardChip | null;
}

const octagon = (cx: number, cy: number, r: number): string => {
  const k = r * 0.41;
  return [
    [cx - k, cy - r],
    [cx + k, cy - r],
    [cx + r, cy - k],
    [cx + r, cy + k],
    [cx + k, cy + r],
    [cx - k, cy + r],
    [cx - r, cy + k],
    [cx - r, cy - k],
  ]
    .map(([x, y]) => `${(x ?? 0).toString()},${(y ?? 0).toString()}`)
    .join(' ');
};

/**
 * The pegboard as flat-shaded 2D polygons: ink outline, a light and a shade facet per peg, no gradients.
 * The chip moves in whole steps (CSS steps()), one peg row per animation step.
 */
export const PlinkoBoard = ({ slotValues, marker, chip }: PlinkoBoardProps) => {
  const max = Math.max(0, ...slotValues);
  const landed = chip !== null && chip.step >= LANDED_STEP;
  const pos = chip ? chipPosition(chip.column, chip.xs, chip.slot, chip.step) : null;
  const right = BOARD_LEFT + SLOT_W * PLINKO_SLOT_COUNT;

  return (
    <svg
      className={styles.board}
      viewBox={`0 0 ${BOARD_W.toString()} ${BOARD_H.toString()}`}
      role="img"
      aria-label="Plinko board"
      data-testid="plinko-board"
    >
      {/* board face and side walls */}
      <polygon
        className={styles.face}
        points={`${BOARD_LEFT.toString()},110 ${right.toString()},110 ${right.toString()},${(SLOT_TOP + SLOT_H).toString()} ${BOARD_LEFT.toString()},${(SLOT_TOP + SLOT_H).toString()}`}
      />
      <polygon
        className={styles.wallLight}
        points={`${(BOARD_LEFT - 22).toString()},110 ${BOARD_LEFT.toString()},110 ${BOARD_LEFT.toString()},${(SLOT_TOP + SLOT_H).toString()} ${(BOARD_LEFT - 22).toString()},${(SLOT_TOP + SLOT_H + 14).toString()}`}
      />
      <polygon
        className={styles.wallShade}
        points={`${right.toString()},110 ${(right + 22).toString()},110 ${(right + 22).toString()},${(SLOT_TOP + SLOT_H + 14).toString()} ${right.toString()},${(SLOT_TOP + SLOT_H).toString()}`}
      />

      {/* slots */}
      {slotValues.slice(0, PLINKO_SLOT_COUNT).map((value, slot) => {
        const x = BOARD_LEFT + slot * SLOT_W;
        const flash = landed && chip.slot === slot;
        return (
          <g key={slot} data-testid={`slot-${slot.toString()}`} data-flash={flash} data-value={value}>
            <polygon
              className={`${styles.slot} ${styles[slotTier(value, max)]}`}
              points={`${x.toString()},${SLOT_TOP.toString()} ${(x + SLOT_W).toString()},${SLOT_TOP.toString()} ${(x + SLOT_W).toString()},${(SLOT_TOP + SLOT_H).toString()} ${x.toString()},${(SLOT_TOP + SLOT_H).toString()}`}
              data-flash={flash}
            />
            <text className={styles.value} x={x + SLOT_W / 2} y={SLOT_TOP + 100} textAnchor="middle">
              {value}
            </text>
          </g>
        );
      })}
      {/* dividers between slots */}
      {Array.from({ length: PLINKO_SLOT_COUNT + 1 }, (_, i) => {
        const x = BOARD_LEFT + i * SLOT_W;
        return (
          <polygon
            key={i}
            className={styles.divider}
            points={`${(x - 5).toString()},${(SLOT_TOP - 16).toString()} ${(x + 5).toString()},${(SLOT_TOP - 16).toString()} ${(x + 7).toString()},${(SLOT_TOP + SLOT_H).toString()} ${(x - 7).toString()},${(SLOT_TOP + SLOT_H).toString()}`}
          />
        );
      })}

      {/* pegs: a diamond with a light and a shade facet */}
      {PEGS.map((peg) => (
        <g key={`${peg.row.toString()}-${peg.x.toString()}`}>
          <polygon
            className={styles.pegBase}
            points={`${peg.x.toString()},${(peg.y - PEG_R).toString()} ${(peg.x + PEG_R).toString()},${peg.y.toString()} ${peg.x.toString()},${(peg.y + PEG_R).toString()} ${(peg.x - PEG_R).toString()},${peg.y.toString()}`}
          />
          <polygon
            className={styles.pegLight}
            points={`${peg.x.toString()},${(peg.y - PEG_R + 3).toString()} ${peg.x.toString()},${(peg.y + PEG_R - 3).toString()} ${(peg.x - PEG_R + 3).toString()},${peg.y.toString()}`}
          />
        </g>
      ))}

      {/* the picked column */}
      {marker && (
        <polygon
          className={styles.marker}
          data-testid="plinko-marker"
          data-column={marker.column}
          style={{ fill: marker.color }}
          points={`${(slotCenter(marker.column) - 18).toString()},22 ${(slotCenter(marker.column) + 18).toString()},22 ${slotCenter(marker.column).toString()},56`}
        />
      )}

      {/* the chip, one stepped jump per peg row */}
      {chip && pos && (
        <g
          className={styles.chip}
          data-testid="plinko-chip"
          data-step={chip.step}
          data-landed={landed}
          data-slot={landed ? chip.slot : ''}
          style={{ transform: `translate(${pos.x.toString()}px, ${pos.y.toString()}px)` }}
        >
          <polygon className={styles.chipBase} style={{ fill: chip.color }} points={octagon(0, 0, CHIP_R)} />
          <polygon className={styles.chipShine} points={octagon(-5, -5, CHIP_R - 10)} />
        </g>
      )}

      {landed && (
        <text
          key={chip.id}
          className={styles.pop}
          data-testid="score-pop"
          x={slotCenter(chip.slot)}
          y={SLOT_TOP - 30}
          textAnchor="middle"
        >
          +{chip.points}
        </text>
      )}
    </svg>
  );
};
