import { fireEvent, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventAction } from '@/engines/event';
import { EventHarness } from '../speed/EventHarness';
import { spiedAudio, winnerSession } from '../speed/testKit';
import { WinnerScreen } from './WinnerScreen';

function mount(scores: number[], opts: { locked?: boolean; showMode?: boolean } = {}) {
  const log: EventAction[] = [];
  const audio = spiedAudio();
  const Wrap = ({ locked }: { locked: boolean }) => (
    <EventHarness initial={winnerSession(scores)} log={log}>
      {(session, dispatch) => (
        <WinnerScreen
          session={session}
          dispatch={dispatch}
          inputLocked={locked}
          showMode={opts.showMode ?? false}
          audio={audio.audio}
        />
      )}
    </EventHarness>
  );
  const view = render(<Wrap locked={opts.locked ?? false} />);
  return {
    log,
    audio,
    rerender: (locked: boolean) => {
      view.rerender(<Wrap locked={locked} />);
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('WinnerScreen', () => {
  it('announces the champion huge, in the team colour', () => {
    mount([300, 200, 100]);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('AND THE WINNER IS');
    const name = screen.getByTestId('champion-name');
    expect(name).toHaveTextContent('Team 1');
    expect(name).toHaveAttribute('data-team', '1');
    expect(name.getAttribute('style')).toMatch(/color:/);
  });

  it('lists the final standings by rank', () => {
    mount([100, 300, 200]);
    const rows = screen.getAllByTestId(/^standing-/);
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'standing-2',
      'standing-3',
      'standing-1',
    ]);
    expect(screen.getByTestId('rank-2')).toHaveTextContent('1');
    expect(screen.getByTestId('rank-3')).toHaveTextContent('2');
    expect(screen.getByTestId('rank-1')).toHaveTextContent('3');
    expect(screen.queryByText('Tie')).toBeNull();
  });

  it('shows a tie for first as shared, with every leader named', () => {
    mount([300, 300, 100]);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('IT IS A TIE');
    expect(screen.getAllByTestId('champion-name').map((n) => n.textContent)).toEqual(['Team 1', 'Team 2']);
    expect(screen.getByTestId('rank-1')).toHaveTextContent('1');
    expect(screen.getByTestId('rank-2')).toHaveTextContent('1');
    expect(screen.getByTestId('rank-3')).toHaveTextContent('3');
    expect(screen.getAllByText('Tie')).toHaveLength(2);
  });

  it('draws stepped sparkle pixels, not confetti', () => {
    mount([1, 0]);
    expect(screen.getByTestId('sparkles').children.length).toBeGreaterThan(10);
  });

  it('plays the winner fanfare exactly once, even across re-renders', () => {
    const { audio, rerender } = mount([300, 200]);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.play).toHaveBeenCalledWith('winner_fanfare');
    rerender(false);
    rerender(true);
    rerender(false);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('holds the fanfare until input is unlocked', () => {
    const { audio, rerender } = mount([300, 200], { locked: true });
    expect(audio.play).not.toHaveBeenCalled();
    rerender(false);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('goes back to the hub in one tap', () => {
    const { log } = mount([3, 2]);
    fireEvent.click(screen.getByRole('button', { name: 'Back to hub' }));
    expect(log).toEqual([{ type: 'GO_HUB' }]);
  });

  it('needs two taps to start a new event and disarms after four seconds', () => {
    const { log } = mount([3, 2]);
    fireEvent.click(screen.getByRole('button', { name: 'Start new event' }));
    expect(log).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start new event' }));
    expect(log).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Tap again: end this event' }));
    expect(log).toEqual([{ type: 'NEW_EVENT' }]);
  });

  it('ignores a held Enter or Space', () => {
    const { log } = mount([3, 2]);
    const back = screen.getByRole('button', { name: 'Back to hub' });
    fireEvent.keyDown(back, { key: 'Enter', repeat: true });
    fireEvent.click(back);
    expect(log).toEqual([]);
    fireEvent.keyUp(back, { key: 'Enter' });
    act(() => {
      vi.advanceTimersByTime(1);
    });
    fireEvent.click(back);
    expect(log).toEqual([{ type: 'GO_HUB' }]);
  });

  it('hides the host buttons in show mode and returns them on hover', () => {
    mount([3, 2], { showMode: true });
    expect(screen.getByTestId('champion-name')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to hub' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start new event' })).toBeNull();
    fireEvent.mouseEnter(screen.getByTestId('host-zone'));
    expect(screen.getByRole('button', { name: 'Back to hub' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start new event' })).toBeInTheDocument();
  });
});
