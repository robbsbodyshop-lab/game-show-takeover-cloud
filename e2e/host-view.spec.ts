import { expect, test } from '@playwright/test';
import { openHost, stageAtSetup, startFeudFaceOff, startGame } from './helpers';

test('the host view mirrors the hub, pauses and resumes the stage, and buzzes with key 1', async ({
  context,
}) => {
  const { stage, code } = await stageAtSetup(context);
  await startGame(stage);

  const host = await openHost(context, code);
  await expect(host.getByRole('heading', { name: 'Host view' })).toBeVisible({ timeout: 15_000 });
  await expect(host.getByText(`Room ${code}`).first()).toBeVisible();
  await expect(host.getByText('Connected', { exact: true })).toBeVisible({ timeout: 15_000 });

  // The hub snapshot lists the teams with their scores and chips.
  const snapshot = host.getByLabel('Stage snapshot');
  await expect(snapshot.getByRole('columnheader', { name: 'Score' })).toBeVisible({ timeout: 15_000 });
  await expect(snapshot.getByRole('row', { name: /1\. Team 1/ })).toBeVisible();
  await expect(snapshot.getByRole('row', { name: /2\. Team 2/ })).toBeVisible();

  // Pause from the host view pauses the stage; Resume resumes it.
  await host.getByRole('button', { name: 'Stand by (pause)' }).click();
  await expect(stage.getByTestId('pause-card')).toBeVisible({ timeout: 10_000 });
  await expect(snapshot.getByText('Paused', { exact: true })).toBeVisible();
  await host.getByRole('button', { name: 'Resume game' }).click();
  await expect(stage.getByTestId('pause-card')).toBeHidden({ timeout: 10_000 });

  // Key 1 in the host view buzzes Team 1 during an open face-off.
  await stage.bringToFront();
  await startFeudFaceOff(stage);
  await host.bringToFront();
  await host.keyboard.press('1');
  await expect(stage.getByText('Team 1 buzzed first')).toBeVisible({ timeout: 10_000 });
});
