import { expect, test, type Page } from '@playwright/test';
import { joinPhone, stageAtSetup, startGame } from './helpers';
import {
  drawerCommand,
  openingTossUpsToRound1,
  pressStageKey,
  startWheel,
  waitWheel,
  wheelKey,
} from './wheel-helpers';

const litTiles = (stage: Page): Promise<number> =>
  stage.locator('[data-testid="tile"][data-lit="true"]:not([data-punct])').count();

/** The id of the team whose podium glows (the team at the wheel), as a string. */
const activeTeam = async (stage: Page): Promise<string> =>
  (await stage.locator('[data-testid^="podium-"][data-active="true"]').getAttribute('data-testid')) ?? '';

const prompt = (stage: Page) => stage.getByTestId('prompt');

test('Round 1: spin, call a letter, a wrong solve passes the turn, End unsolved shows the award card', async ({
  context,
}) => {
  const { stage } = await stageAtSetup(context);
  await startGame(stage);
  await startWheel(stage);
  await openingTossUpsToRound1(stage);
  await expect(stage.getByText('ROUND 1', { exact: true })).toBeVisible();
  await expect(prompt(stage)).toContainText('SPIN, BUY A VOWEL OR SOLVE');
  const board = stage.getByTestId('puzzle-board');
  await expect(board).toBeVisible();
  expect(await litTiles(stage)).toBe(0);

  // Space spins; keep spinning (the wheel is random) until a wedge lets the team call a consonant.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await pressStageKey(stage, ' ');
    await expect(prompt(stage)).toContainText('IS SPINNING', { timeout: 5_000 });
    await expect(prompt(stage)).not.toContainText('IS SPINNING', { timeout: 20_000 });
    // Settled: either a consonant is wanted, a choice dialog is up, or the turn moved on.
    await expect
      .poll(async () => wheelKey(stage), { timeout: 10_000 })
      .toMatch(/^round_(call-consonant|choose|mystery-choice|express-choice|round-award)$/);
    const key = await wheelKey(stage);
    if (key === 'round_mystery-choice') await pressStageKey(stage, 'k');
    else if (key === 'round_express-choice') await pressStageKey(stage, 'p');
    if ((await wheelKey(stage)) === 'round_call-consonant') break;
    // A Bankrupt or Lose a Turn plate has appeared and the turn passed; spin again for the next team.
    await expect(prompt(stage)).toContainText('SPIN, BUY A VOWEL OR SOLVE', { timeout: 10_000 });
  }
  await waitWheel(stage, 'round_call-consonant', 5_000);
  await expect(prompt(stage)).toContainText('CALL A CONSONANT');

  // Call a consonant from the on-screen keyboard.
  const caller = await activeTeam(stage);
  await stage.getByRole('button', { name: 'Call R', exact: true }).click();
  const lit = await litTiles(stage);
  // A hit lights tiles and the same team keeps the wheel; a miss passes the turn (buzzer plate).
  await expect
    .poll(
      async () => {
        const hit = (await litTiles(stage)) > lit;
        const passed = (await activeTeam(stage)) !== caller;
        return hit || passed;
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  // Enter opens the solve box; a wrong answer is judged and the turn passes.
  await expect.poll(() => wheelKey(stage), { timeout: 15_000 }).toBe('round_choose');
  const solver = await activeTeam(stage);
  await pressStageKey(stage, 'Enter');
  await waitWheel(stage, 'round_solving');
  const dialog = stage.getByRole('dialog', { name: /: SOLVE$/ });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Type the answer').fill('ZZZZ NOT THE ANSWER');
  await dialog.getByRole('button', { name: 'Check answer' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect.poll(() => activeTeam(stage), { timeout: 10_000 }).not.toBe(solver);
  await waitWheel(stage, 'round_choose');

  // F2 -> End unsolved: the round award card says nobody solved it.
  await drawerCommand(stage, /^end unsolved$/i);
  const award = stage.getByTestId('round-award');
  await expect(award).toBeVisible({ timeout: 10_000 });
  await expect(award.getByText('NO ONE SOLVED IT')).toBeVisible();
  await expect(stage.getByTestId('podium-1').getByLabel('Round cash')).toBeVisible();

  // Continue moves on to Round 2.
  await pressStageKey(stage, 'Enter');
  await expect(award).toBeHidden({ timeout: 10_000 });
  await expect(stage.getByText('ROUND 2', { exact: true })).toBeVisible({ timeout: 10_000 });
});

test('the phone of the team at the wheel gets SPIN, BUY and SOLVE; the other phone waits', async ({
  context,
}) => {
  const { stage, code } = await stageAtSetup(context);
  const phone1 = await joinPhone(context, code, 1);
  const phone2 = await joinPhone(context, code, 2);
  await startGame(stage);
  await startWheel(stage);

  // During the toss-up phones only wait for a letter.
  await expect(phone1.getByText('WAIT FOR A LETTER')).toBeVisible({ timeout: 10_000 });

  await openingTossUpsToRound1(stage);
  const team = await activeTeam(stage);
  expect(team).toBe('podium-1');

  const podium = phone1.getByRole('region', { name: 'Podium' });
  await expect(podium.getByText('Your turn')).toBeVisible({ timeout: 10_000 });
  await expect(podium.getByRole('button', { name: 'Spin' })).toBeEnabled();
  await expect(podium.getByRole('button', { name: 'Solve' })).toBeEnabled();
  // A vowel costs $250 of round cash, which the team has not won yet, so BUY is shown but off.
  const buy = podium.getByRole('button', { name: 'Buy' });
  await expect(buy).toBeVisible();
  await expect(buy).toBeDisabled();
  await expect(phone2.getByText('WAITING FOR TEAM 1')).toBeVisible();
  await expect(phone2.getByRole('region', { name: 'Podium' }).getByRole('button')).toHaveCount(0);

  // SPIN on the phone turns the wheel on the stage.
  await podium.getByRole('button', { name: 'Spin' }).click();
  await expect(prompt(stage)).toContainText('IS SPINNING', { timeout: 10_000 });
});
