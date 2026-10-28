import { useState } from 'react';
import { Badge } from '@/design/Badge';
import { Button } from '@/design/Button';
import { Inset } from '@/design/Inset';
import { Label } from '@/design/Label';
import { FM_JACKPOT } from '@/engines/feud/fastMoney';
import type { FastMoneyState } from '@/engines/feud/types';
import { displayName } from './labels';
import type { FeudHostData } from './types';
import styles from './ConsoleFastMoney.module.css';

export interface ConsoleFastMoneyProps {
  data: FeudHostData;
  fastMoney: FastMoneyState;
  onCommand: (name: string, args?: Record<string, unknown>) => void;
}

const podiumLabel = (names: readonly string[], index: number): string =>
  `${(index + 1).toString()}. ${displayName(names[index], index)}`;

/** Both players' answers with re-judging, the players picker and the totals (FR-031, FR-036). */
export const ConsoleFastMoney = ({ data, fastMoney: fm, onCommand }: ConsoleFastMoneyProps) => {
  const names = data.teams[fm.family].players;
  const [picked, setPicked] = useState<{ p1: number; p2: number }>({
    p1: fm.players?.p1 ?? 0,
    p2: fm.players?.p2 ?? (fm.podiumSize > 1 ? 1 : 0),
  });
  const canPick = fm.phase === 'setup' || fm.phase === 'p1-ready';
  const totals = data.fmTotals;

  const select = (player: 1 | 2, question: number) => {
    const record = (player === 1 ? fm.records.p1 : fm.records.p2)[question] ?? null;
    const other = (player === 1 ? fm.records.p2 : fm.records.p1)[question] ?? null;
    const survey = fm.questions[question];
    if (record === null || survey === undefined) return <span className={styles.none}>no answer</span>;
    const check = data.fmChecks.find((entry) => entry.player === player && entry.question === question);
    return (
      <span className={styles.cell}>
        <span className={styles.said}>
          {record.text}
          {check !== undefined && (
            <Badge tone="orange">
              CHECK{check.suggested === null ? '' : ` (suggested #${(check.suggested + 1).toString()})`}
            </Badge>
          )}
        </span>
        <select
          className={styles.select}
          aria-label={`Ruling for player ${player.toString()}, question ${(question + 1).toString()}`}
          value={record.slot === null ? 'none' : String(record.slot)}
          onChange={(event) => {
            onCommand('fm-set-match', {
              player,
              question,
              slot: event.target.value === 'none' ? null : Number(event.target.value),
            });
          }}
        >
          <option value="none">Not on the survey (0)</option>
          {survey.answers.map((answer, index) => (
            <option key={index} value={index} disabled={player === 2 && other?.slot === index}>
              {`${answer.answer} (${answer.points.toString()})${
                player === 2 && other?.slot === index ? " - player 1's answer" : ''
              }`}
            </option>
          ))}
        </select>
      </span>
    );
  };

  return (
    <Inset className={styles.panel} role="region" aria-label="Fast Money">
      <div className={styles.head}>
        <Label>Fast Money ({fm.phase})</Label>
        {totals !== null && (
          <span className={styles.totals}>
            Total on the board {totals.shown} of {FM_JACKPOT} (player 1 {totals.p1}, player 2 {totals.p2})
          </span>
        )}
      </div>
      {canPick && (
        <div className={styles.players}>
          {([1, 2] as const).map((player) => (
            <label key={player} className={styles.pick}>
              <span>Player {player}</span>
              <select
                className={styles.select}
                value={player === 1 ? picked.p1 : picked.p2}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setPicked((current) =>
                    player === 1 ? { ...current, p1: value } : { ...current, p2: value },
                  );
                }}
              >
                {Array.from({ length: fm.podiumSize }, (_, index) => (
                  <option key={index} value={index}>
                    {podiumLabel(names, index)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <Button
            variant="host"
            size="sm"
            onClick={() => {
              onCommand('fm-players', picked);
            }}
          >
            These two play
          </Button>
        </div>
      )}
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Question</th>
            <th>Player 1</th>
            <th>Player 2</th>
          </tr>
        </thead>
        <tbody>
          {fm.questions.map((question, index) => (
            <tr key={question.id}>
              <td>{question.question}</td>
              <td>{select(1, index)}</td>
              <td>{select(2, index)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Inset>
  );
};
