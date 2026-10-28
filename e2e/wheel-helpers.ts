import { expect, type Page } from '@playwright/test';
import { hubTile } from './helpers';

/** "stage_phase" of the running Wheel game, or "none" when it is not on screen. */
export const wheelKey = (stage: Page): Promise<string> =>
  stage.evaluate(() => {
    const game = document.querySelector<HTMLElement>('[data-testid="wheel-game"]');
    return game ? `${game.dataset.stage ?? ''}_${game.dataset.phase ?? ''}` : 'none';
  });

/** Wait until the Wheel game shows the given "stage_phase" (a RegExp matches the whole key). */
export async function waitWheel(stage: Page, key: string | RegExp, timeout = 20_000): Promise<void> {
  await expect
    .poll(() => wheelKey(stage), { timeout, message: `waiting for Wheel ${String(key)}` })
    .toMatch(typeof key === 'string' ? new RegExp(`^${key}$`) : key);
}

/** Press a stage key without it landing in a focused input or button. */
export async function pressStageKey(stage: Page, key: string): Promise<void> {
  await stage.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await stage.keyboard.press(key);
}

/** From the hub, open Wheel of Fortune; the first toss-up starts revealing letters. */
export async function startWheel(stage: Page): Promise<void> {
  await hubTile(stage, /wheel of fortune/i).focus();
  await stage.keyboard.press('Enter');
  await waitWheel(stage, 'tossup_tossup-reveal');
}

/** Open the host drawer (F2) when it is closed. */
export async function openDrawer(stage: Page): Promise<void> {
  const close = stage.getByRole('button', { name: 'Close', exact: true });
  if (!(await close.isVisible())) await stage.keyboard.press('F2');
  await expect(stage.getByText('Host tools')).toBeVisible();
}

/** Close the host drawer when it is open. */
export async function closeDrawer(stage: Page): Promise<void> {
  if (await stage.getByText('Host tools').isVisible()) await stage.keyboard.press('F2');
  await expect(stage.getByText('Host tools')).toBeHidden();
}

/** Click a command in the host drawer, then close it. The command must be enabled. */
export async function drawerCommand(stage: Page, name: RegExp | string): Promise<void> {
  await openDrawer(stage);
  const button = stage.getByRole('button', { name }).first();
  await expect(button).toBeEnabled();
  await button.click();
  await closeDrawer(stage);
}

/**
 * Win the toss-up in front of the stage for Team 1: ring in with key 1 once letters are revealed,
 * then rule the answer correct. Leaves the game at the toss-up result.
 */
export async function winTossUpForTeam1(stage: Page): Promise<void> {
  await waitWheel(stage, 'tossup_tossup-reveal');
  await expect
    .poll(
      async () => {
        await pressStageKey(stage, '1');
        return wheelKey(stage);
      },
      { timeout: 20_000, intervals: [500] },
    )
    .toBe('tossup_tossup-answer');
  await stage.getByRole('button', { name: /^correct$/i }).click();
  await waitWheel(stage, /^[a-z]+_tossup-done$/);
}

/** Play the opening toss-ups for Team 1 until the first round is waiting for the spin. */
export async function openingTossUpsToRound1(stage: Page): Promise<void> {
  for (let guard = 0; guard < 8; guard += 1) {
    const key = await wheelKey(stage);
    if (key === 'round_choose') return;
    if (key.endsWith('_tossup-reveal')) await winTossUpForTeam1(stage);
    else if (key.endsWith('_tossup-done')) await pressStageKey(stage, 'Enter');
    await stage.waitForTimeout(600);
  }
  await waitWheel(stage, 'round_choose');
}

/**
 * Drive the Wheel with host shortcuts until the game shows `until` ("stage_phase"). Toss-ups go to
 * Team 1 (key 1, ruled correct), rounds and the Speed-Up end unsolved from the host drawer, award and
 * result cards continue with Enter. Returns the stages visited, in order.
 */
export async function playWheelUntil(stage: Page, until: RegExp, timeoutMs = 60_000): Promise<string[]> {
  const stages: string[] = [];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const key = await wheelKey(stage);
    const [name = '', phase = ''] = key.split('_');
    if (stages[stages.length - 1] !== name && name !== 'none') stages.push(name);
    if (until.test(key)) return stages;
    if (phase === 'tossup-reveal') await pressStageKey(stage, '1');
    else if (phase === 'tossup-answer') {
      await stage.getByRole('button', { name: /^correct$/i }).click();
    } else if (phase === 'round-award' || phase === 'tossup-done') await pressStageKey(stage, 'Enter');
    else if (['choose', 'call-consonant', 'speedup-spin', 'speedup-act', 'speedup-window'].includes(phase)) {
      await drawerCommand(stage, /^end unsolved$/i);
    }
    await stage.waitForTimeout(600);
  }
  throw new Error(
    `Wheel never reached ${String(until)}; last at ${await wheelKey(stage)} after ${stages.join(', ')}`,
  );
}

/** Leave the running Wheel for the hub through the pause menu (two taps on Quit to hub). */
export async function quitWheelToHub(stage: Page): Promise<void> {
  await stage
    .getByRole('button', { name: /^pause$/i })
    .first()
    .click();
  await stage.getByRole('button', { name: /quit to hub/i }).click();
  await stage.getByRole('button', { name: /tap again/i }).click();
  await expect(hubTile(stage, /family feud/i)).toBeVisible();
}
