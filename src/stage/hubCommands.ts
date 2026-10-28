/**
 * Hub-level host commands (`target: 'hub'`, hostProtocol.ts HUB_COMMANDS). The two-tap confirmation
 * of "quit game" and "reset scores" belongs to the host surface, so a command that arrives here is
 * already confirmed (agent brief).
 */
import type { CommandResult, HostCommand } from '@/host/hostProtocol';
import type { GamePhase } from '@/engines/event';
import type { InjectResult } from './phoneBridge';

export const LOCKED_REASON = 'The game is paused or showing a dialog';

export interface HubCommandContext {
  phase: GamePhase;
  paused: boolean;
  showMode: boolean;
  /** Paused, a dialog open, or this stage is read-only. */
  locked: boolean;
  setPaused(paused: boolean): void;
  setShowMode(on: boolean): void;
  /** Confirmed quit of the running game or finale screen; false when there is nothing to quit. */
  quitGame(): boolean;
  /** Confirmed reset of scores and chips; false when the phase does not allow it. */
  resetScores(): boolean;
  buzz(team: number): InjectResult;
}

const OK: CommandResult = { applied: true };
const no = (reason: string): CommandResult => ({ applied: false, reason });

const teamOf = (command: HostCommand): number | null => {
  const fromArgs = command.args?.team;
  const team = command.teamId ?? (typeof fromArgs === 'number' ? fromArgs : null);
  return team !== null && Number.isInteger(team) ? team : null;
};

export function handleHubCommand(command: HostCommand, ctx: HubCommandContext): CommandResult {
  switch (command.name) {
    case 'pause':
      ctx.setPaused(true);
      return OK;
    case 'resume':
      ctx.setPaused(false);
      return OK;
    case 'show-mode': {
      const on = command.args?.on;
      ctx.setShowMode(typeof on === 'boolean' ? on : !ctx.showMode);
      return OK;
    }
    case 'buzz': {
      const team = teamOf(command);
      if (team === null) return no('A team is required');
      if (ctx.locked) return no(LOCKED_REASON);
      switch (ctx.buzz(team)) {
        case 'delivered':
          return OK;
        case 'unknown-team':
          return no('That team is not in this event');
        case 'rate-limited':
          return no('Too fast');
        case 'locked':
          return no(LOCKED_REASON);
      }
      return no('Not delivered');
    }
    case 'quit-game':
      return ctx.quitGame() ? OK : no('No game is running');
    case 'reset-scores':
      return ctx.resetScores() ? OK : no('Scores cannot be reset on this screen');
    default:
      return no('Unknown command');
  }
}
