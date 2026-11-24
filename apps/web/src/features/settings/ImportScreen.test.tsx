import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { Meal, MeResponse, Preview } from '@oct/shared';
import { DataProvider } from '../../data/DataContext';
import { openUserDb } from '../../data/db';
import { clearLocal } from '../../data/user';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { ToastProvider } from '../../ui/Toast/Toast';
import { ImportScreen } from './ImportScreen';

const user: MeResponse = {
  id: 7,
  email: 'anna@example.com',
  name: null,
  role: 'user',
  locale: 'en',
  theme: 'system',
  units: 'metric',
  normDisclaimerHidden: false,
  passwordFromConfig: false,
  methods: ['passkey'],
  enabledMethods: ['passkey'],
};

const preview = (over: Partial<Preview> = {}) => ({
  id: 5,
  period: { from: '2024-03-14', to: '2024-03-20' },
  days: 7,
  records: 40,
  skippedDays: 0,
  skippedRecords: 0,
  first: [
    {
      localDate: '2024-03-14',
      time: null,
      mealType: 'breakfast',
      name: 'Oatmeal',
      grams: 250,
      kcal: 312,
      proteinG: 11,
      fatG: 8,
      carbsG: 54,
    },
  ],
  unrecognized: { count: 0, rows: [] },
  ambiguousDates: false,
  ...over,
});
const head = {
  id: 5,
  needsMapping: true,
  headers: ['Date', 'Food', 'Energy (kcal)', 'Meal'],
  columns: { date: 0, name: 1, meal: 3 },
  sample: [['03/04/2024', 'Oatmeal', '312', 'Breakfast']],
};

type Call = { url: string; method: string; body: unknown };
let calls: Call[];
/** Client ids the next sync page deletes, as the pull after «Delete import» brings them. */
let tombstones: string[] = [];
/** Answers the import API by `METHOD path` and sync with an empty page; anything else never settles. */
function serve(routes: Record<string, (body: unknown) => Response>) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const url = String(input);
      const body =
        typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
      calls.push({ url, method, body });
      if (url.startsWith('/api/sync'))
        return Promise.resolve(
          Response.json({
            rev: 1,
            more: false,
            meals: [],
            deletedMealClientIds: tombstones,
          }),
        );
      const route = routes[`${method} ${url}`];
      return route ? Promise.resolve(route(body)) : new Promise(() => {});
    }),
  );
}
const error = (status: number, code: string) => () =>
  Response.json({ error: { code } }, { status });

async function wrap() {
  render(
    <I18nProvider>
      <ToastProvider>
        <DataProvider user={user}>
          <div data-testid="ready">
            <ImportScreen />
          </div>
        </DataProvider>
      </ToastProvider>
    </I18nProvider>,
  );
  await screen.findByTestId('ready');
}

async function upload(source: 'OCT export (JSON)' | 'Other CSV', name: string) {
  fireEvent.click(
    await screen.findByRole('button', { name: (n) => n.startsWith(source) }),
  );
  const file = new File(['x'], name);
  fireEvent.change(screen.getByTestId('import-file'), {
    target: { files: [file] },
  });
  return file;
}
const select = (field: string) =>
  screen.getByRole('combobox', { name: new RegExp(`^${field}`) });
const next = () => screen.getByRole('button', { name: 'Next' });

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(async () => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  tombstones = [];
  await clearLocal(user.id);
});

