import { describe, expect, it, vi } from 'vitest';
import { eventsSince } from '@/engines/puzzle';
import { BANNER_HOLD_MS, MAX_FRAME_MS, PuzzleController, SOFT_DROP_MS } from './controller';
import { FakeFrames, fakeAudio } from './testSupport';

const make = (seed = 3) => {
  const audio = fakeAudio();
  const quit = vi.fn();
  const controller = new PuzzleController({ audio, onQuitToHub: quit, seed });
  const frames = new FakeFrames();
  controller.start(frames);
  return { controller, frames, audio, quit };
};

/** Title -> 1P setup -> START (row 4 of player 1's grid). */
const startOnePlayer = (c: PuzzleController): void => {
  c.selectTitle(0);
  c.setupAction({ type: 'click', player: 0, row: 4, col: 0 });
};

/** Title -> 2P setup -> both players START. */
const startTwoPlayers = (c: PuzzleController): void => {
  c.selectTitle(1);
  c.setupAction({ type: 'click', player: 0, row: 4, col: 0 });
  c.setupAction({ type: 'click', player: 1, row: 3, col: 0 });
};

const key = (c: PuzzleController, k: string, repeat = false): boolean => c.handleKeyDown({ key: k, repeat });

/** Player 1 slams capsules into the spawn columns until it tops out (player 2 then wins the round). */
const topOutPlayerOne = (c: PuzzleController, frames: FakeFrames): void => {
  for (let i = 0; i < 80 && c.getMatch().status === 'playing'; i++) {
    key(c, ' ');
    for (let t = 0; t < 300 && c.getMatch().status === 'playing'; t += 16) frames.frame(16);
  }
};

describe('menu flow', () => {
  it('starts on the title, and Back or Esc leave for the hub', () => {
    const { controller, quit } = make();
    expect(controller.getSnapshot().phase).toBe('title');
    key(controller, 's');
    key(controller, 's');
    expect(controller.getSnapshot().titleIndex).toBe(2);
    key(controller, ' ');
    expect(quit).toHaveBeenCalledTimes(1);
    key(controller, 'Escape');
    expect(quit).toHaveBeenCalledTimes(2);
  });

  it('1 Player opens setup for one player and Esc returns to the title', () => {
    const { controller } = make();
    key(controller, ' ');
    expect(controller.getSnapshot()).toMatchObject({ phase: 'setup', setup: { mode: '1p' } });
    key(controller, 'Escape');
    expect(controller.getSnapshot().phase).toBe('title');
  });

  it('starts a 1P match when START is pressed, with the chosen level, speed and music', () => {
    const { controller, audio } = make();
    key(controller, ' ');
    for (let i = 0; i < 6; i++) key(controller, 'd');
    key(controller, ' '); // level 7
    key(controller, 's');
    key(controller, 's');
    key(controller, 'd');
    key(controller, 'd');
    key(controller, ' '); // speed hi
    key(controller, 's');
    key(controller, 'd');
    key(controller, ' '); // music b
    key(controller, 's');
    key(controller, ' '); // START
    const snap = controller.getSnapshot();
    expect(snap.phase).toBe('match');
    const player = snap.match.players[0];
    expect(player).toMatchObject({ level: 7, speed: 'hi' });
    expect(snap.match.status).toBe('playing');
    expect(audio.music).toEqual(['stop', 'puzzle-music-b']);
  });

  it('needs both players in 2P: P1 on WASD + Space, P2 on the arrows + Enter', () => {
    const { controller } = make();
    key(controller, 's');
    key(controller, ' '); // 2 Players
    expect(controller.getSnapshot().setup.players).toHaveLength(2);
    key(controller, 'ArrowRight');
    key(controller, 'Enter'); // P2 level 2
    expect(controller.getSnapshot().setup.players.map((p) => p.level)).toEqual([1, 2]);
    for (let i = 0; i < 4; i++) key(controller, 's');
    key(controller, ' '); // P1 ready
    expect(controller.getSnapshot().phase).toBe('setup');
    for (let i = 0; i < 3; i++) key(controller, 'ArrowDown');
    key(controller, 'Enter'); // P2 ready
    expect(controller.getSnapshot().phase).toBe('match');
    expect(controller.getMatch().players.map((p) => p.level)).toEqual([1, 2]);
  });

  it('Esc in setup first cancels a ready player, then goes back', () => {
    const { controller } = make();
    key(controller, 's');
    key(controller, ' ');
    for (let i = 0; i < 4; i++) key(controller, 's');
    key(controller, ' ');
    expect(controller.getSnapshot().setup.players[0]?.ready).toBe(true);
    key(controller, 'Escape');
    expect(controller.getSnapshot().setup.players[0]?.ready).toBe(false);
    expect(controller.getSnapshot().phase).toBe('setup');
    key(controller, 'Escape');
    expect(controller.getSnapshot().phase).toBe('title');
  });

  it('plays hover on cursor moves and select on choices', () => {
    const { controller, audio } = make();
    key(controller, 's');
    expect(audio.count('puzzle-hover')).toBe(1);
    key(controller, 'w');
    key(controller, ' ');
    expect(audio.count('puzzle-select')).toBe(1);
    key(controller, 'd');
    expect(audio.count('puzzle-hover')).toBe(3);
  });
});

