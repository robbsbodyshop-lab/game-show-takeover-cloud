import { expect, test, type Page } from '@playwright/test';
import { hubTile, stageAtSetup, startGame } from './helpers';

const scoreboardRow = (stage: Page, team: string) =>
  stage.getByTestId('scoreboard').getByRole('listitem', { name: team });

/** Open a hub tile from the keyboard, the way the host does. */
async function openTile(stage: Page, name: RegExp): Promise<void> {
  await hubTile(stage, name).focus();
  await stage.keyboard.press('Enter');
}

test('Speed Round, Plinko and Announce the Winner: award points, drop a chip, crown Team 1', async ({
  context,
}) => {
  test.setTimeout(90_000);
  // A fake clock that still runs in real time lets the 60 s Speed Round be fast-forwarded.
  await context.clock.install();
  const { stage } = await stageAtSetup(context);
  await startGame(stage);

  // --- Speed Round: start, pause, resume, time up ------------------------------------------------
  await openTile(stage, /speed round/i);
  const speed = stage.getByTestId('speed-round');
  await expect(speed).toHaveAttribute('data-status', 'idle');
  const clock = stage.getByTestId('speed-clock');
  await expect(clock).toHaveText('60');
  const controls = stage.getByTestId('host-zone');
  await stage.getByLabel('Challenge text').fill('Build a tower of cups');
  await expect(stage.getByTestId('speed-challenge')).toHaveText('Build a tower of cups');

  await controls.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(speed).toHaveAttribute('data-status', 'running');

  await controls.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(speed).toHaveAttribute('data-status', 'paused');
  await expect(stage.getByRole('status').filter({ hasText: 'Paused' })).toBeVisible();
  const frozen = await clock.textContent();
  await stage.waitForTimeout(1_500);
  await expect(clock).toHaveText(frozen ?? '');

  await controls.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(speed).toHaveAttribute('data-status', 'running');

  // The whole minute passes: Time! and the award sheet opens by itself.
  await stage.clock.fastForward(61_000);
  await expect(speed).toHaveAttribute('data-status', 'timeUp', { timeout: 10_000 });
  await expect(clock).toHaveText('00');
  await expect(stage.getByRole('status').filter({ hasText: 'Time!' })).toBeVisible();

  // Award 10 points to Team 1 and return to the hub.
  const awards = stage.getByLabel('Speed Round awards');
  await awards.getByRole('button', { name: 'Team 1 plus 10 points' }).click();
  await expect(stage.getByTestId('award-points-1')).toHaveText('+10');
  await awards.getByRole('button', { name: 'Award and return to hub' }).click();
  await expect(hubTile(stage, /family feud/i)).toBeVisible();
  await expect(scoreboardRow(stage, 'Team 1')).toContainText('10');
  await expect(scoreboardRow(stage, 'Team 1')).toContainText('Chips 0');

  // --- Plinko: a chip from the sidebar, Team 1, column 5, Drop ------------------------------------
  await stage.getByRole('button', { name: 'Team 1 chips plus 1' }).click();
  await expect(scoreboardRow(stage, 'Team 1')).toContainText('Chips 1');

  await openTile(stage, /plinko/i);
  const plinko = stage.getByTestId('plinko-screen');
  await expect(plinko).toBeVisible();
  await expect(stage.getByTestId('chips-1')).toHaveText('1 chip');
  const team = stage.getByRole('group', { name: 'Team' });
  await team.getByRole('button', { name: /^Team 1 \(1\)$/ }).click();
  const column5 = stage.getByRole('button', { name: /^Column 5, worth \d+$/ });
  const worth = Number(/worth (\d+)/.exec((await column5.getAttribute('aria-label')) ?? '')?.[1]);
  await column5.click();
  await expect(column5).toHaveAttribute('aria-pressed', 'true');

  const slotValues = new Set<number>();
  for (const label of await stage
    .getByRole('group', { name: 'Column' })
    .getByRole('button')
    .evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label') ?? ''))) {
    slotValues.add(Number(/worth (\d+)/.exec(label)?.[1]));
  }
  expect(slotValues.has(worth)).toBe(true);

  await stage.getByRole('button', { name: 'Drop', exact: true }).click();
  // The chip falls peg by peg; the new total shows only once it lands.
  await expect(stage.getByTestId('plinko-log')).toContainText(/Team 1: slot \d+, \+\d+/, { timeout: 15_000 });
  await expect(stage.getByTestId('chips-1')).toHaveText('0 chips');
  const gained = Number(/\+(\d+)/.exec((await stage.getByTestId('plinko-log').textContent()) ?? '')?.[1]);
  expect(slotValues.has(gained)).toBe(true);
  await expect(stage.getByTestId('score-1')).toHaveText(String(10 + gained));

  // --- Announce the Winner ---------------------------------------------------------------------
  await stage.getByRole('button', { name: 'Back to hub' }).click();
  await expect(hubTile(stage, /family feud/i)).toBeVisible();
  await openTile(stage, /announce the winner/i);
  const winner = stage.getByTestId('winner-screen');
  await expect(winner).toBeVisible();
  await expect(stage.getByText('AND THE WINNER IS')).toBeVisible();
  await expect(stage.getByTestId('champion-name')).toHaveText('Team 1');
  await expect(stage.getByTestId('champion-name')).toHaveCount(1);
  await expect(stage.getByTestId('rank-1')).toHaveText('1');
  await expect(stage.getByTestId('rank-2')).toHaveText('2');
});
