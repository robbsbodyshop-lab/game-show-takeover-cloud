import { expect, test, type Page } from '@playwright/test';
import {
  bootStage,
  createEvent,
  openHost,
  openStage,
  stageAtSetup,
  startFeudFaceOff,
  startGame,
} from './helpers';

/** The "Team N buzzed first" status line (the pre-buzz host buttons carry the same words). */
const buzzedLine = (stage: Page, team: number) =>
  stage.getByRole('paragraph').filter({ hasText: `Team ${String(team)} buzzed first` });

/** Frames on the same-browser host mirror, as the host view sees them (hostWire.ts). */
interface Wire {
  t: string;
  cmdId?: string;
  applied?: boolean;
  reason?: string;
  snapshot?: { kind: string; gameRev: number };
}

/** Open a raw listener on the host mirror in the host page; frames land in `window.__wire`. */
async function tapHostWire(host: Page): Promise<void> {
  await host.evaluate(() => {
    const w = window as unknown as { __wire: Wire[]; __tap: BroadcastChannel };
    w.__wire = [];
    w.__tap = new BroadcastChannel('gst-host');
    w.__tap.onmessage = (event: MessageEvent) => {
      w.__wire.push(event.data as Wire);
    };
    w.__tap.postMessage({ t: 'hello', hostId: 'e2e-tap' });
  });
}

/** The newest game revision the stage has published for a snapshot kind. */
const latestRev = (host: Page, kind: string): Promise<number> =>
  host.evaluate((k) => {
    const wire = (window as unknown as { __wire: Wire[] }).__wire;
    const revs = wire
      .filter((m) => m.t === 'snapshot' && m.snapshot?.kind === k)
      .map((m) => m.snapshot?.gameRev ?? -1);
    return revs.length === 0 ? -1 : (revs[revs.length - 1] ?? -1);
  }, kind);

/** Send a game command with an explicit revision stamp and wait for the stage's answer. */
async function sendStamped(
  host: Page,
  cmdId: string,
  command: { target: string; name: string; teamId: number; gameRev: number },
): Promise<{ applied: boolean; reason: string }> {
  await host.evaluate(
    ({ id, c }) => {
      const w = window as unknown as { __tap: BroadcastChannel };
      w.__tap.postMessage({ t: 'command', command: { cmdId: id, ...c } });
    },
    { id: cmdId, c: command },
  );
  const handle = await host.waitForFunction(
    (id) => {
      const wire = (window as unknown as { __wire: Wire[] }).__wire;
      const hit = wire.find((m) => m.t === 'result' && m.cmdId === id);
      return hit ? { applied: hit.applied === true, reason: hit.reason ?? '' } : false;
    },
    cmdId,
    { timeout: 10_000 },
  );
  return (await handle.jsonValue()) as { applied: boolean; reason: string };
}

test('a stale game command from the host is dropped; the same command with the current stamp applies', async ({
  context,
}) => {
  const { stage, code } = await stageAtSetup(context);
  await startGame(stage);
  await startFeudFaceOff(stage);

  const host = await openHost(context, code);
  await expect(host.getByText('Connected', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(host.getByLabel('Stage snapshot').getByText('feud', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await tapHostWire(host);
  await expect.poll(() => latestRev(host, 'feud'), { timeout: 10_000 }).toBeGreaterThan(0);
  const rev = await latestRev(host, 'feud');

  // The command was written one revision ago (the game has moved on since): refused as stale.
  const stale = await sendStamped(host, 'e2e-stale-1', {
    target: 'feud',
    name: 'buzz',
    teamId: 2,
    gameRev: rev - 1,
  });
  expect(stale).toEqual({ applied: false, reason: 'stale' });
  await stage.bringToFront();
  await stage.waitForTimeout(1_000);
  await expect(stage.getByText('BUZZERS OPEN')).toBeVisible();
  await expect(buzzedLine(stage, 2)).toBeHidden();

  // The same command, stamped with the revision the stage is on, goes through.
  const fresh = await sendStamped(host, 'e2e-fresh-1', {
    target: 'feud',
    name: 'buzz',
    teamId: 2,
    gameRev: rev,
  });
  expect(fresh.applied).toBe(true);
  await expect(buzzedLine(stage, 2)).toBeVisible({ timeout: 10_000 });
});

// The host view loads without the game modules, so no game console is registered there: its "Console"
// area says "No host console for feud yet" and the pre-buzz "Team 2 buzzed first" or Undo buttons the
// brief asks for do not exist on /host. Un-fixme this when src/app/hostMain.tsx registers the consoles.
test('the host view shows the Feud console so its buttons can send (and be refused) stale commands', async ({
  context,
}) => {
  const { stage, code } = await stageAtSetup(context);
  await startGame(stage);
  await startFeudFaceOff(stage);
  const host = await openHost(context, code);
  await expect(host.getByText('Connected', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(host.getByText(/No host console for/)).toBeHidden({ timeout: 10_000 });
  await expect(host.getByRole('button', { name: /undo/i })).toBeVisible();
});

test('a second stage tab for the same event is read-only', async ({ context }) => {
  const first = await openStage(context);
  const name = await createEvent(first, 'Lease');
  await startGame(first);

  const second = await context.newPage();
  await bootStage(second);
  await second.getByRole('button', { name: `Open ${name}` }).click();
  await second.getByRole('button', { name: 'Resume', exact: true }).click();

  await expect(
    second.getByText('Another stage is running this event. This screen is read-only.'),
  ).toBeVisible({
    timeout: 20_000,
  });
  // The first stage keeps running the show: no banner there.
  await expect(first.getByText(/Another stage is running this event/)).toBeHidden();
  await expect(first.getByRole('option', { name: /family feud/i })).toBeVisible();
});
