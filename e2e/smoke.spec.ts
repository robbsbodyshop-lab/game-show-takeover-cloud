import { expect, test } from '@playwright/test';
import { passBoot } from './helpers';

test('the stage loads', async ({ page }) => {
  await page.goto('/?demo=1');
  // Demo mode signs the demo host in after the boot screen, so the events list is the first screen.
  await passBoot(page);
  await expect(page.getByRole('heading', { name: 'Your events' })).toBeVisible();
});
