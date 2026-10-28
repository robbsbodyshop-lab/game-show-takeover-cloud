import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';

/** Room codes are four consonants (src/data/roomCode.ts). */
export const ROOM_CODE = /^[BCDFGHJKLMNPQRSTVWXYZ]{4}$/;

let counter = 0;
/** A unique event name so specs sharing a browser profile never confuse their events. */
export const uniqueName = (label: string): string => {
  counter += 1;
  return `${label} ${String(Date.now() % 100000)}-${String(counter)}`;
};

/** Open the stage in demo mode and get past the boot screen to the events list. */
export async function openStage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await bootStage(page);
  return page;
}

/** Navigate an existing page to the demo stage and skip the boot screen if it is showing. */
export async function bootStage(page: Page): Promise<void> {
  await page.goto('/?demo=1');
  await passBoot(page);
}

/** Press Enter through the boot screen when it shows; wait for the signed-in events screen. */
export async function passBoot(page: Page): Promise<void> {
  const newEvent = page.getByLabel(/new event name/i);
  const resume = page.getByRole('button', { name: 'Resume', exact: true });
  const boot = page.getByRole('status', { name: 'Starting' });
  // Whichever comes first: the boot screen needs a keypress, the others mean it is already done.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((await newEvent.isVisible()) || (await resume.isVisible())) return;
    if (await boot.isVisible().catch(() => false)) await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
  }
  await expect(newEvent).toBeVisible({ timeout: 15_000 });
}

/** Create an event from the events list; lands on the setup screen. Returns the event name. */
export async function createEvent(page: Page, label = 'E2E'): Promise<string> {
  const name = uniqueName(label);
  await page.getByLabel(/new event name/i).fill(name);
  await page.getByRole('button', { name: /create event/i }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  return name;
}

/** Read the 4-consonant room code from the setup screen. */
export async function readRoomCode(page: Page): Promise<string> {
  const code = page.locator('[aria-label^="Room code "]');
  await expect(code).toBeVisible({ timeout: 15_000 });
  const text = ((await code.textContent()) ?? '').trim();
  expect(text).toMatch(ROOM_CODE);
  return text;
}

/** Stage up to the setup screen with a room code. */
export async function stageAtSetup(
  context: BrowserContext,
): Promise<{ stage: Page; code: string; name: string }> {
  const stage = await openStage(context);
  const name = await createEvent(stage);
  const code = await readRoomCode(stage);
  return { stage, code, name };
}

export async function startGame(stage: Page): Promise<void> {
  await stage.getByRole('button', { name: /start game/i }).click();
  await expect(hubTile(stage, /family feud/i)).toBeVisible();
}

export const hubTile = (stage: Page, name: RegExp): Locator => stage.getByRole('option', { name });

/** Open a phone at /play with the room code in the URL. */
export async function openPhone(context: BrowserContext, code: string): Promise<Page> {
  const phone = await context.newPage();
  await phone.goto(`/play?demo=1&room=${code}`);
  return phone;
}

/**
 * Phone joins and picks a team. Tabs of one browser context share localStorage, so a second phone
 * finds the first phone's saved team and rejoins it silently; it then switches with "Change team".
 */
export async function joinPhone(context: BrowserContext, code: string, team: number): Promise<Page> {
  const phone = await openPhone(context, code);
  const tile = phone.getByText(`Team ${String(team)}`, { exact: true });
  const changeTeam = phone.getByRole('button', { name: 'Change team' });
  await expect(tile.or(changeTeam)).toBeVisible({ timeout: 15_000 });
  if (await changeTeam.isVisible()) {
    await changeTeam.click();
    await expect(tile).toBeVisible();
  }
  await tile.click();
  await expect(phone.getByText(`Room ${code}`)).toBeVisible();
  await expect(phone.getByText('Live')).toBeVisible({ timeout: 15_000 });
  return phone;
}

/** Open the host view for a room. */
export async function openHost(context: BrowserContext, code: string): Promise<Page> {
  const host = await context.newPage();
  await host.goto(`/host?demo=1&room=${code}`);
  return host;
}

/** From the hub, start Family Feud and reach the open face-off (buzzers open). */
export async function startFeudFaceOff(stage: Page): Promise<void> {
  await hubTile(stage, /family feud/i).focus();
  await stage.keyboard.press('Enter');
  await expect(stage.getByRole('heading', { name: /family feud/i })).toBeVisible();
  await stage.keyboard.press('Enter'); // round 1
  await stage.keyboard.press('Enter'); // open the buzzers
  await expect(stage.getByText('BUZZERS OPEN')).toBeVisible();
}
