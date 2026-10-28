import { Button, Inset, Label } from '@/design';
import type { ConsoleSectionProps } from './consoleTypes';
import { has } from './consoleTypes';
import styles from './WheelConsole.module.css';

/** Rulings: a close answer, Judge, Reverse, Late answer (inventory 2.9 "Rulings"). */
export const ConsoleRulings = ({ data, send }: ConsoleSectionProps) => {
  const name = (id: number | null): string => data.teams.find((t) => t.id === id)?.name ?? 'Team';
  const canRule = has(data, 'HOST_SOLVE_OVERRIDE');
  const reversible = data.reversible;
  return (
    <div className={styles.group}>
      <Label>Rulings</Label>
      <Inset className={styles.rulings} data-testid="console-rulings">
        {data.pending ? (
          <div className={styles.pending} role="status">
            <div>
              {name(data.pending.team)} said: <strong>{data.pending.answer}</strong>
              {data.pending.source === 'phone' ? ' (from the phone)' : ''}. Close, not word for word.
            </div>
            <div className={styles.row}>
              <Button
                variant="confirm"
                onClick={() => {
                  send('accept-pending', undefined, data.pending?.team);
                }}
              >
                Accept
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  send('reject-pending', undefined, data.pending?.team);
                }}
              >
                Reject
              </Button>
            </div>
          </div>
        ) : null}
        <div className={styles.row}>
          <Button
            variant="confirm"
            disabled={!canRule || reversible?.verdict === 'correct'}
            onClick={() => {
              send('rule', { verdict: 'correct' }, data.acting ?? undefined);
            }}
          >
            Judge: correct
          </Button>
          <Button
            variant="danger"
            disabled={!canRule || reversible?.verdict === 'wrong'}
            onClick={() => {
              send('rule', { verdict: 'wrong' }, data.acting ?? undefined);
            }}
          >
            Judge: wrong
          </Button>
        </div>
        {reversible ? (
          <Button
            variant="host"
            onClick={() => {
              send(
                'rule',
                { verdict: reversible.verdict === 'correct' ? 'wrong' : 'correct' },
                reversible.team ?? undefined,
              );
            }}
          >
            Reverse: {name(reversible.team)} was ruled {reversible.verdict === 'correct' ? 'right' : 'wrong'}
          </Button>
        ) : null}
        {!canRule && !data.pending && !reversible ? (
          <div className={styles.meta}>Nobody is solving yet.</div>
        ) : null}
        {data.canLateSolve ? (
          <Button
            variant="secondary"
            onClick={() => {
              send('late-solve');
            }}
          >
            Late answer: {name(data.turn)} must give the solve back
          </Button>
        ) : null}
        {data.canAcceptLateBonus ? (
          <Button
            variant="secondary"
            onClick={() => {
              send('accept-late');
            }}
          >
            Accept: the answer started before the buzzer
          </Button>
        ) : null}
      </Inset>
    </div>
  );
};
