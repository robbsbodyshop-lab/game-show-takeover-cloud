import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { audienceView } from '@/engines/wheel/selectors';
import { createPuzzleState } from '@/engines/wheel/puzzleState';
import { makePuzzle, toRound } from '@/engines/wheel/testKit';
import { PuzzleBoard } from './PuzzleBoard';

describe('PuzzleBoard', () => {
  it('lays rows out 12 / 14 / 14 / 12 and shows one tile per letter', () => {
    const board = audienceView(toRound(1)).board;
    render(<PuzzleBoard board={board} />);
    const rows = screen.getAllByTestId('board-row');
    expect(rows.map((r) => Number(r.getAttribute('data-width')))).toEqual([12, 14, 14, 12]);
    // RED APPLE PIE: 3 + 5 + 3 letters
    expect(screen.getAllByTestId('tile')).toHaveLength(11);
    expect(screen.getAllByTestId('void')).toHaveLength(12 + 14 + 14 + 12 - 11);
  });

  it('shows an empty board of voids when there is no puzzle yet', () => {
    render(<PuzzleBoard board={null} />);
    expect(screen.getAllByTestId('board-row').map((r) => r.children.length)).toEqual([12, 14, 14, 12]);
    expect(screen.queryAllByTestId('tile')).toHaveLength(0);
  });

  it('fits a four-line puzzle on all four rows', () => {
    const four = createPuzzleState(
      makePuzzle('A WELL DESERVED REST AFTER A LONG DAY AT WORK', {
        lines: ['A WELL', 'DESERVED REST', 'AFTER A LONG', 'DAY AT WORK'],
      }),
    );
    expect(four).not.toBeNull();
    const state = { ...toRound(1), puzzle: four };
    render(<PuzzleBoard board={audienceView(state).board} />);
    const rows = screen.getAllByTestId('board-row');
    const tilesPerRow = rows.map((r) => within(r).queryAllByTestId('tile').length);
    expect(tilesPerRow.every((n) => n > 0)).toBe(true);
    expect(tilesPerRow.reduce((a, b) => a + b, 0)).toBe(four?.tiles.length);
  });

  it('prints only lit letters: an unlit tile has no text at all', () => {
    const base = toRound(1);
    const ps = base.puzzle;
    if (!ps) throw new Error('no puzzle');
    const shown = ps.shown.map((_, i) => i === 0 || i === 4);
    const state = { ...base, puzzle: { ...ps, shown } };
    const board = audienceView(state).board;
    render(<PuzzleBoard board={board} />);
    const tiles = screen.getAllByTestId('tile');
    const lit = tiles.filter((t) => t.getAttribute('data-lit') === 'true');
    expect(lit).toHaveLength(2);
    expect(lit.map((t) => t.textContent)).toEqual(['R', 'P']);
    for (const t of tiles.filter((x) => x.getAttribute('data-lit') === 'false'))
      expect(t.textContent).toBe('');
    expect(within(screen.getByTestId('puzzle-board')).queryByText('APPLE')).toBeNull();
  });

  it('shows punctuation and flags the solved and flash states', () => {
    const board = [[{ kind: 'punct', char: '&' } as const, { kind: 'tile', lit: true, char: 'A' } as const]];
    render(<PuzzleBoard board={board} solved flash="good" />);
    expect(screen.getByText('&')).toBeInTheDocument();
    const frame = screen.getByTestId('puzzle-board');
    expect(frame).toHaveAttribute('data-solved', 'true');
    expect(frame).toHaveAttribute('data-flash', 'good');
  });
});
