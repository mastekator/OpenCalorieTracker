import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { ADMIN, addMeal, shellCached, signIn, todayShows } from './app';

test('a reload and a new tab without a network show the sent meal', async ({
  page,
  context,
  browserName,
}) => {
  const meal = `Offline porridge ${browserName}`;
  await signIn(page);
  await addMeal(page, meal);
  await shellCached(page);

  await context.setOffline(true);
  await page.reload();
  await todayShows(page, meal);

  const tab = await context.newPage();
  await tab.goto('/');
  await todayShows(tab, meal);
});

// Service worker registrations and Cache Storage are not part of storageState,
// so a cold start is the same browser profile launched again.
test('a cold start without a network opens the shell and the local user', async ({
  playwright,
  browserName,
  baseURL,
}) => {
  const meal = `Cold start soup ${browserName}`;
  const profile = await mkdtemp(join(tmpdir(), 'oct-e2e-'));
  const launch = () =>
    playwright[browserName].launchPersistentContext(profile, {
      baseURL,
      locale: 'en-US',
    });

  const first = await launch();
  const page = first.pages()[0] ?? (await first.newPage());
  await signIn(page);
  await addMeal(page, meal);
  await shellCached(page);
  await first.close();

  const cold = await launch();
  await cold.setOffline(true);
  const again = cold.pages()[0] ?? (await cold.newPage());
  await again.goto('/');
  await todayShows(again, meal);
  await expect(
    again.getByText('Offline · everything is saved on this device'),
  ).toBeVisible();
  await expect(again.getByText(ADMIN.email)).toBeVisible();
  await cold.close();
});
