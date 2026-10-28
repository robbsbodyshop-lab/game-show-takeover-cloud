import { expect, test } from '@playwright/test';
import { createEvent, hubTile, openStage, readRoomCode, startGame } from './helpers';

test('sign in, create an event, set up, start, and use the host keys', async ({ context }) => {
  const stage = await openStage(context);

  // Sign-in gate: after an explicit sign-out the host signs back in as the demo host.
  await stage.getByRole('button', { name: 'Sign out' }).click();
  await expect(stage.getByRole('heading', { name: 'Host sign in' })).toBeVisible();
  await stage.getByRole('button', { name: /continue as demo host/i }).click();
  await expect(stage.getByLabel(/new event name/i)).toBeVisible();

  const name = await createEvent(stage, 'Flow');

  // Setup shows the room code and the QR canvas.
  const code = await readRoomCode(stage);
  expect(code).toMatch(/^[BCDFGHJKLMNPQRSTVWXYZ]{4}$/);
  await expect(stage.locator('canvas')).toBeVisible();
  await expect(stage.getByText(/phones can join/i)).toBeVisible();

  // Start -> hub with the game tiles.
  await startGame(stage);
  await expect(stage.getByRole('heading', { name })).toBeVisible();
  for (const tile of [/family feud/i, /wheel/i, /speed/i, /plinko/i]) {
    await expect(hubTile(stage, tile).first()).toBeVisible();
  }
  await expect(stage.getByTestId('scoreboard')).toBeVisible();

  // Settings dialog opens and closes.
  await stage.getByRole('button', { name: 'Settings' }).first().click();
  const dialog = stage.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();

  // F9 toggles show mode: the sidebar hides, and comes back.
  await stage.keyboard.press('F9');
  await expect(stage.getByTestId('scoreboard')).toBeHidden();
  await stage.keyboard.press('F9');
  await expect(stage.getByTestId('scoreboard')).toBeVisible();

  // F8 pauses with the Stand by card; Escape resumes.
  await stage.keyboard.press('F8');
  const pause = stage.getByTestId('pause-card');
  await expect(pause).toBeVisible();
  await expect(pause.getByText('Stand by')).toBeVisible();
  await stage.keyboard.press('Escape');
  await expect(pause).toBeHidden();
});
