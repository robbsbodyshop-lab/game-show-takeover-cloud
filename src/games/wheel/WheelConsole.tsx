import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/design';
import type { HostConsoleProps } from '@/host/consoleRegistry';
import type { CommandResult } from '@/host/hostProtocol';
import { ClockBar } from './ClockBar';
import { ConsolePhones } from './ConsolePhones';
import { ConsolePlay } from './ConsolePlay';
import { ConsolePuzzle } from './ConsolePuzzle';
import { ConsoleRulings } from './ConsoleRulings';
import { ConsoleScores } from './ConsoleScores';
import { ConsoleSettings } from './ConsoleSettings';
import type { ConsoleSend } from './consoleTypes';
import { readWheelHostData } from './hostData';
import styles from './WheelConsole.module.css';

/**
 * The Wheel console for the F2 drawer and the host view (FR-043, T21): the puzzle and its answer, the
 * legal actions, the next puzzle, rulings (a close answer, Judge, Reverse, Late answer), the tools
 * (Skip, Set turn, Throw out, End unsolved, Adjust bank, Ring the bell, Undo), the live turn timer, the
 * next-game form, the sealed envelope and the phone podium status. Every button is one host command,
 * stamped with the game revision by the host client and with the acting team where the game needs it.
 */
export const WheelConsole = ({ snapshot, send }: HostConsoleProps) => {
  const data = useMemo(() => readWheelHostData(snapshot.data), [snapshot.data]);
  const [last, setLast] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const sendCommand: ConsoleSend = (name, args, teamId) => {
    const result = send({
      target: 'wheel',
      name,
      ...(args === undefined ? {} : { args }),
      ...(teamId === undefined ? {} : { teamId }),
    });
    void Promise.resolve(result).then((r: CommandResult) => {
      if (mounted.current) setLast(r.applied ? null : `Not applied: ${r.reason}`);
    });
  };

  return (
    <div className={styles.root} data-testid="wheel-console">
      {snapshot.inputLocked ? (
        <Badge tone="orange" role="status">
          Paused: clocks are held
        </Badge>
      ) : null}
      {last ? (
        <Badge tone="orange" role="alert">
          {last}
        </Badge>
      ) : null}
      <ConsolePuzzle data={data} />
      {data.clock ? <ClockBar clock={data.clock} /> : null}
      <ConsoleRulings data={data} send={sendCommand} />
      <ConsolePlay data={data} send={sendCommand} />
      <ConsoleScores data={data} send={sendCommand} />
      <ConsoleSettings data={data} send={sendCommand} />
      <ConsolePhones data={data} />
    </div>
  );
};