describe('ImportScreen: column mapping (3.2)', () => {
  it('starts from the guess, needs kcal, sends the picked indexes', async () => {
    serve({
      'POST /api/imports?source=csv': () => Response.json(head),
      'PUT /api/imports/5/mapping': () => Response.json(preview()),
    });
    await wrap();
    await upload('Other CSV', 'diary.csv');

    expect(
      await screen.findByText('Pick a column — entries need calories'),
    ).toBeTruthy();
    expect((select('Date') as HTMLSelectElement).value).toBe('0');
    expect((select('Meal') as HTMLSelectElement).value).toBe('3');
    expect(next().hasAttribute('disabled')).toBe(true);

    fireEvent.change(select('Calories'), { target: { value: '2' } });
    expect(screen.getByText('e.g. 312')).toBeTruthy();
    fireEvent.click(next());

    expect(
      await screen.findByRole('button', { name: 'Import 40 entries' }),
    ).toBeTruthy();
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.body).toEqual({
      columns: { date: 0, name: 1, meal: 3, kcal: 2 },
    });
  });

  it('asks the date order only when the file cannot tell, and sends the answer', async () => {
    serve({
      'POST /api/imports?source=csv': () =>
        Response.json({ ...head, columns: { date: 0, name: 1, kcal: 2 } }),
      'PUT /api/imports/5/mapping': (body) =>
        Response.json(
          preview({
            ambiguousDates: !(body as { dateOrder?: string }).dateOrder,
          }),
        ),
    });
    await wrap();
    await upload('Other CSV', 'diary.csv');
    await screen.findByText(
      'Show which column holds what. We guessed what we could.',
    );
    expect(screen.queryByText('Dates like 03/04/2024 are')).toBeNull();

    fireEvent.click(next());
    expect(await screen.findByText('Dates like 03/04/2024 are')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'March 4' }));
    fireEvent.click(next());

    await screen.findByRole('button', { name: 'Import 40 entries' });
    const puts = calls.filter((c) => c.method === 'PUT');
    expect(puts).toHaveLength(2);
    expect(puts[0]!.body).not.toHaveProperty('dateOrder');
    expect(puts[1]!.body).toMatchObject({ dateOrder: 'mdy' });
  });
});

describe('ImportScreen: file errors (3.6)', () => {
  it.each([
    [
      413,
      'import_too_large',
      'The file is too big — up to 50 MB. Split the export by year.',
    ],
    [
      409,
      'already_imported',
      'This file has already been imported — nothing to import.',
    ],
    [
      400,
      'validation_failed',
      'This doesn’t look like an OCT export. Check the file or pick another source.',
    ],
  ])('%i %s', async (status, code, text) => {
    serve({ 'POST /api/imports?source=oct': error(status, code) });
    await wrap();
    await upload('OCT export (JSON)', 'export.json');
    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.getByText('Couldn’t read the file')).toBeTruthy();
  });

  it('refuses a file over 50 MB before the upload', async () => {
    serve({});
    await wrap();
    fireEvent.click(await screen.findByRole('button', { name: /OCT export/ }));
    const file = new File(['x'], 'big.json');
    Object.defineProperty(file, 'size', { value: 50 * 1024 * 1024 + 1 });
    fireEvent.change(screen.getByTestId('import-file'), {
      target: { files: [file] },
    });
    expect(
      await screen.findByText(
        'The file is too big — up to 50 MB. Split the export by year.',
      ),
    ).toBeTruthy();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });
});

