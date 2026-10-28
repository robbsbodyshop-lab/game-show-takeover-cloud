import type { CommandResult, HostCommandInput } from './hostProtocol';

const REASONS: Record<string, string> = {
  timeout: 'the stage did not answer',
  stale: 'the game had moved on, try again',
  duplicate: 'that was just pressed',
  'no-handler': 'nothing on the stage handles it right now',
  locked: 'the game is paused or showing a dialog',
  'unknown-target': 'the stage does not know that screen',
  disposed: 'the host view was closed',
};

/** One line for the host view's status area after a command. */
export function describeResult(command: HostCommandInput, result: CommandResult): string {
  const label = `${command.name}${command.teamId === undefined ? '' : ` (team ${String(command.teamId)})`}`;
  if (result.applied) return `${label}: done`;
  return `${label}: not applied, ${REASONS[result.reason] ?? result.reason}`;
}
