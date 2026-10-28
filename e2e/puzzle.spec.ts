import { expect, test, type Locator } from '@playwright/test';
import { hubTile, stageAtSetup, startGame } from './helpers';

/** The count of non-transparent pixels on a canvas (the sprite sheet and board draw opaque colour). */
const drawnPixels = (canvas: Locator): Promise<number> =>
  canvas.evaluate((el) => {
    if (!(el instanceof HTMLCanvasElement)) return 0;
    const ctx = el.getContext('2d');
    if (!ctx || el.width === 0 || el.height === 0) return 0;
    const { data } = ctx.getImageData(0, 0, el.width, el.height);
    let count = 0;
    for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) > 0) count += 1;
    return count;
  });

test('Puzzle Game: start 1 Player, the canvas draws, P pauses, Esc resumes, Q and Back return to the hub', async ({
  context,
}) => {
  const { stage } = await stageAtSetup(context);
  await startGame(stage);

  await hubTile(stage, /puzzle game/i).focus();
  await stage.keyboard.press('Enter');
  const game = stage.getByTestId('puzzle-game');
  await expect(game).toHaveAttribute('data-phase', 'title');

  // Title card -> 1 Player -> setup.
  await stage.getByTestId('title-1p').click();
  await expect(game).toHaveAttribute('data-phase', 'setup');
  await expect(stage.getByText('Choose level and speed')).toBeVisible();

  // START twice: the first press moves onto the tile, the second one gets the player ready and begins.
  const start = stage.getByTestId('p1-start');
  await start.click();
  if ((await game.getAttribute('data-phase')) === 'setup') await start.click();
  await expect(game).toHaveAttribute('data-phase', 'match');

  // The canvas has drawn the board and the playfield sprites.
  const canvas = stage.getByTestId('puzzle-canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(() => drawnPixels(canvas), { timeout: 10_000 }).toBeGreaterThan(1000);
  const dataUrl = await canvas.evaluate((el) => (el instanceof HTMLCanvasElement ? el.toDataURL() : ''));
  expect(dataUrl.length).toBeGreaterThan(2000);

  // P pauses; the overlay offers Resume; Escape resumes.
  await stage.keyboard.press('p');
  const paused = stage.getByTestId('overlay-paused');
  await expect(paused).toBeVisible();
  await expect(paused.getByRole('status', { name: 'Paused' })).toBeVisible();
  await stage.keyboard.press('Escape');
  await expect(paused).toBeHidden();

  // Paused again, Q quits to the title card; its Back tile returns to the hub.
  await stage.keyboard.press('p');
  await expect(paused).toBeVisible();
  await stage.keyboard.press('q');
  await expect(game).toHaveAttribute('data-phase', 'title');
  await stage.getByTestId('title-back').click();
  await expect(hubTile(stage, /family feud/i)).toBeVisible();
  await expect(game).toBeHidden();
});
