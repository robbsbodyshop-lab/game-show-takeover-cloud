import { gzipSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';

/** NFR-004: first-load JavaScript budgets, gzipped. */
const PHONE_BUDGET_KB = 150;
const STAGE_BUDGET_KB = 600;

interface Loaded {
  total: number;
  files: { url: string; kb: number }[];
}

/** Collect every JavaScript response of one navigation and gzip the bodies. */
async function gzippedScripts(page: Page, url: string, ready: () => Promise<void>): Promise<Loaded> {
  const pending: Promise<{ url: string; bytes: number } | null>[] = [];
  page.on('response', (response) => {
    const type = response.headers()['content-type'] ?? '';
    const isScript = /javascript|ecmascript/.test(type) || /\.m?js(\?|$)/.test(response.url());
    if (!isScript || !response.ok()) return;
    pending.push(
      response
        .body()
        .then((body) => ({ url: new URL(response.url()).pathname, bytes: gzipSync(body).length }))
        .catch(() => null),
    );
  });
  await page.goto(url);
  await ready();
  await page.waitForLoadState('networkidle');
  const done = (await Promise.all(pending)).filter(
    (entry): entry is { url: string; bytes: number } => entry !== null,
  );
  const seen = new Set<string>();
  const files = done
    .filter((entry) => (seen.has(entry.url) ? false : (seen.add(entry.url), true)))
    .map((entry) => ({ url: entry.url, kb: entry.bytes / 1024 }));
  return { total: files.reduce((sum, file) => sum + file.kb, 0), files };
}

const describe = (loaded: Loaded): string =>
  loaded.files.map((file) => `${file.kb.toFixed(1)} KB ${file.url}`).join('\n');

// `/play` is its own Vite entry (play.html -> src/app/playMain.tsx): React, the phone UI, the room
// transport and the room RPCs, with no content, engines, stage or audio. Demo mode loads no Supabase
// client; supabase mode (the stricter case) is measured at about 147 KB with `npm run build` and the
// VITE_SUPABASE_* variables set. The request path is mapped by the `gst-page-routes` plugin in
// vite.config.ts (vercel.json does the same in production).
test('the phone route loads under 150 KB of gzipped JavaScript (NFR-004)', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  const loaded = await gzippedScripts(page, '/play?demo=1', async () => {
    await expect(page.getByRole('heading', { name: 'Join the game' })).toBeVisible();
  });
  test.info().annotations.push({ type: 'phone-js-kb', description: loaded.total.toFixed(1) });
  expect(loaded.files.length, 'the phone route loaded no scripts').toBeGreaterThan(0);
  expect(loaded.total, describe(loaded)).toBeLessThan(PHONE_BUDGET_KB);
});

test('the stage loads under 600 KB of gzipped JavaScript up front (NFR-004)', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  const loaded = await gzippedScripts(page, '/?demo=1', async () => {
    await expect(
      page.getByLabel(/new event name/i).or(page.getByRole('status', { name: 'Starting' })),
    ).toBeVisible();
  });
  test.info().annotations.push({ type: 'stage-js-kb', description: loaded.total.toFixed(1) });
  expect(loaded.files.length, 'the stage loaded no scripts').toBeGreaterThan(0);
  expect(loaded.total, describe(loaded)).toBeLessThan(STAGE_BUDGET_KB);
});
