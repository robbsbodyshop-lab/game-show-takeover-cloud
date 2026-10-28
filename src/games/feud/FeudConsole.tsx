/**
 * The Family Feud host console (FR-036, HOST_FEATURE_INVENTORY.md 2.7 and 2.8). It shows the full board,
 * the stake lines, the host-only clocks, host review, the question browser and Fast Money, and sends
 * every action as a stamped command. It lives in the F2 drawer and in the host view.
 */
import { AnswerBox } from './AnswerBox';
import { Badge } from '@/design/Badge';
import { Button } from '@/design/Button';
import { Inset } from '@/design/Inset';
import { Label } from '@/design/Label';
import { ConsoleBoard } from './ConsoleBoard';
import { ConsoleBrowser } from './ConsoleBrowser';
import { ConsoleClock } from './ConsoleClock';
import { ConsoleControls } from './ConsoleControls';
import { ConsoleFastMoney } from './ConsoleFastMoney';
import { ConsoleReview } from './ConsoleReview';
import { registerHostConsole, type CommandOptions, type HostConsoleProps } from './consoleRegistry';
import { parseHostData } from './hostData';
import type { HostControl } from './hostControls';
import { useReceivedAt } from './useNow';
import styles from './FeudConsole.module.css';

/** Commands that rule on the player answering now; they carry that team so a late click is dropped. */
const RULINGS: ReadonlySet<string> = new Set([
  'judge-slot',
  'strike',
  'timeout',
  'pass',
  'repeat',
  'submit-text',
]);

const PHASE_LABELS: Record<string, string> = {
  'pre-game': 'Match card',
  'round-intro': 'Round intro',
  'face-off': 'Face-off',
  'play-or-pass': 'Play or pass',
  control: 'Control',
  'steal-confer': 'Steal huddle',
  'steal-answer': 'Steal answer',
  'round-decided': 'Round decided',
  'round-summary': 'Round summary',
  'sudden-death': 'Sudden Death',
  'game-won': 'Game won',
  'fast-money': 'Fast Money',
  'game-over': 'Game over',
};