describe('frame loop', () => {
  it('feeds TICK with the real elapsed time, frame by frame', () => {
    const { controller, frames } = make();
    startOnePlayer(controller);
    frames.frame(16); // the first frame only records the time
    const before = controller.getMatch().players[0]?.gravityAcc ?? 0;
    frames.frame(40);
    frames.frame(70);
    expect((controller.getMatch().players[0]?.gravityAcc ?? 0) - before).toBe(110);
  });

  it('caps a long frame at 100 ms', () => {
    const { controller, frames } = make();
    startOnePlayer(controller);
    frames.frame(16);
    const before = controller.getMatch().players[0]?.gravityAcc ?? 0;
    frames.frame(900);
    expect((controller.getMatch().players[0]?.gravityAcc ?? 0) - before).toBe(MAX_FRAME_MS);
  });

  it('drops the capsule one row per gravity interval (LOW: 1000 ms)', () => {
    const { controller, frames } = make();
    startOnePlayer(controller);
    frames.frame(16);
    const row = controller.getMatch().players[0]?.active?.row ?? -1;
    frames.advance(2100);
    expect(controller.getMatch().players[0]?.active?.row).toBe(row + 2);
  });

  it('keeps animating after the loop stops being needed and stops cleanly', () => {
    const { controller, frames } = make();
    expect(frames.pending).toBe(1);
    controller.stop();
    expect(frames.pending).toBe(0);
  });

  it('notifies frame listeners every frame', () => {
    const { controller, frames } = make();
    const listener = vi.fn();
    const off = controller.subscribeFrame(listener);
    frames.advance(160);
    expect(listener).toHaveBeenCalledTimes(10);
    off();
    frames.advance(32);
    expect(listener).toHaveBeenCalledTimes(10);
  });

  it('does not re-notify React on plain ticks, only when the screen changes', () => {
    const { controller, frames } = make();
    startOnePlayer(controller);
    const listener = vi.fn();
    controller.subscribe(listener);
    frames.advance(500);
    expect(listener).not.toHaveBeenCalled();
    key(controller, 'p');
    expect(listener).toHaveBeenCalled();
  });
});

describe('input', () => {
  it('moves and rotates the capsule from the keys, ignoring key repeat', () => {
    const { controller, frames } = make();
    startOnePlayer(controller);
    frames.advance(32);
    const col = controller.getMatch().players[0]?.active?.col ?? -1;
    key(controller, 'a');
    key(controller, 'a', true);
    key(controller, 'a', true);
    expect(controller.getMatch().players[0]?.active?.col).toBe(col - 1);
    key(controller, 'd');
    expect(controller.getMatch().players[0]?.active?.col).toBe(col);
    const orientation = controller.getMatch().players[0]?.active?.orientation;
    frames.advance(1000); // fall off the spawn row so a rotation fits
    key(controller, 'w');
    expect(controller.getMatch().players[0]?.active?.orientation).not.toBe(orientation);
  });

  it('repeats the soft drop every 50 ms while the key is held, and stops on release', () => {
    const { controller, frames } = make();
    startOnePlayer(controller);
    frames.advance(32);
    const row = controller.getMatch().players[0]?.active?.row ?? -1;
    key(controller, 's');
    expect(controller.getMatch().players[0]?.active?.row).toBe(row + 1);
    frames.advance(SOFT_DROP_MS * 4 + 8);
    expect(controller.getMatch().players[0]?.active?.row).toBe(row + 5);
    controller.handleKeyUp({ key: 's' });
    frames.advance(500);
    expect(controller.getMatch().players[0]?.active?.row).toBe(row + 5);
  });

  it('hard drop locks the capsule at once', () => {
    const { controller, frames, audio } = make();
    startOnePlayer(controller);
    frames.advance(32);
    key(controller, ' ');
    expect(audio.count('puzzle-lock')).toBe(1);
    expect(controller.getMatch().players[0]?.stats.capsulesLocked).toBe(1);
  });

  it('ignores unknown keys', () => {
    const { controller } = make();
    startOnePlayer(controller);
    expect(key(controller, 'x')).toBe(false);
  });
});

