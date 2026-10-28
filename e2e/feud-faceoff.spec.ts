import { expect, test } from '@playwright/test';
import { joinPhone, stageAtSetup, startFeudFaceOff, startGame } from './helpers';

test('Family Feud face-off: buzz, wrong answer, strike, the other team, undo', async ({ context }) => {
  const { stage, code } = await stageAtSetup(context);
  const phone1 = await joinPhone(context, code, 1);
  const phone2 = await joinPhone(context, code, 2);
  await expect(stage.getByText('Connected phones: 2')).toBeVisible({ timeout: 15_000 });

  await startGame(stage);
  await startFeudFaceOff(stage);

  // Both phones can buzz while the buzzers are open.
  const buzz1 = phone1.getByRole('button', { name: 'BUZZ', exact: true });
  const buzz2 = phone2.getByRole('button', { name: 'BUZZ', exact: true });
  await expect(buzz1).toBeEnabled({ timeout: 10_000 });
  await expect(buzz2).toBeEnabled();

  await buzz1.click();

  // The stage shows who buzzed first, with the answer box for the host.
  await expect(stage.getByText('Team 1 buzzed first')).toBeVisible();
  await expect(stage.getByLabel('Type the answer')).toBeVisible();
  await expect(stage.getByRole('button', { name: 'Judge' })).toBeVisible();
  await expect(stage.getByRole('button', { name: /miss \(x\)/i })).toBeVisible();

  // Phone 1 confirms BUZZED! and then goes grey; phone 2's button is greyed straight away.
  await expect(phone1.getByRole('button', { name: 'BUZZED!' })).toBeVisible();
  const off1 = phone1.getByRole('button', { name: 'Buzzers are off' });
  const off2 = phone2.getByRole('button', { name: 'Buzzers are off' });
  await expect(off1).toBeVisible({ timeout: 10_000 });
  await expect(off1).toBeDisabled();
  await expect(off2).toBeVisible();
  await expect(off2).toBeDisabled();

  // A wrong answer is judged: Team 1 gets an X and Team 2 is asked.
  await stage.getByLabel('Type the answer').fill('zzzz not on the board');
  await stage.getByRole('button', { name: 'Judge' }).click();
  await expect(stage.getByRole('alert', { name: /1 strike/ })).toBeVisible();
  await expect(stage.getByText(/Team 2:.*your answer/)).toBeVisible({ timeout: 10_000 });

  // Undo (U) returns to the previous state: Team 1 is answering again.
  await stage.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await stage.keyboard.press('u');
  await expect(stage.getByText(/Team 1:.*your answer/)).toBeVisible({ timeout: 10_000 });
  await expect(stage.getByRole('alert', { name: /strike/ })).toBeHidden();
});
