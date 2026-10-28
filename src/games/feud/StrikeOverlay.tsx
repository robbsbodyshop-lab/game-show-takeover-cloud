import styles from './StrikeOverlay.module.css';

export interface StrikeOverlayProps {
  /** Changes with every new X so the pop animation replays. */
  id: number;
  /** 1 to 3 big red X's. */
  count: number;
}

/** The big red X over the whole stage. */
export const StrikeOverlay = ({ id, count }: StrikeOverlayProps) => {
  const shown = Math.min(3, Math.max(1, count));
  return (
    <div
      className={styles.overlay}
      role="alert"
      aria-label={`${shown.toString()} strike${shown === 1 ? '' : 's'}`}
    >
      <div key={id} className={styles.row} data-count={shown}>
        {Array.from({ length: shown }, (_, index) => (
          <span key={index} className={styles.x} aria-hidden="true">
            X
          </span>
        ))}
      </div>
    </div>
  );
};
