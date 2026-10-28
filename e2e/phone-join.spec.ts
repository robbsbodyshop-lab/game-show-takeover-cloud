import { expect, test } from '@playwright/test';
import { openPhone, stageAtSetup, startGame } from './helpers';

test('a phone joins by code, shows on the roster, rejoins after a reload and can change room', async ({
  context,
}) => {
  const { stage, code } = await stageAtSetup(context);

  // Join by the URL code and pick Team 2.
  const phone = await openPhone(context, code);
  await phone.getByText('Team 2', { exact: true }).click();
  await expect(phone.getByText(`Room ${code}`)).toBeVisible();
  await expect(phone.getByText('Live')).toBeVisible({ timeout: 15_000 });

  // The stage roster lists the phone under Team 2.
  const roster = stage.getByRole('region', { name: 'Connected phones' });
  await expect(roster.getByText('Connected phones: 1')).toBeVisible({ timeout: 15_000 });
  const team2 = roster.getByRole('listitem').filter({ hasText: 'Team 2' });
  await expect(team2).not.toContainText('waiting');
  await expect(roster.getByRole('listitem').filter({ hasText: 'Team 1' })).toContainText('waiting');

  // In the hub the buzzers are off.
  await startGame(stage);
  await expect(phone.getByRole('button', { name: 'Buzzers are off' })).toBeVisible({ timeout: 15_000 });
  await expect(phone.getByRole('button', { name: 'Buzzers are off' })).toBeDisabled();

  // Reloading the phone rejoins silently, to the same team.
  await phone.reload();
  await expect(phone.getByText('Team 2').first()).toBeVisible({ timeout: 15_000 });
  await expect(phone.getByText(`Room ${code}`)).toBeVisible();
  await expect(phone.getByRole('button', { name: 'Buzzers are off' })).toBeVisible({ timeout: 15_000 });
  await expect(phone.getByText('Pick your team')).toBeHidden();

  // Change room returns to the room-code screen.
  await phone.getByRole('button', { name: 'Change room' }).click();
  await expect(phone.getByRole('heading', { name: 'Join the game' })).toBeVisible();
});
