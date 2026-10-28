import { expect, test } from '@playwright/test';
import { hubTile, stageAtSetup, startGame } from './helpers';
import {
  closeDrawer,
  openDrawer,
  playWheelUntil,
  pressStageKey,
  quitWheelToHub,
  startWheel,
  waitWheel,
} from './wheel-helpers';

test('Wheel to the Bonus Round: Triple Toss-Up, Speed-Up from settings, envelope, winner, hub shows the chip', async ({
  context,
}) => {
  test.setTimeout(90_000);
  const { stage } = await stageAtSetup(context);
  await startGame(stage);

  // Save "Round 4 opens as the Speed-Up" for the next game, then restart the Wheel with it.
  await startWheel(stage);
  await openDrawer(stage);
  await stage.locator('label', { hasText: 'Speed-Up' }).locator('select').selectOption('round4');
  await stage.getByRole('button', { name: /save for the next game/i }).click();
  await closeDrawer(stage);
  await quitWheelToHub(stage);
  await startWheel(stage);

  // Team 1 wins every toss-up; rounds 1 to 3 end unsolved; then the Triple Toss-Up and the Speed-Up.
  const stages = await playWheelUntil(stage, /^bonus_bonus-category$/);
  expect(stages).toContain('tossup');
  expect(stages).toContain('round');
  expect(stages).toContain('triple');
  expect(stages).toContain('speedup');
  await expect(stage.getByText('PICK A CATEGORY')).toBeVisible();
  await expect(stage.getByText('TEAM 1 PLAYS FOR THE ENVELOPE')).toBeVisible();

  // Pick the first category, spin the Bonus Wheel.
  await expect(stage.getByRole('button', { name: /^1\. / })).toBeVisible();
  await pressStageKey(stage, '1');
  await waitWheel(stage, 'bonus_bonus-spin');
  await expect(stage.getByText('SPIN THE BONUS WHEEL')).toBeVisible();
  await expect(stage.getByTestId('bonus-wheel')).toBeVisible();
  await pressStageKey(stage, ' ');
  await waitWheel(stage, 'bonus_bonus-letters', 30_000);

  // RSTLNE is given; call three more consonants and a vowel.
  await expect(stage.getByText(/CALL 3 CONSONANTS AND 1 VOWEL/)).toBeVisible();
  for (const letter of ['B', 'C', 'D', 'A']) await pressStageKey(stage, letter);
  await waitWheel(stage, 'bonus_bonus-ready');
  await expect(stage.getByText('READY? YOU GET 10 SECONDS')).toBeVisible();

  // The clock starts on Enter and is allowed to run out.
  await pressStageKey(stage, 'Enter');
  await waitWheel(stage, 'bonus_bonus-solving');
  await expect(stage.getByText('SOLVE IT!')).toBeVisible();
  await expect(stage.getByRole('timer')).toBeVisible();
  await waitWheel(stage, /^bonus_bonus-(timeup|won)$/, 20_000);

  // Open the envelope: the prize shows only now.
  await pressStageKey(stage, 'Enter');
  await waitWheel(stage, 'bonus_bonus-opened', 20_000);
  const prize = stage.getByTestId('envelope-prize');
  await expect(prize).toContainText('$');

  // Continue through the envelope to the winner card, then to the hub.
  await pressStageKey(stage, 'Enter');
  await waitWheel(stage, /^game-over_/, 20_000);
  const winner = stage.getByTestId('winner-card');
  await expect(winner).toBeVisible();
  await expect(winner.getByText('Team 1 WINS!')).toBeVisible();
  await expect(winner.getByText(/and a Plinko chip/)).toBeVisible();
  // The card takes the click only once its entrance has finished; click until the hub is back.
  await expect(async () => {
    await winner.getByRole('button', { name: /continue to the hub/i }).click({ timeout: 2_000 });
    await expect(hubTile(stage, /family feud/i)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });

  // The hub marks Wheel as played and Team 1 holds the Plinko chip.
  await expect(hubTile(stage, /wheel of fortune/i)).toContainText('(played)');
  await expect(hubTile(stage, /wheel of fortune/i)).toBeDisabled();
  const team1 = stage.getByTestId('scoreboard').getByRole('listitem', { name: 'Team 1' });
  await expect(team1).toContainText('Chips 1');
  const team2 = stage.getByTestId('scoreboard').getByRole('listitem', { name: 'Team 2' });
  await expect(team2).toContainText('Chips 0');
});
