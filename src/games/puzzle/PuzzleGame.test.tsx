import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioPlayer } from '@/audio/player';
import { BANNER_HOLD_MS } from './controller';
import { PuzzleGame } from './PuzzleGame';
import type { PuzzleGameProps } from './PuzzleGame';
import { FakeFrames } from './testSupport';

let frames = new FakeFrames();

const fakePlayer = () => ({
  play: vi.fn(),
  loop: vi.fn(),
  stopLoop: vi.fn(),
  preload: vi.fn(() => Promise.resolve()),
});

const setup = (props: Partial<PuzzleGameProps> = {}) => {
  const player = fakePlayer();
  const onQuitToHub = vi.fn();
  const view = render(
    <PuzzleGame
      inputLocked={false}
      showMode={false}
      audio={player as unknown as AudioPlayer}
      onQuitToHub={onQuitToHub}
      seed={3}
      {...props}
    />,
  );
  return { player, onQuitToHub, ...view };
};

const press = (key: string): void => {
  fireEvent.keyDown(window, { key });
  fireEvent.keyUp(window, { key });
};

const runFrames = (ms: number): void => {
  act(() => {
    frames.advance(ms);
  });
};

beforeEach(() => {
  frames = new FakeFrames();
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => frames.request(cb));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.cancel(id);
  });
  // jsdom has no canvas; the renderer is tested with a fake context.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  // Unmount first so the loop is cancelled through the stubbed cancelAnimationFrame.
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PuzzleGame menus', () => {
  it('shows the title card with 1 Player, 2 Players and Back', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Capsule Clinic' })).toBeInTheDocument();
    const menu = screen.getByRole('listbox', { name: 'Main menu' });
    const options = within(menu).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining('1 Player'),
      expect.stringContaining('2 Players'),
      expect.stringContaining('Back'),
    ]);
    expect(options[0]).toHaveAttribute('data-p1', 'true');
  });

  it('moves the title cursor with W/S and the arrows and opens 2 Players with Space', () => {
    setup();
    press('s');
    expect(screen.getByTestId('title-2p')).toHaveAttribute('data-p1', 'true');
    press('ArrowDown');
    expect(screen.getByTestId('title-back')).toHaveAttribute('data-p1', 'true');
    press('w');
    press('Enter');
    expect(screen.getByTestId('puzzle-setup')).toBeInTheDocument();
    expect(screen.getByTestId('setup-panel-1')).toBeInTheDocument();
    expect(screen.getByTestId('setup-panel-2')).toBeInTheDocument();
  });

  it('Back (and Esc on the title) leave for the hub', () => {
    const { onQuitToHub } = setup();
    press('Escape');
    expect(onQuitToHub).toHaveBeenCalledTimes(1);
    press('s');
    press('s');
    press(' ');
    expect(onQuitToHub).toHaveBeenCalledTimes(2);
  });

  it('chooses level, speed and music with tiles and the keyboard, then starts a 1P match', () => {
    setup();
    press(' '); // 1 Player
    expect(screen.queryByTestId('setup-panel-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('p1-level-1')).toHaveAttribute('aria-selected', 'true');
    for (let i = 0; i < 4; i++) press('d');
    press(' ');
    expect(screen.getByTestId('p1-level-5')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('p1-level-1')).toHaveAttribute('aria-selected', 'false');
    press('s');
    press('s');
    press('d');
    press(' ');
    expect(screen.getByTestId('p1-speed-med')).toHaveAttribute('aria-selected', 'true');
    press('s');
    press('d');
    press('d');
    press(' ');
    expect(screen.getByTestId('music-off')).toHaveAttribute('aria-selected', 'true');
    press('s');
    expect(screen.getByTestId('p1-start')).toHaveAttribute('data-p1', 'true');
    press(' ');
    expect(screen.getByTestId('puzzle-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('puzzle-game')).toHaveAttribute('data-phase', 'match');
  });

  it('also takes mouse clicks on tiles', () => {
    setup();
    fireEvent.click(screen.getByTestId('title-1p'));
    fireEvent.click(screen.getByTestId('p1-level-12'));
    expect(screen.getByTestId('p1-level-12')).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByTestId('music-b'));
    expect(screen.getByTestId('music-b')).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByTestId('p1-start'));
    expect(screen.getByTestId('puzzle-canvas')).toBeInTheDocument();
  });

  it('2P setup: P2 uses the arrows and Enter while P1 uses WASD and Space', () => {
    setup();
    press('s');
    press(' ');
    press('ArrowRight');
    press('ArrowRight');
    press('Enter');
    expect(screen.getByTestId('p2-level-3')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('p1-level-1')).toHaveAttribute('aria-selected', 'true');
    for (let i = 0; i < 4; i++) press('s');
    press(' ');
    expect(screen.getByTestId('setup-panel-1')).toHaveAttribute('data-ready', 'true');
    expect(screen.queryByTestId('puzzle-canvas')).not.toBeInTheDocument();
    for (let i = 0; i < 3; i++) press('ArrowDown');
    press('Enter');
    expect(screen.getByTestId('puzzle-canvas')).toBeInTheDocument();
  });

  it('Esc steps back from setup to the title', () => {
    setup();
    press(' ');
    press('Escape');
    expect(screen.getByTestId('puzzle-title')).toBeInTheDocument();
  });

  it('hides the keyboard hints in show mode', () => {
    setup({ showMode: true });
    expect(screen.queryByText(/Esc to go back/)).not.toBeInTheDocument();
  });
});