describe('ImportScreen: preview and commit (3.3–3.5)', () => {
  it('the duplicate switch refetches the preview and goes into the commit', async () => {
    vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(180);
    serve({
      'POST /api/imports?source=oct': () =>
        Response.json(
          preview({
            skippedDays: 2,
            skippedRecords: 9,
            unrecognized: { count: 1, rows: [{ line: 12, reason: 'no_kcal' }] },
          }),
        ),
      'GET /api/imports/5/preview?includeDaysWithEntries=1': () =>
        Response.json(preview({ records: 49, skippedDays: 0 })),
      'POST /api/imports/5/commit': () => Response.json({ records: 49 }),
    });
    await wrap();
    await upload('OCT export (JSON)', 'export.json');

    expect(await screen.findByText('2 days · 9 entries left out')).toBeTruthy();
    expect(screen.getByText('Row 12 · no calories')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('switch', { name: 'Import those days too' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Import 49 entries' }),
    );

    expect(await screen.findByText('Imported 49 entries')).toBeTruthy();
    const commit = calls.find((c) => c.url.endsWith('/commit'))!;
    // getTimezoneOffset is west-positive; the server reads an east-positive offset like a meal's.
    expect(commit.body).toEqual({
      includeDaysWithEntries: true,
      tzOffsetMin: -180,
    });
    // The commit is followed by a sync that pulls the imported meals.
    const after = calls.indexOf(commit);
    await waitFor(() =>
      expect(
        calls.slice(after).some((c) => c.url.startsWith('/api/sync')),
      ).toBe(true),
    );
  });

  it('nothing new: the import button is off', async () => {
    serve({
      'POST /api/imports?source=oct': () =>
        Response.json(
          preview({ records: 0, days: 0, first: [], skippedDays: 3 }),
        ),
    });
    await wrap();
    await upload('OCT export (JSON)', 'export.json');
    expect(
      await screen.findByText(
        'All these days are already in your diary — nothing to import.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Import' }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('no row read: says so, not that the days are in the diary', async () => {
    serve({
      'POST /api/imports?source=oct': () =>
        Response.json(
          preview({
            records: 0,
            days: 0,
            first: [],
            unrecognized: { count: 1, rows: [{ line: 2, reason: 'no_date' }] },
          }),
        ),
    });
    await wrap();
    await upload('OCT export (JSON)', 'export.json');
    expect(
      await screen.findByText(
        'No rows could be read — check the file and the columns.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/already in your diary/)).toBeNull();
  });
});

describe('ImportScreen: history and «Delete import» (3.6–3.7)', () => {
  const imported: Meal = {
    id: 3,
    clientId: 'imp-1',
    eatenAt: '2024-03-14T08:00:00.000Z',
    tzOffsetMin: 0,
    localDate: '2024-03-14',
    mealType: 'breakfast',
    photo: null,
    recalcOffer: false,
    items: [],
    kcal: 312,
    proteinG: 11,
    fatG: 8,
    carbsG: 54,
  };

  it('confirms with the edited meals, deletes, syncs the meals away', async () => {
    const db = await openUserDb(user.id);
    await db.put('meals', imported);
    serve({
      'GET /api/imports': () =>
        Response.json([
          {
            id: 9,
            source: 'csv',
            committedAt: Date.UTC(2026, 10, 20),
            records: 4,
          },
        ]),
      'GET /api/imports/9/delete-info': () =>
        Response.json({ records: 4, edited: 1, days: 2 }),
      'DELETE /api/imports/9': () => {
        tombstones = [imported.clientId];
        return new Response(null, { status: 204 });
      },
    });
    await wrap();
    const history = (await screen.findByText('Past imports')).parentElement!;
    expect(within(history).getByText('Other CSV')).toBeTruthy();
    fireEvent.click(
      within(history).getByRole('button', {
        name: /^Delete import: Other CSV, Nov \d+$/,
      }),
    );

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain(
      'This removes 4 entries over 2 days from the diary.',
    );
    expect(dialog.textContent).toContain(
      '1 meal was edited after the import — the edits go too.',
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Delete import' }),
    );

    expect(await screen.findByText('Import deleted')).toBeTruthy();
    expect(screen.getByText('No imports yet')).toBeTruthy();
    await waitFor(async () =>
      expect(await db.get('meals', imported.clientId)).toBeUndefined(),
    );
    db.close();
  });

  it('a failed DELETE keeps the import in the list', async () => {
    serve({
      'GET /api/imports': () =>
        Response.json([
          {
            id: 9,
            source: 'oct',
            committedAt: Date.UTC(2026, 10, 20),
            records: 4,
          },
        ]),
      'GET /api/imports/9/delete-info': () =>
        Response.json({ records: 4, edited: 0, days: 2 }),
      'DELETE /api/imports/9': error(500, 'internal'),
    });
    await wrap();
    fireEvent.click(
      await screen.findByRole('button', { name: /^Delete import: OCT/ }),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).not.toContain('edited');
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Delete import' }),
    );
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'DELETE')).toBe(true),
    );
    expect(
      await screen.findByText('Something went wrong. Try again'),
    ).toBeTruthy();
    expect(screen.queryByText('Import deleted')).toBeNull();
    expect(
      screen
        .getByRole('button', { name: /^Delete import: OCT/ })
        .hasAttribute('disabled'),
    ).toBe(false);
  });
});

it('offline: sources are off and say why', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  serve({});
  await wrap();
  expect(
    await screen.findByText(
      'Needs a connection: the file is read on the server',
    ),
  ).toBeTruthy();
  expect(
    screen
      .getByRole('button', { name: /OCT export/ })
      .getAttribute('aria-disabled'),
  ).toBe('true');
});
