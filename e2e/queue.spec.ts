import { expect, test, type Page } from '@playwright/test';
import { addMeal, serverMeals, shellCached, signIn } from './app';

async function open(page: Page, meal: string) {
  await page.getByText(meal).click();
  await expect(
    page.getByRole('textbox', { name: `Weight of ${meal}` }),
  ).toBeVisible();
}

async function remove(page: Page, meal: string) {
  await open(page, meal);
  await page.getByRole('button', { name: 'Delete entry' }).click();
  // The delete is queued once the undo toast is gone.
  await expect(page.getByText(/ deleted$/)).toBeVisible();
  await expect(page.getByText(/ deleted$/)).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByText(meal)).toHaveCount(0);
}

test('meals added, edited and deleted offline reach the server once', async ({
  page,
  context,
  browserName,
}) => {
  const kept = `Queue Kept ${browserName}`;
  const sent = `Queue Sent ${browserName}`;
  const gone = `Queue Gone ${browserName}`;
  await signIn(page);
  await addMeal(page, sent);
  await shellCached(page);

  await context.setOffline(true);
  await addMeal(page, kept, false);
  await open(page, kept);
  await page.getByRole('textbox', { name: `Weight of ${kept}` }).fill('400');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await remove(page, sent);
  await addMeal(page, gone, false);
  await remove(page, gone);

  await context.setOffline(false);
  // Other specs log meals for the same user today.
  const names = async () =>
    (await serverMeals(page))
      .flatMap((m) => m.items)
      .filter((i) => [kept, sent, gone].includes(i.name))
      .map((i) => `${i.name} ${i.grams}`);
  await expect.poll(names, { timeout: 15_000 }).toEqual([`${kept} 400`]);

  // A resend after the sync (a reload flushes the outbox again) adds nothing.
  for (let i = 0; i < 2; i++) {
    await page.reload();
    await expect(page.getByText(kept)).toBeVisible();
  }
  expect(await names()).toEqual([`${kept} 400`]);
});