describe('PuzzleGame match', () => {
  const start1p = (): void => {
    press(' ');
    for (let i = 0; i < 4; i++) press('s');
    press(' ');
  };

  it('pauses with P or Esc, shows the overlay and resumes', () => {
    setup();
    start1p();
    expect(screen.queryByTestId('overlay-paused')).not.toBeInTheDocument();
    press('p');
    expect(screen.getByTestId('overlay-paused')).toBeInTheDocument();
    press('Escape');
    expect(screen.queryByTestId('overlay-paused')).not.toBeInTheDocument();
    press('Escape');
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.queryByTestId('overlay-paused')).not.toBeInTheDocument();
  });

  it('ignores keys while the stage locks input, and the loop stops ticking', () => {
    const { rerender, player } = setup();
    start1p();
    runFrames(100);
    rerender(
      <PuzzleGame
        inputLocked
        showMode={false}
        audio={player as unknown as AudioPlayer}
        onQuitToHub={() => undefined}
        seed={3}
      />,
    );
    press('p');
    expect(screen.queryByTestId('overlay-paused')).not.toBeInTheDocument();
    rerender(
      <PuzzleGame
        inputLocked={false}
        showMode={false}
        audio={player as unknown as AudioPlayer}
        onQuitToHub={() => undefined}
        seed={3}
      />,
    );
    press('p');
    expect(screen.getByTestId('overlay-paused')).toBeInTheDocument();
  });

  it('round over: banner, 1.5 s hold, then Press Start begins the next round', () => {
    setup();
    press('s');
    press(' ');
    for (let i = 0; i < 4; i++) press('s');
    press(' ');
    for (let i = 0; i < 3; i++) press('ArrowDown');
    press('Enter');
    for (let i = 0; i < 80 && !screen.queryByTestId('overlay-round-over'); i++) {
      press(' ');
      for (let t = 0; t < 300 && !screen.queryByTestId('overlay-round-over'); t += 16) runFrames(16);
    }
    const banner = screen.getByTestId('overlay-round-over');
    expect(banner).toHaveTextContent('Player 2 wins round 1');
    expect(screen.getByRole('button', { name: 'Press Start' })).toBeDisabled();
    runFrames(BANNER_HOLD_MS + 50);
    expect(screen.getByRole('button', { name: 'Press Start' })).toBeEnabled();
    press('Enter');
    expect(screen.queryByTestId('overlay-round-over')).not.toBeInTheDocument();
    expect(screen.getByTestId('puzzle-canvas')).toBeInTheDocument();
  });

  it('stops the loop and the music when it unmounts', () => {
    const { unmount, player } = setup();
    start1p();
    expect(player.loop).toHaveBeenCalledWith('puzzle-music-a');
    unmount();
    expect(frames.pending).toBe(0);
    expect(player.stopLoop).toHaveBeenCalledWith('puzzle-music-a');
  });
});