describe('pause', () => {
  it('P pauses, no ticks or moves happen while paused, and P or Esc resumes', () => {
    const { controller, frames } = make();
    startOnePlayer(controller);
    frames.advance(300);
    key(controller, 'p');
    expect(controller.getSnapshot().overlay).toBe('paused');
    const frozen = controller.getMatch();
    frames.advance(5000);
    key(controller, 'a');
    key(controller, 'w');
    key(controller, 's');
    expect(controller.getMatch()).toBe(frozen);
    key(controller, 'Escape');
    expect(controller.getSnapshot().overlay).toBe('none');
    expect(controller.getMatch().status).toBe('playing');
    frames.advance(200);
    expect(controller.getMatch()).not.toBe(frozen);
  });

  it('plays the pause and resume cues and stops and restarts the music', () => {
    const { controller, audio } = make();
    startOnePlayer(controller);
    expect(audio.music).toEqual(['stop', 'puzzle-music-a']);
    key(controller, 'Escape');
    key(controller, 'Escape');
    expect(audio.count('puzzle-pause')).toBe(1);
    expect(audio.count('puzzle-resume')).toBe(1);
    expect(audio.music).toEqual(['stop', 'puzzle-music-a', 'stop', 'puzzle-music-a']);
  });

  it('Q quits to the title from the pause screen', () => {
    const { controller } = make();
    startOnePlayer(controller);
    key(controller, 'p');
    key(controller, 'q');
    expect(controller.getSnapshot().phase).toBe('title');
  });
});

describe('inputLocked', () => {
  it('stops ticks, keys and the animation clock, then resumes without a time jump', () => {
    const { controller, frames } = make();
    startOnePlayer(controller);
    frames.advance(200);
    controller.setInputLocked(true);
    const frozen = controller.getMatch();
    const anim = controller.getAnimMs();
    frames.advance(3000);
    expect(key(controller, 'a')).toBe(false);
    expect(controller.getMatch()).toBe(frozen);
    expect(controller.getAnimMs()).toBe(anim);
    controller.setInputLocked(false);
    const acc = controller.getMatch().players[0]?.gravityAcc ?? 0;
    frames.frame(16);
    frames.frame(16);
    expect((controller.getMatch().players[0]?.gravityAcc ?? 0) - acc).toBe(16);
  });

  it('blocks menu navigation and mouse choices too', () => {
    const { controller } = make();
    controller.setInputLocked(true);
    expect(key(controller, 's')).toBe(false);
    controller.selectTitle(0);
    expect(controller.getSnapshot().phase).toBe('title');
  });

  it('releases a held soft drop when locked', () => {
    const { controller, frames } = make();
    startOnePlayer(controller);
    frames.advance(32);
    key(controller, 's');
    controller.setInputLocked(true);
    controller.setInputLocked(false);
    const row = controller.getMatch().players[0]?.active?.row;
    frames.advance(300);
    expect(controller.getMatch().players[0]?.active?.row).toBe(row);
  });
});

describe('cues from engine events', () => {
  it('plays each cue exactly once per event seq, however many frames pass', () => {
    const { controller, frames, audio } = make();
    startOnePlayer(controller);
    frames.advance(32);
    key(controller, 'a');
    key(controller, 'd');
    key(controller, 'a');
    frames.advance(1100); // one gravity step
    key(controller, 'w');
    key(controller, ' ');
    frames.advance(4000);
    const events = eventsSince(controller.getMatch(), 0);
    const seqs = events.map((e) => e.seq);
    expect(new Set(seqs).size).toBe(seqs.length);
    const count = (type: string, pick: (e: (typeof events)[number]) => boolean = () => true): number =>
      events.filter((e) => e.type === type && pick(e)).length;
    expect(audio.count('puzzle-move')).toBe(count('move', (e) => e.type === 'move' && !e.auto));
    expect(audio.count('puzzle-rotate')).toBe(count('rotate'));
    expect(audio.count('puzzle-lock')).toBe(count('lock'));
    expect(audio.count('puzzle-fall')).toBe(count('fall'));
    expect(audio.count('puzzle-lock')).toBeGreaterThanOrEqual(1);
    expect(audio.count('puzzle-move')).toBeGreaterThanOrEqual(3);
  });

  it('does not replay old events when nothing new happens', () => {
    const { controller, frames, audio } = make();
    startOnePlayer(controller);
    key(controller, ' ');
    const plays = audio.plays.length;
    frames.advance(10);
    key(controller, 'x');
    expect(audio.plays.length).toBeGreaterThanOrEqual(plays);
    const again = audio.plays.filter((c) => c === 'puzzle-lock').length;
    expect(again).toBe(1);
  });
});

