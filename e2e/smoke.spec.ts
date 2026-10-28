import { expect, test } from '@playwright/test';

test('the stage loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Game Show Takeover' })).toBeVisible();
});
