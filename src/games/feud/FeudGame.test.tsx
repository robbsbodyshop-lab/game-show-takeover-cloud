import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeudGame } from './FeudGame';
import { FastMoneyBoard } from './FastMoneyBoard';
import { FeudBoard } from './FeudBoard';
import { StrikeOverlay } from './StrikeOverlay';
import { TournamentBracket } from './TournamentBracket';
import { createBracket } from '@/engines/event/tournament';
import type { AudienceFastMoney } from '@/engines/feud/selectors';
import { makeGameProps, makeTeams, type GameFixture } from './testKit';
import { FEUD_TIMING } from './timing';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const tick = (ms: number): void => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};
/** Sends a host command; time moves on first so a repeat of the same command is not dropped. */
const send = (fixture: GameFixture, name: string, args?: Record<string, unknown>): void => {
  tick(FEUD_TIMING.repeatDropMs);
  act(() => {
    const outcome = fixture.host.send(name, args);
    expect(outcome.applied).toBe(true);
  });
};
const press = (fixture: GameFixture, team: number): void => {
  act(() => {
    fixture.phones.press(team, `p-${team.toString()}-${Math.random().toString()}`);
  });
};

/** Round 1: Team 1 buzzed first and is about to answer. Hidden: BURGER, TACOS, SALAD, SOUP (and the alias "pie"). */
const atFirstAnswer = (fixture: GameFixture) => {
  const view = render(<FeudGame {...fixture.props} />);
  send(fixture, 'advance');
  send(fixture, 'advance');
  press(fixture, 1);
  return view;
};

describe('FeudGame: the stage never shows hidden information', () => {
  it('has no hidden answer or alias anywhere in the rendered stage while the slots are hidden', () => {
    const fixture = makeGameProps();
    const { container } = atFirstAnswer(fixture);
    const html = container.innerHTML;
    for (const secret of ['PIZZA', 'BURGER', 'TACOS', 'SALAD', 'SOUP', 'pie', '>40<', '>25<']) {
      expect(html).not.toContain(secret);
    }
    expect(screen.getAllByLabelText(/Answer \d hidden/)).toHaveLength(5);
  });

  it('shows an answer only after the engine reveals it, and not the others', () => {
    const fixture = makeGameProps();
    const { container } = atFirstAnswer(fixture);
    send(fixture, 'judge-slot', { slot: 0 });
    expect(container.innerHTML).not.toContain('PIZZA');
    tick(FEUD_TIMING.surveySaysMs);
    const board = screen.getByRole('list', { name: 'Survey board' });
    expect(within(board).getByText('PIZZA')).toBeInTheDocument();
    expect(within(board).getByText('40')).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('BURGER');
    expect(container.innerHTML).not.toContain('TACOS');
  });

  it('keeps the survey answers out of the stage while a host review waits', () => {
    const fixture = makeGameProps({
      runtime: {
        rng: () => 0.5,
        recognizer: null,
        speak: vi.fn(),
        content: () => ({
          surveys: [
            {
              id: 'comms',
              question: 'Name a way to reach a friend.',
              answers: [
                { answer: 'PHONE CALL', points: 40 },
                { answer: 'TEXT MESSAGE', points: 30 },
                { answer: 'EMAIL', points: 20 },
                { answer: 'VIDEO CHAT', points: 10 },
              ],
            },
          ],
          fastMoney: [],
        }),
      },
    });
    const { container } = atFirstAnswer(fixture);
    send(fixture, 'submit-text', { text: 'phone call now' });
    expect(screen.getByText('CHECKING THE BOARD...')).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('PHONE CALL');
    expect(container.innerHTML).not.toContain('phone call now');
  });
});

