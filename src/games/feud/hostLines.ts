/**
 * The lines the host reads out ("Say this" box) and the stake lines (FR-036). Host-only text:
 * these may mention the survey question, never reach the audience view.
 */
import { fastMoneyTotal } from '@/engines/feud/fastMoney';
import type { HostView, StakeLine, Stakes } from '@/engines/feud/selectors';
import { otherSide } from '@/engines/feud/types';
import { displayName } from './labels';
import type { FeudTeams, StakeTexts } from './types';

const points = (n: number): string => `${n.toString()} point${n === 1 ? '' : 's'}`;

const stakeLine = (line: StakeLine, teams: FeudTeams): string => {
  const name = teams[line.side].name;
  switch (line.reason) {
    case 'clear-board':
      return `${name} win ${points(line.points)} by clearing the board`;
    case 'third-strike-steal':
      return `${name} can steal ${points(line.points)} if they hit the board after a third strike`;
    case 'steal-hit':
      return `${name} win the bank of ${points(line.points)}`;
    case 'steal-miss':
      return `${name} keep the bank of ${points(line.points)}`;
  }
};

export const stakeTexts = (stakes: Stakes | null, teams: FeudTeams): StakeTexts | null =>
  stakes === null ? null : { ifWin: stakeLine(stakes.ifWin, teams), ifLose: stakeLine(stakes.ifLose, teams) };

export const playerName = (teams: FeudTeams, side: 'A' | 'B', index: number): string => {
  const team = teams[side];
  return displayName(team.players[index], index);
};

/** What to say next, in order. */
export const sayThis = (view: HostView, teams: FeudTeams): string[] => {
  const a = teams.A.name;
  const b = teams.B.name;
  const question = view.survey?.question ?? '';
  const scores = `${a} ${view.families.A.score.toString()}, ${b} ${view.families.B.score.toString()}.`;
  const fm = view.fastMoney;
  switch (view.phase) {
    case 'pre-game':
      return [
        `Welcome to the match: ${a} against ${b}.`,
        `First family to ${view.settings.targetScore.toString()} points wins.`,
      ];
    case 'round-intro':
      return [`Round ${view.round.toString()}. Points are times ${view.multiplier.toString()}.`];
    case 'sudden-death':
      return ['Nobody has the points, so it is Sudden Death. Triple points, top answer only.'];
    case 'face-off': {
      const faceOff = view.faceOff;
      if (faceOff?.stage === 'ready') {
        const index = (side: 'A' | 'B'): number =>
          (Math.max(view.round, 1) - 1) % view.families[side].podiumSize;
        return [
          `Give me ${playerName(teams, 'A', index('A'))} from ${a} and ${playerName(teams, 'B', index('B'))} from ${b}.`,
          `Top ${view.board.length.toString()} answers are on the board.`,
          question,
        ];
      }
      if (faceOff?.stage === 'buzzers-open') return ['Hands on the buzzers.', question];
      if (view.answering !== null) {
        const who = teams[view.answering.side].name;
        return [`${who}, your answer?`];
      }
      return [question];
    }
    case 'play-or-pass': {
      const winner = view.faceOff?.winner;
      return winner == null ? [] : [`${teams[winner].name} won the face-off. Play or pass?`];
    }
    case 'control': {
      const control = view.control;
      return control === null
        ? []
        : [
            `${teams[control.family].name}, ${playerName(teams, control.family, control.player)}, give me an answer.`,
            view.strikes === 0
              ? 'No strikes yet.'
              : `${view.strikes.toString()} strike${view.strikes === 1 ? '' : 's'}.`,
          ];
    }
    case 'steal-confer': {
      const stealer = view.steal?.family;
      if (stealer == null) return [];
      const seconds = view.settings.stealTimerSec;
      return [
        `Three strikes! ${teams[stealer].name}, you may confer${seconds > 0 ? ` for ${seconds.toString()} seconds` : ''}.`,
        'Then your captain gives one answer.',
      ];
    }
    case 'steal-answer': {
      const stealer = view.steal?.family;
      return stealer == null ? [] : [`${teams[stealer].name} captain, what is your answer?`];
    }
    case 'round-decided':
    case 'round-summary': {
      const result = view.roundResult;
      if (result === null) return [scores];
      return [
        `${teams[result.winner].name} take ${points(result.bank)}.`,
        view.phase === 'round-decided' ? "Let's see what else was on the board." : scores,
      ];
    }
    case 'game-won': {
      const winner = view.gameWinner;
      if (winner === null) return [scores];
      return [
        `${teams[winner].name} win the game!`,
        fm === null ? scores : `${teams[winner].name}, are you ready for Fast Money?`,
      ];
    }
    case 'fast-money': {
      if (fm === null) return [];
      const family = teams[fm.family].name;
      switch (fm.phase) {
        case 'p1-ready':
          return [
            'Player 2, step out of sight of the board.',
            'Player 1, you have 20 seconds. Pass if you are stuck.',
          ];
        case 'p2-ready':
          return [
            'Player 2, welcome. You have 25 seconds.',
            `${family} need ${(200 - fastMoneyTotal(fm)).toString()} more for the jackpot.`,
          ];
        case 'p1-reveal':
        case 'p2-reveal':
          return [`You said... survey said... total ${fastMoneyTotal(fm).toString()}.`];
        default:
          return [];
      }
    }
    case 'game-over': {
      const winner = view.gameWinner;
      if (winner === null) return [scores];
      const loser = otherSide(winner);
      return [
        `${teams[winner].name} finish with ${points(view.families[winner].score + (fm === null ? 0 : fastMoneyTotal(fm)))}.`,
        `${teams[loser].name} keep ${points(view.families[loser].score)}.`,
      ];
    }
  }
};
