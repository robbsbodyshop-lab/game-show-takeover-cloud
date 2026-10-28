import { expect, test, type Page } from '@playwright/test';
import { createEvent, openStage, passBoot, startFeudFaceOff, startGame } from './helpers';

const QUESTION = 'header h1';

/** Leave the running event through Settings > Back to my events (the autosave has already run). */
async function backToEvents(stage: Page): Promise<void> {
  await stage.getByRole('button', { name: 'Settings' }).first().click();
  const dialog = stage.getByRole('dialog', { name: 'Settings' });
  await dialog.getByRole('button', { name: 'Back to my events' }).click();
  await expect(stage.getByRole('heading', { name: 'Your events' })).toBeVisible();
}

test('reopening an event mid face-off offers Resume and restores the same question (FR-005, FR-006)', async ({
  context,
}) => {
  const stage = await openStage(context);
  const name = await createEvent(stage, 'Resume');
  await startGame(stage);
  await startFeudFaceOff(stage);

  const question = stage.locator(QUESTION);
  await expect(question).toBeVisible();
  const text = ((await question.textContent()) ?? '').trim();
  expect(text.length).toBeGreaterThan(5);

  await backToEvents(stage);
  await stage.getByRole('button', { name: `Open ${name}` }).click();

  // The event has progress, so it offers Resume instead of the setup screen.
  await expect(stage.getByRole('heading', { name })).toBeVisible();
  await expect(stage.getByText(/in Family Feud/)).toBeVisible();
  await stage.getByRole('button', { name: 'Resume', exact: true }).click();

  await expect(question).toHaveText(text, { timeout: 15_000 });
  await expect(stage.getByText('BUZZERS OPEN')).toBeVisible();
});

// Demo data persists to localStorage (`gst:demo:db`, src/data/repositories/memory), so a full page
// reload keeps the signed-in user, the events list and each event's saved state.
test('reloading the stage page during a face-off offers Resume with the same question (FR-005)', async ({
  context,
}) => {
  const stage = await openStage(context);
  const name = await createEvent(stage, 'Reload');
  await startGame(stage);
  await startFeudFaceOff(stage);
  const text = ((await stage.locator(QUESTION).textContent()) ?? '').trim();

  await stage.waitForTimeout(1500);
  await stage.reload();
  await passBoot(stage);

  await stage.getByRole('button', { name: `Open ${name}` }).click();
  await stage.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(stage.locator(QUESTION)).toHaveText(text, { timeout: 15_000 });
});