export const FeudConsole = ({ snapshot, sendCommand }: HostConsoleProps) => {
  const received = useReceivedAt(snapshot);
  const data = parseHostData(snapshot.data);
  if (data === null) {
    return (
      <div className={styles.console} data-testid="feud-console">
        <p>Waiting for the Family Feud game...</p>
      </div>
    );
  }

  const { view } = data;
  const send = (name: string, args?: Record<string, unknown>, options: CommandOptions = {}): void => {
    const withTeam: CommandOptions =
      RULINGS.has(name) && data.answeringTeamId !== null && options.teamId === undefined
        ? { ...options, teamId: data.answeringTeamId }
        : options;
    sendCommand(name, args, withTeam);
  };
  const sendControl = (control: HostControl, gameRev?: number): void => {
    send(control.command, control.args, gameRev === undefined ? {} : { gameRev });
  };

  const waiting = data.ruling !== null || data.pendingReview !== null;
  const canJudge =
    (view.answering !== null || view.phase === 'steal-confer') && !waiting && !snapshot.inputLocked;
  const winner = view.gameWinner;
  const answeringTeam = view.answering === null ? null : data.teams[view.answering.side];
  const stealUntimed = view.phase === 'steal-confer' && view.settings.stealTimerSec === 0;

  return (
    <div className={styles.console} data-testid="feud-console" data-phase={view.phase}>
      <header className={styles.head}>
        <h2 className={styles.title}>
          {data.matchLabel === null ? '' : `${data.matchLabel}: `}
          {view.round > 0 ? `Round ${view.round.toString()}, ` : ''}
          {PHASE_LABELS[view.phase] ?? view.phase}
        </h2>
        <p className={styles.scores}>
          <span>
            {data.teams.A.name} <strong>{view.families.A.score}</strong>
          </span>
          <span>
            {data.teams.B.name} <strong>{view.families.B.score}</strong>
          </span>
          <Badge tone="gold">{`x${view.multiplier.toString()}`}</Badge>
          <Badge tone="cream">{`Bank ${view.bank.toString()}`}</Badge>
          {view.strikes > 0 && <Badge tone="orange">{`${view.strikes.toString()} strikes`}</Badge>}
        </p>
        {snapshot.inputLocked && <Badge tone="orange">Paused: commands are ignored</Badge>}
      </header>

      <div className={styles.clocks}>
        <ConsoleClock label="Answer timer" clock={data.clocks.answer} receivedAt={received} />
        <ConsoleClock
          label="Steal huddle"
          clock={data.clocks.steal}
          receivedAt={received}
          emptyText={stealUntimed ? 'host calls it' : 'off'}
        />
        {data.clocks.fastMoney !== null && (
          <ConsoleClock label="Fast Money clock" clock={data.clocks.fastMoney} receivedAt={received} />
        )}
        <Inset className={styles.who}>
          <Label>Answering</Label>
          <p className={styles.whoName}>
            {answeringTeam === null ? 'nobody' : `${answeringTeam.name}: ${data.answeringPlayer ?? ''}`}
          </p>
          {data.mic.status !== 'off' && (
            <p className={styles.mic}>
              Mic {data.mic.status}
              {data.mic.transcript === '' ? '' : `: "${data.mic.transcript}"`}
            </p>
          )}
        </Inset>
      </div>

      {data.stakes !== null && (
        <Inset className={styles.stakes} aria-label="Stake lines">
          <p>
            <strong>If they win:</strong> {data.stakes.ifWin}
          </p>
          <p>
            <strong>If they lose:</strong> {data.stakes.ifLose}
          </p>
        </Inset>
      )}

      <Inset className={styles.say} aria-label="Say this">
        <Label>Say this</Label>
        {data.sayThis.map((line, index) => (
          <p key={index} className={styles.line}>
            {line}
          </p>
        ))}
      </Inset>

      {data.pendingReview !== null && (
        <ConsoleReview
          review={data.pendingReview}
          board={view.board}
          teamName={data.teams[data.pendingReview.side].name}
          onCommand={(name, args) => {
            send(name, args);
          }}
        />
      )}
      {data.ruling !== null && (
        <Inset className={styles.ruling}>
          <Label>Survey says...</Label>
          <p className={styles.line}>
            {data.ruling.slot === 'miss'
              ? 'Ruled a miss'
              : `Ruled #${(data.ruling.slot + 1).toString()} ${view.board[data.ruling.slot]?.answer ?? ''}`}
            . Enter shows it now, Undo cancels.
          </p>
        </Inset>
      )}

      <ConsoleControls controls={data.controls} gameRev={snapshot.gameRev} onSend={sendControl} />

      {view.answering !== null && data.answerSources.host && !waiting && (
        <Inset className={styles.typing}>
          <AnswerBox
            onSubmit={(text) => {
              send('submit-text', { text });
            }}
            onTyping={() => {
              send('hold-answer');
            }}
          />
          {data.settings.voice === 'on' && (
            <Button
              variant="quiet"
              size="sm"
              onClick={() => {
                send('mic', { on: data.mic.status !== 'listening' });
              }}
            >
              {data.mic.status === 'listening' ? 'Mic off' : 'Mic on'}
            </Button>
          )}
        </Inset>
      )}

      <section aria-label="Answer sheet" className={styles.sheet}>
        <Label>
          {view.survey?.question ?? 'No question yet'}
          {data.surveyedText === null ? '' : ` (${data.surveyedText})`}
        </Label>
        <ConsoleBoard
          board={view.board}
          canJudge={canJudge}
          onJudge={(slot) => {
            send('judge-slot', { slot });
          }}
        />
      </section>

      {view.fastMoney !== null && view.fastMoney.questions.length > 0 && (
        <ConsoleFastMoney
          data={data}
          fastMoney={view.fastMoney}
          onCommand={(name, args) => {
            send(name, args);
          }}
        />
      )}

      <ConsoleBrowser
        content={data.content}
        canUse={['round-intro', 'sudden-death', 'face-off', 'play-or-pass', 'control'].includes(view.phase)}
        onCommand={(name, args) => {
          send(name, args);
        }}
      />

      {view.phase === 'game-over' && winner !== null && (
        <Inset className={styles.over}>
          <Label>Result</Label>
          <p className={styles.line}>
            {data.teams[winner].name}: game {view.families[winner].score}
            {data.fmTotals === null ? '' : ` + Fast Money ${data.fmTotals.shown.toString()}`}.{' '}
            {data.endReported ? 'Reported to the event.' : 'Continue reports it to the event.'}
          </p>
        </Inset>
      )}
    </div>
  );
};

/** Puts the Feud console in the host console registry (the F2 drawer and the host view look it up). */
// eslint-disable-next-line react-refresh/only-export-components -- the registration belongs next to the console it registers
export const registerFeudConsole = (): void => {
  registerHostConsole('feud', FeudConsole);
};
