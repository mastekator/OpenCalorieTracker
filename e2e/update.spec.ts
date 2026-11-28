import { spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN, addMeal, shellCached, signIn, todayShows } from './app';

// Its own server per worker on a copy of the build, so the shared one keeps v1.
let tmp: string;
let dist: string;
let server: ChildProcess | undefined;
let baseURL: string;

const freePort = () =>
  new Promise<number>((done, fail) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => done(port));
    });
    s.on('error', fail);
  });

test.beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'oct-e2e-update-'));
  dist = join(tmp, 'dist');
  const port = await freePort();
  baseURL = `http://localhost:${port}`;
  server = spawn(process.execPath, [resolve('apps/server/dist/index.js')], {
    stdio: 'ignore',
    env: {
      ...process.env,
      DATA_DIR: join(tmp, 'data'),
      WEB_DIST: dist,
      PORT: String(port),
      HOST: '127.0.0.1',
      PUBLIC_URL: baseURL,
      AUTH_METHODS: 'password',
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
    },
  });
  await expect
    .poll(
      () =>
        fetch(`${baseURL}/api/config`).then(
          (r) => r.ok,
          () => false,
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
});

test.afterAll(async () => {
  server?.kill();
  if (tmp) await rm(tmp, { recursive: true, force: true });
});

/** The build as deployed: v1, or v2 with a marked index.html and so a new sw.js. */
async function deploy(version: 'v1' | 'v2') {
  if (version === 'v1') {
    await rm(dist, { recursive: true, force: true });
    await cp(resolve('apps/web/dist'), dist, { recursive: true });
    return;
  }
  const html = join(dist, 'index.html');
  await writeFile(
    html,
    (await readFile(html, 'utf8')).replace(
      '</head>',
      '<meta name="oct-build" content="v2"></head>',
    ),
  );
  const sw = join(dist, 'sw.js');
  const next = (await readFile(sw, 'utf8')).replace(
    /(url:"index\.html",revision:")[0-9a-f]+"/,
    '$1e2e-v2"',
  );
  expect(next).toContain('revision:"e2e-v2"');
  await writeFile(sw, next);
}

const build = (page: Page) =>
  page.evaluate(
    () =>
      document
        .querySelector('meta[name="oct-build"]')
        ?.getAttribute('content') ?? 'v1',
  );

/** registration.update() found the new build and it waits for the old tabs to go. */
const waiting = (page: Page) =>
  page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    await r.update();
    const sw = r.installing ?? r.waiting;
    if (sw && sw.state !== 'installed')
      await new Promise<void>((done) =>
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed') done();
        }),
      );
    return Boolean(r.waiting);
  });

test('a restart takes the new build, which still opens offline', async ({
  playwright,
  browserName,
}) => {
  const meal = `Update toast ${browserName}`;
  await deploy('v1');
  const profile = await mkdtemp(join(tmp, 'profile-'));
  const launch = () =>
    playwright[browserName].launchPersistentContext(profile, {
      baseURL,
      locale: 'en-US',
    });

  let context = await launch();
  let page = context.pages()[0] ?? (await context.newPage());
  await signIn(page);
  await addMeal(page, meal);
  await shellCached(page);
  await deploy('v2');
  expect(await waiting(page)).toBe(true);
  expect(await build(page)).toBe('v1');
  await context.close();

  // Every tab of the old build is closed: the waiting worker takes over.
  context = await launch();
  await context.setOffline(true);
  page = context.pages()[0] ?? (await context.newPage());
  await page.goto('/');
  await todayShows(page, meal);
  expect(await build(page)).toBe('v2');
  await context.close();
});

test('an open tab moves to the new build when shown again, and opens offline', async ({
  browser,
  browserName,
}) => {
  test.fixme(
    browserName === 'chromium',
    'OCT-555 finding: the app posts SKIP_WAITING but the new worker never activates in Chromium',
  );
  const meal = `Update bagel ${browserName}`;
  await deploy('v1');
  const context = await browser.newContext({ baseURL, locale: 'en-US' });
  const page = await context.newPage();
  await signIn(page);
  await addMeal(page, meal);
  await shellCached(page);
  // A tab the worker controls, as any tab after the first visit.
  await page.reload();
  await todayShows(page, meal);
  await deploy('v2');
  expect(await waiting(page)).toBe(true);

  // The silent policy applies a waiting build when the tab becomes visible.
  // Workbox reports the waiting worker 200 ms after it installs, so show the tab until it reloads.
  await expect(async () => {
    const reloaded = page.waitForEvent('load', { timeout: 1000 });
    await page
      .evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
      .catch(() => {}); // the reload can cut it short
    await reloaded;
  }).toPass({ timeout: 15_000 });
  await todayShows(page, meal);
  expect(await build(page)).toBe('v2');

  await context.setOffline(true);
  await page.reload();
  await todayShows(page, meal);
  expect(await build(page)).toBe('v2');
  await context.close();
});
