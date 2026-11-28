import {
  expect,
  test,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test';
import { addMeal, shellCached, signIn, todayShows } from './app';

/** The local copy opens without waiting for the server (OCT-553). */
const OPENS_WITHIN_MS = 2000;

/** A device that has signed in and sent a meal, so it has a local copy. */
async function deviceWithMeal(
  browser: Browser,
  meal: string,
  options: BrowserContextOptions = {},
) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await signIn(page);
  await addMeal(page, meal);
  if (options.serviceWorkers !== 'block') await shellCached(page);
  await page.close();
  return context;
}

async function timeToToday(page: Page, meal: string) {
  const start = Date.now();
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.getByText(meal)).toBeVisible({ timeout: 15_000 });
  return Date.now() - start;
}

const badApi = [
  { name: 'hangs', answer: () => {} },
  { name: 'answers 502', answer: (r) => r.fulfill({ status: 502 }) },
  { name: 'answers 503', answer: (r) => r.fulfill({ status: 503 }) },
] satisfies { name: string; answer: Parameters<Page['route']>[1] }[];

for (const { name, answer } of badApi) {
  test(`the local copy opens fast while /api ${name}`, async ({
    browser,
    browserName,
  }) => {
    const meal = `Bad api salad ${browserName} ${name}`;
    // WebKit does not route requests of a page under a service worker; the shell
    // comes from the server here anyway, only /api is bad.
    const context = await deviceWithMeal(browser, meal, {
      serviceWorkers: 'block',
    });
    await context.route('/api/**', answer);
    const page = await context.newPage();
    expect(await timeToToday(page, meal)).toBeLessThan(OPENS_WITHIN_MS);
    await todayShows(page, meal);
    await context.unrouteAll({ behavior: 'ignoreErrors' });
    await context.close();
  });
}

test('the local copy opens fast on a slow network', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'network emulation is CDP-only');
  const meal = 'Slow network stew';
  const context = await deviceWithMeal(browser, meal);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 3000,
    downloadThroughput: 50_000 / 8,
    uploadThroughput: 20_000 / 8,
  });
  expect(await timeToToday(page, meal)).toBeLessThan(OPENS_WITHIN_MS);
  await todayShows(page, meal);
  await context.close();
});

test('without a local copy a hanging /me ends on the no-connection screen', async ({
  page,
}) => {
  await page.route('/api/auth/me', () => {});
  await page.goto('/');
  await expect(
    page.getByRole('alert').getByText('First sign-in needs a connection'),
  ).toBeVisible({ timeout: 10_000 });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});