describe('round and match flow', () => {
  it('2P: a top-out ends the round, holds 1.5 s, then Start begins the next round', () => {
    const { controller, frames, audio } = make();
    startTwoPlayers(controller);
    topOutPlayerOne(controller, frames);
    const snap = controller.getSnapshot();
    expect(snap.overlay).toBe('round-over');
    expect(snap.match.roundWinner).toBe(1);
    expect(snap.match.roundWins).toEqual([0, 1]);
    expect(snap.holdDone).toBe(false);
    expect(audio.count('puzzle-top-out')).toBe(1);
    expect(audio.count('puzzle-round-win')).toBe(1);

    key(controller, 'Enter'); // too early
    expect(controller.getSnapshot().overlay).toBe('round-over');
    frames.advance(BANNER_HOLD_MS - 100);
    expect(controller.getSnapshot().holdDone).toBe(false);
    frames.advance(200);
    expect(controller.getSnapshot().holdDone).toBe(true);

    key(controller, 'Enter');
    const next = controller.getSnapshot();
    expect(next.overlay).toBe('none');
    expect(next.match.round).toBe(2);
    expect(next.match.status).toBe('playing');
    expect(next.match.roundWins).toEqual([0, 1]);
  });

  it('freezes the boards during the banner hold and ticks only once play resumes', () => {
    const { controller, frames } = make();
    startTwoPlayers(controller);
    topOutPlayerOne(controller, frames);
    const frozen = controller.getMatch();
    frames.advance(1000);
    expect(controller.getMatch()).toBe(frozen);
  });

  it('1P: topping out is game over; Start plays again with a fresh seed', () => {
    const { controller, frames, audio } = make();
    startOnePlayer(controller);
    topOutPlayerOne(controller, frames);
    let snap = controller.getSnapshot();
    expect(snap.overlay).toBe('match-over');
    expect(snap.match.matchWinner).toBeNull();
    expect(audio.count('puzzle-game-over')).toBe(0);
    frames.advance(BANNER_HOLD_MS + 100);
    expect(audio.count('puzzle-game-over')).toBe(1);
    const firstSeed = snap.match.seed;
    key(controller, ' ');
    snap = controller.getSnapshot();
    expect(snap.overlay).toBe('none');
    expect(snap.match.seed).toBe(firstSeed + 1);
    expect(snap.match.round).toBe(1);
  });

  it('Esc on a banner goes to the title at once, and the music stops', () => {
    const { controller, frames, audio } = make();
    startOnePlayer(controller);
    topOutPlayerOne(controller, frames);
    key(controller, 'Escape');
    expect(controller.getSnapshot().phase).toBe('title');
    expect(audio.music[audio.music.length - 1]).toBe('stop');
  });

  it('first to 3 rounds wins the match with a crown screen', () => {
    const { controller, frames, audio } = make();
    startTwoPlayers(controller);
    for (let round = 1; round <= 3; round++) {
      topOutPlayerOne(controller, frames);
      frames.advance(BANNER_HOLD_MS + 100);
      if (round < 3) key(controller, 'Enter');
    }
    const snap = controller.getSnapshot();
    expect(snap.overlay).toBe('match-over');
    expect(snap.match.matchWinner).toBe(1);
    expect(audio.count('puzzle-match-win')).toBe(1);
    expect(audio.count('puzzle-round-win')).toBe(2);
  });

  it('dispose stops the loop and the music', () => {
    const { controller, frames, audio } = make();
    startOnePlayer(controller);
    controller.dispose();
    expect(frames.pending).toBe(0);
    expect(audio.music[audio.music.length - 1]).toBe('stop');
  });
});