describe('FeudGame: board, strikes and screens', () => {
  it('flips a slot from a blank bar to the answer with its points', () => {
    const fixture = makeGameProps();
    atFirstAnswer(fixture);
    const board = screen.getByRole('list', { name: 'Survey board' });
    expect(
      within(board)
        .getAllByRole('listitem')
        .filter((li) => li.dataset.state === 'hidden'),
    ).toHaveLength(5);
    send(fixture, 'judge-slot', { slot: 0 });
    tick(FEUD_TIMING.surveySaysMs);
    const revealed = within(board)
      .getAllByRole('listitem')
      .filter((li) => li.dataset.state === 'revealed');
    expect(revealed).toHaveLength(1);
    expect(revealed[0]).toHaveTextContent('1');
    expect(revealed[0]).toHaveTextContent('PIZZA');
    expect(revealed[0]).toHaveTextContent('40');
  });

  it('renders eight positions: unused ones are empty and aria-hidden', () => {
    const { container } = render(
      <FeudBoard
        slots={[{ revealed: false }, { revealed: false }, { revealed: false }, { revealed: false }]}
      />,
    );
    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(8);
    expect(container.querySelectorAll('li[data-state="empty"][aria-hidden="true"]')).toHaveLength(4);
  });

  it('shows the big red X with the number of strikes, then takes it away', () => {
    const fixture = makeGameProps();
    atFirstAnswer(fixture);
    send(fixture, 'judge-slot', { slot: 0 });
    tick(FEUD_TIMING.surveySaysMs);
    send(fixture, 'play');
    send(fixture, 'strike');
    expect(screen.getByRole('alert', { name: '1 strike' })).toBeInTheDocument();
    tick(FEUD_TIMING.repeatDropMs + 100);
    send(fixture, 'strike');
    expect(screen.getByRole('alert', { name: '2 strikes' })).toBeInTheDocument();
    tick(FEUD_TIMING.strikeOverlayMs);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders one X per strike in the overlay component', () => {
    const { container } = render(<StrikeOverlay id={1} count={3} />);
    expect(container.querySelectorAll('span')).toHaveLength(3);
    expect(screen.getByRole('alert', { name: '3 strikes' })).toBeInTheDocument();
  });

  it('shows the match card first, with the target score and the Fast Money note', () => {
    const fixture = makeGameProps({ settings: { targetScore: 400, format: 'full', answerTimerSec: 0 } });
    render(<FeudGame {...fixture.props} />);
    expect(screen.getByText('First family to 400 points wins')).toBeInTheDocument();
    expect(screen.getByText('The winners play Fast Money for 200 points')).toBeInTheDocument();
    expect(screen.getByText('Team 1')).toBeInTheDocument();
    expect(screen.getByText('Team 2')).toBeInTheDocument();
  });

  it('draws the bracket on the match card for three or more teams, current match outlined', () => {
    const teams = makeTeams(3);
    const bracket = createBracket([1, 2, 3]);
    const fixture = makeGameProps({ teams, bracket, match: undefined, playOrder: [1, 2, 3] });
    render(<FeudGame {...fixture.props} />);
    const group = screen.getByRole('group', { name: 'Tournament bracket' });
    expect(within(group).getAllByRole('list')).toHaveLength(3);
    const current = group.querySelector('[aria-current="true"]');
    expect(current).not.toBeNull();
    expect(current).toHaveTextContent('Team 2');
    expect(current).toHaveTextContent('Team 3');
    expect(screen.getByText('Match 1 of 2')).toBeInTheDocument();
  });

  it('names the rounds and marks byes in the bracket', () => {
    const bracket = createBracket([1, 2, 3]);
    render(<TournamentBracket bracket={bracket} teams={makeTeams(3)} />);
    expect(screen.getByText('FINAL')).toBeInTheDocument();
    expect(screen.getByText('ROUND 1')).toBeInTheDocument();
    expect(screen.getAllByText('BYE')).toHaveLength(1);
    render(<TournamentBracket bracket={createBracket([1, 2, 3, 4, 5, 6, 7, 8])} teams={makeTeams(8)} />);
    expect(screen.getByText('SEMIFINALS')).toBeInTheDocument();
  });

  it('shows the steal huddle with no clock for the audience', () => {
    const fixture = makeGameProps({
      settings: { answerTimerSec: 0, stealTimerSec: 30, format: 'one-round' },
    });
    atFirstAnswer(fixture);
    send(fixture, 'judge-slot', { slot: 0 });
    tick(FEUD_TIMING.surveySaysMs);
    send(fixture, 'play');
    for (let i = 0; i < 3; i += 1) {
      send(fixture, 'strike');
      tick(FEUD_TIMING.repeatDropMs + 100);
    }
    expect(screen.getByText('STEAL! HUDDLE')).toBeInTheDocument();
    expect(screen.queryByLabelText('Clock')).toBeNull();
    expect(screen.queryByText(/30/)).toBeNull();
  });

  it('plays a round to the won card, skips Fast Money and reports the game from the game-over card', () => {
    const fixture = makeGameProps();
    atFirstAnswer(fixture);
    send(fixture, 'judge-slot', { slot: 0 });
    tick(FEUD_TIMING.surveySaysMs);
    send(fixture, 'play');
    for (const slot of [1, 2, 3, 4]) {
      send(fixture, 'judge-slot', { slot });
      tick(FEUD_TIMING.surveySaysMs);
    }
    expect(screen.getByText('Round complete')).toBeInTheDocument();
    send(fixture, 'advance');
    expect(screen.getByRole('heading', { name: 'Team 1 win!' })).toBeInTheDocument();
    send(fixture, 'skip-fm');
    expect(screen.getByRole('heading', { name: 'Team 1 win the match' })).toBeInTheDocument();
    expect(screen.getByText('To the scoreboard')).toBeInTheDocument();
    expect(screen.getByText('Team 2 keep 0 points')).toBeInTheDocument();
    expect(fixture.onGameEnd).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(fixture.onGameEnd).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(fixture.onGameEnd).toHaveBeenCalledTimes(1);
  });
});

