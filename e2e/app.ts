import { expect, type Page } from '@playwright/test';

/** Seeded by playwright.config.ts as the env admin. */
export const ADMIN = { email: 'e2e@example.com', password: 'E2e-test-pass!7' };

export async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByRole('textbox', { name: 'Password' }).fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
}

/** Adds a meal by hand; with `sent`, waits until the server has it. */
export async function addMeal(page: Page, name: string, sent = true) {
  await page.getByRole('button', { name: 'Enter manually' }).click();
  await page.getByLabel(/^Name/).fill(name);
  await page.getByLabel(/^Weight/).fill('250');
  await page.getByRole('textbox', { name: /^Calories/ }).fill('120');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const post = sent
    ? page.waitForResponse(
        (r) =>
          r.url().endsWith('/api/meals') && r.request().method() === 'POST',
      )
    : null;
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  if (post) expect((await post).ok()).toBe(true);
  await expect(page.getByText(name)).toBeVisible();
}

/** The service worker has cached the shell, so the next load works without a network. */
export async function shellCached(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
}

/** Today with the meal: not the sign-in screen and no error state. */
export async function todayShows(page: Page, meal: string) {
  await expect(page.getByText(meal)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
}

/** Today's meals as the server has them, read with the page's session. */
export async function serverMeals(page: Page) {
  const today = await page.evaluate(() => new Date().toLocaleDateString('sv'));
  const res = await page.request.get(`/api/days/${today}`);
  expect(res.ok()).toBe(true);
  // The fields these tests read of DayResponse (packages/shared).
  const day = (await res.json()) as {
    meals: {
      items: { name: string; grams: number }[];
      photo: { id: string } | null;
    }[];
  };
  return day.meals;
}
