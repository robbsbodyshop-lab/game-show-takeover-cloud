import { NumberDisplay } from '@/design/NumberDisplay';
import { FM_JACKPOT, FM_QUESTION_COUNT } from '@/engines/feud/fastMoney';
import type { AudienceFastMoney } from '@/engines/feud/selectors';
import styles from './FastMoneyBoard.module.css';

export interface FastMoneyBoardProps {
  fastMoney: AudienceFastMoney;
}

/** Five rows ("You said" / "Survey said") and the total. Rows fill in as the host reveals them. */
export const FastMoneyBoard = ({ fastMoney }: FastMoneyBoardProps) => (
  <div className={styles.board}>
    <ol className={styles.rows} aria-label="Fast Money answers">
      {Array.from({ length: FM_QUESTION_COUNT }, (_, index) => {
        const row = fastMoney.rows[index];
        return (
          <li key={index} className={styles.row} data-shown={row === undefined ? 'false' : 'true'}>
            <span className={styles.said}>{row === undefined ? '' : (row.youSaid ?? '-')}</span>
            <span className={styles.survey}>
              {row?.surveySaid == null ? '' : (row.surveySaid.answer ?? 'NOT ON THE LIST')}
            </span>
            <span className={styles.points}>{row?.surveySaid == null ? '' : row.surveySaid.points}</span>
          </li>
        );
      })}
    </ol>
    <div className={styles.total} aria-label="Total">
      <span className={styles.totalLabel}>TOTAL</span>
      <NumberDisplay value={fastMoney.total} size="xl" />
      <span className={styles.target}>{FM_JACKPOT} wins</span>
    </div>
  </div>
);
