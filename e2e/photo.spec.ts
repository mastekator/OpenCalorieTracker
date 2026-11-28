import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test, type BrowserContext } from '@playwright/test';
import { serverMeals, shellCached, signIn } from './app';

// A new context is a private window; WebKit stores no Blob in IndexedDB there.
for (const profile of [true, false]) {
  test(`a photo without a network opens manual entry and is sent later (${profile ? 'profile' : 'private window'})`, async ({
    browser,
    playwright,
    browserName,
    baseURL,
  }) => {
    test.fixme(
      !profile && browserName === 'webkit',
      'OCT-555 finding: a Safari private window cannot queue the photo offline («Couldn’t save»)',
    );
    const meal = `Offline photo pie ${browserName} ${profile ? 'profile' : 'private'}`;
    const dir = profile ? await mkdtemp(join(tmpdir(), 'oct-e2e-')) : null;
    const context: BrowserContext = dir
      ? await playwright[browserName].launchPersistentContext(dir, {
          baseURL,
          locale: 'en-US',
        })
      : await browser.newContext();
    try {
      const page = context.pages()[0] ?? (await context.newPage());
      await signIn(page);
      await shellCached(page);

      await context.setOffline(true);
      await page
        .getByTestId('capture-pick')
        .setInputFiles(resolve('apps/web/public/pwa-192x192.png'));
      await expect(
        page.getByText('No connection — enter the dishes manually', {
          exact: false,
        }),
      ).toBeVisible();
      await page.getByLabel(/^Name/).fill(meal);
      await page.getByLabel(/^Weight/).fill('150');
      await page.getByRole('textbox', { name: /^Calories/ }).fill('300');
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
      await expect(page.getByText(meal)).toBeVisible();

      await context.setOffline(false);
      const photo = async () =>
        (await serverMeals(page)).find((m) =>
          m.items.some((i) => i.name === meal),
        )?.photo ?? 'not sent';
      await expect
        .poll(photo, { timeout: 15_000 })
        .toEqual({ id: expect.any(String), full: true });
    } finally {
      await context.close();
      if (dir) await rm(dir, { recursive: true, force: true });
    }
  });
}