describe('FeudGame: Fast Money', () => {
  const rows: AudienceFastMoney['rows'] = [
    { question: 'Q1', youSaid: 'dog', surveySaid: { answer: 'DOG', points: 38 } },
    { question: 'Q2', youSaid: 'cat', surveySaid: null },
    { question: 'Q3', youSaid: null, surveySaid: { answer: null, points: 0 } },
  ];
  const fastMoney: AudienceFastMoney = {
    phase: 'p1-reveal',
    family: 'A',
    clock: { remainingMs: 0, running: false },
    question: null,
    answering: null,
    revealing: 1,
    rows,
    total: 38,
    p1Total: null,
    outcome: null,
  };

  it('renders five rows, "you said / survey said" as revealed, and the total', () => {
    render(<FastMoneyBoard fastMoney={fastMoney} />);
    const list = screen.getByRole('list', { name: 'Fast Money answers' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent('dog');
    expect(items[0]).toHaveTextContent('DOG');
    expect(items[0]).toHaveTextContent('38');
    expect(items[1]).toHaveTextContent('cat');
    expect(items[1]).not.toHaveTextContent('CAT');
    expect(items[2]).toHaveTextContent('NOT ON THE LIST');
    expect(items[3]).toHaveTextContent('');
    expect(screen.getByLabelText('Total')).toHaveTextContent('38');
    expect(screen.getByLabelText('Total')).toHaveTextContent('200 wins');
  });

  it('shows the question and the clock only while a player answers', () => {
    const fixture = makeGameProps();
    atFirstAnswer(fixture);
    send(fixture, 'judge-slot', { slot: 0 });
    tick(FEUD_TIMING.surveySaysMs);
    send(fixture, 'play');
    for (const slot of [1, 2, 3, 4]) {
      send(fixture, 'judge-slot', { slot });
      tick(FEUD_TIMING.surveySaysMs);
    }
    send(fixture, 'advance'); // won card
    send(fixture, 'advance'); // Fast Money, ready
    expect(screen.getByText('Player 1 is up')).toBeInTheDocument();
    expect(screen.queryByLabelText('Clock')).toBeNull();
    expect(screen.queryByText(/^Name something/)).toBeNull();

    send(fixture, 'advance'); // start the clock
    expect(screen.getByLabelText('Clock')).toHaveTextContent('20');
    expect(screen.getByText(/^Name something/)).toBeInTheDocument();
    tick(5000);
    expect(screen.getByLabelText('Clock')).toHaveTextContent('15');
  });
});

describe('FeudGame: host buttons, show mode and hotkeys', () => {
  it('labels the Enter step and runs it from the button', () => {
    const fixture = makeGameProps();
    render(<FeudGame {...fixture.props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start round 1' }));
    expect(screen.getByRole('button', { name: 'Start the face-off' })).toBeInTheDocument();
  });

  it('hides host-only buttons in show mode but keeps them in the page for hover', () => {
    const fixture = makeGameProps({ showMode: true });
    const { container } = render(<FeudGame {...fixture.props} />);
    const hostOnly = container.querySelector('[data-host-only]');
    expect(hostOnly).toHaveAttribute('data-show-mode', 'true');
    expect(
      within(hostOnly as HTMLElement).getByRole('button', { name: 'Start round 1' }),
    ).toBeInTheDocument();
  });

  it('shows the typed-answer box to the host and judges on Enter', () => {
    const fixture = makeGameProps();
    atFirstAnswer(fixture);
    const input = screen.getByLabelText('Type the answer');
    fireEvent.change(input, { target: { value: 'pizza' } });
    fireEvent.submit(input.closest('form')!);
    expect(screen.getByText('SURVEY SAYS...')).toBeInTheDocument();
    tick(FEUD_TIMING.surveySaysMs);
    expect(screen.getByText('PIZZA')).toBeInTheDocument();
  });

  it('omits the typed-answer box when only phones may answer', () => {
    const fixture = makeGameProps({
      settings: { answerTimerSec: 0, format: 'one-round', answersFrom: 'phones' },
    });
    atFirstAnswer(fixture);
    expect(screen.queryByLabelText('Type the answer')).toBeNull();
  });

  it('maps hotkeys: Enter advances, Space opens the buzzers, X strikes, U undoes; keys do nothing in a text box', () => {
    const fixture = makeGameProps();
    render(<FeudGame {...fixture.props} />);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Start the face-off' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.getByText('BUZZERS OPEN')).toBeInTheDocument();
    press(fixture, 2);
    const input = screen.getByLabelText('Type the answer');
    fireEvent.keyDown(input, { key: 'x' });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.keyDown(window, { key: 'x' });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'u' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ignores a held key, modifier combinations and every key while paused', () => {
    const fixture = makeGameProps();
    const { rerender } = render(<FeudGame {...fixture.props} />);
    fireEvent.keyDown(window, { key: 'Enter', repeat: true });
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    expect(screen.getByRole('button', { name: 'Start round 1' })).toBeInTheDocument();
    rerender(<FeudGame {...fixture.props} inputLocked />);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Start round 1' })).toBeInTheDocument();
  });

  it('asks twice before skipping Fast Money', () => {
    const fixture = makeGameProps();
    atFirstAnswer(fixture);
    send(fixture, 'judge-slot', { slot: 0 });
    tick(FEUD_TIMING.surveySaysMs);
    send(fixture, 'play');
    for (const slot of [1, 2, 3, 4]) {
      send(fixture, 'judge-slot', { slot });
      tick(FEUD_TIMING.surveySaysMs);
    }
    send(fixture, 'advance');
    fireEvent.click(screen.getByRole('button', { name: 'Skip Fast Money' }));
    expect(screen.getByRole('heading', { name: 'Team 1 win!' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tap again: skip Fast Money' }));
    expect(screen.getByRole('heading', { name: 'Team 1 win the match' })).toBeInTheDocument();
  });
});

describe('FeudGame: lifecycle', () => {
  it('restores from a saved state and publishes the host snapshot', () => {
    const first = makeGameProps();
    const view = atFirstAnswer(first);
    send(first, 'judge-slot', { slot: 0 });
    tick(FEUD_TIMING.surveySaysMs);
    const saved = JSON.parse(JSON.stringify(first.onStateChange.mock.calls.at(-1)?.[0])) as unknown;
    view.unmount();

    const second = makeGameProps({ initialState: saved });
    render(<FeudGame {...second.props} />);
    expect(screen.getByText('PIZZA')).toBeInTheDocument();
    expect(screen.getByText('Team 1 won the face-off')).toBeInTheDocument();
    expect(second.host.snapshots.length).toBeGreaterThan(0);
  });

  it('stops listening to the phones and host when it unmounts', () => {
    const fixture = makeGameProps();
    const view = render(<FeudGame {...fixture.props} />);
    expect(() => fixture.host.send('advance')).not.toThrow();
    view.unmount();
    expect(() => fixture.host.send('advance')).toThrow();
  });
});
