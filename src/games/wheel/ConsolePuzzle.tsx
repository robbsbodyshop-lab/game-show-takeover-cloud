import { Inset, Label } from '@/design';
import type { WheelHostData } from './hostData';
import styles from './WheelConsole.module.css';

/** The top of the console: what is happening, the category, THE ANSWER and the vowel/consonant counts. */
export const ConsolePuzzle = ({ data }: { data: WheelHostData }) => (
  <div className={styles.group}>
    <Label>{data.headline || 'Waiting for the game'}</Label>
    <Inset className={styles.puzzle} data-testid="console-puzzle">
      {data.puzzle ? (
        <>
          <div className={styles.category}>
            {data.puzzle.category}
            {data.puzzle.theme ? ` | ${data.puzzle.theme}` : ''}
          </div>
          <div className={styles.answer} data-testid="console-answer">
            {data.puzzle.lines.length > 0
              ? data.puzzle.lines.map((line, i) => <div key={i}>{line}</div>)
              : data.puzzle.phrase}
          </div>
          <div className={styles.meta}>
            {data.puzzle.prize ? <span>Prize: {data.puzzle.prize}</span> : null}
            {data.puzzle.sameLetter ? <span>Same letter: {data.puzzle.sameLetter}</span> : null}
            <span>Consonants left: {data.consonantsLeft}</span>
            <span>Vowels left: {data.vowelsLeft}</span>
            {data.fullyRevealed ? <span>Fully revealed: someone must solve it</span> : null}
          </div>
        </>
      ) : (
        <div className={styles.meta}>
          {data.request
            ? `Getting ${data.request.use} puzzle${data.request.count === 1 ? '' : 's'}...`
            : 'No puzzle in play.'}
        </div>
      )}
    </Inset>
  </div>
);
