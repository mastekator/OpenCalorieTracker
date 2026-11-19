import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { AiTestRun, AiTestRunSummary } from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { TEST_PHOTOS } from '../../ui/TestPhotoList/fixtures';
import { ToastProvider } from '../../ui/Toast/Toast';
import { ModelCompare } from './ModelCompare';

const ROW =
  '| google | gemini-x | 8/9 | 2026-11-18 | 2.8 s/photo; OCT v0.2.0, prompt 3 |';
const summary = (
  id: number,
  patch: Partial<AiTestRunSummary> = {},
): AiTestRunSummary => ({
  id,
  provider: 'google',
  model: `model-${id}`,
  status: 'done',
  stopReason: null,
  appVersion: '0.2.0',
  promptVersion: 3,
  testSet: 2,
  currentSet: 2,
  startedAt: Date.UTC(2026, 10, 18),
  finishedAt: Date.UTC(2026, 10, 18),
  inputTokens: 100,
  outputTokens: 20,
  costUsd: null,
  passed: 8,
  total: 9,
  msPerPhoto: 2800,
  ...patch,
});
const full = (s: AiTestRunSummary): AiTestRun => ({
  ...s,
  photos: TEST_PHOTOS,
  ...(s.status === 'done' && { modelsMdRow: ROW, report: ROW }),
});

/** Answers by `METHOD path`; a function answers each call anew. */
function serve(routes: Record<string, unknown | (() => unknown)>) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const route = routes[`${init?.method ?? 'GET'} ${url}`];
    if (route === undefined)
      return Response.json({ error: { code: 'not_found' } }, { status: 404 });
    const body = typeof route === 'function' ? route() : route;
    return body === null
      ? new Response(null, { status: 204 })
      : Response.json(body);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
const calls = (fetch: ReturnType<typeof serve>, method: string, url: string) =>
  fetch.mock.calls.filter(
    ([u, init]) => u === url && (init?.method ?? 'GET') === method,
  ).length;

function mount(rev = 0) {
  const tree = (n: number) => (
    <I18nProvider>
      <ToastProvider>
        <ModelCompare rev={n} />
      </ToastProvider>
    </I18nProvider>
  );
  const { rerender } = render(tree(rev));
  return (n: number) => rerender(tree(n));
}

// jsdom has no showModal, so the dialog stays out of the role tree.
const confirmDialog = async (title: string) =>
  (await screen.findByText(title)).closest('dialog') as HTMLElement;

const row = (model: string) =>
  screen.getByText(model).closest('li') as HTMLElement;

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('Model comparison', () => {
  it('renders nothing without runs, and leaves a running one to «Model test»', async () => {
    const fetch = serve({
      'GET /api/admin/ai/tests': [summary(1, { status: 'running' })],
    });
    mount();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByText('Model comparison')).toBeNull();
  });

  it('marks the best complete run and only complete runs can be copied', async () => {
    serve({
      'GET /api/admin/ai/tests': [
        summary(1, { passed: 9, status: 'stopped', stopReason: 'user' }),
        summary(2, { passed: 9, status: 'interrupted' }),
        summary(3, { passed: 7 }),
        summary(4, { passed: 7, msPerPhoto: 1500 }),
      ],
    });
    mount();
    await screen.findByText('Model comparison');
    expect(within(row('model-4')).queryByText('best')).toBeTruthy();
    expect(screen.getAllByText('best')).toHaveLength(1);
    expect(within(row('model-1')).getByText('stopped')).toBeTruthy();
    expect(within(row('model-2')).getByText('interrupted')).toBeTruthy();
    // The full name stays in the tooltip when the cell cuts it with «…».
    expect(screen.getByText('model-3').getAttribute('title')).toBe('model-3');
    // Opened, a stopped run shows its photos and «Delete», but no copy buttons.
    serve({
      'GET /api/admin/ai/tests/1': full(
        summary(1, { status: 'stopped', stopReason: 'user' }),
      ),
    });
    fireEvent.click(
      within(row('model-1')).getByRole('button', {
        name: /^Results per photo/,
      }),
    );
    expect(
      await within(row('model-1')).findByAltText('Test photo: banana'),
    ).toBeTruthy();
    expect(within(row('model-1')).queryByText('Copy full report')).toBeNull();
    expect(
      within(row('model-1')).queryByText('Copy row for MODELS.md'),
    ).toBeNull();
    expect(within(row('model-1')).getByText('Delete')).toBeTruthy();
  });

  it('opening a row loads its photos once and copies its row', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const fetch = serve({
      'GET /api/admin/ai/tests': [summary(3)],
      'GET /api/admin/ai/tests/3': full(summary(3)),
    });
    mount();
    const toggle = await screen.findByRole('button', {
      name: 'Results per photo: model-3',
    });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(await screen.findByAltText('Test photo: banana')).toBeTruthy();
    fireEvent.click(screen.getByText('Copy full report'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(ROW));
    fireEvent.click(screen.getByText('Copy row for MODELS.md'));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    fireEvent.click(toggle);
    expect(screen.queryByAltText('Test photo: banana')).toBeNull();
    expect(calls(fetch, 'GET', '/api/admin/ai/tests/3')).toBe(1);
  });

  it('deletes a row after confirming and reads the list again', async () => {
    let list = [summary(1), summary(2)];
    const fetch = serve({
      'GET /api/admin/ai/tests': () => list,
      'DELETE /api/admin/ai/tests/1': () => {
        list = [summary(2)];
        return null;
      },
    });
    mount();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Results per photo: model-1',
      }),
    );
    fireEvent.click(await screen.findByText('Delete'));
    const dialog = await confirmDialog('Delete this run?');
    expect(calls(fetch, 'DELETE', '/api/admin/ai/tests/1')).toBe(0);
    fireEvent.click(within(dialog).getByText('Delete'));
    await waitFor(() => expect(screen.queryByText('model-1')).toBeNull());
    expect(calls(fetch, 'DELETE', '/api/admin/ai/tests/1')).toBe(1);
    expect(screen.getByText('model-2')).toBeTruthy();
  });

  it('«Clear all» deletes every run and the block goes away', async () => {
    let list = [summary(1), summary(2)];
    const fetch = serve({
      'GET /api/admin/ai/tests': () => list,
      'DELETE /api/admin/ai/tests': () => {
        list = [];
        return null;
      },
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Clear all' }));
    const dialog = await confirmDialog('Clear the comparison?');
    fireEvent.click(within(dialog).getByText('Clear all'));
    await waitFor(() =>
      expect(screen.queryByText('Model comparison')).toBeNull(),
    );
    expect(calls(fetch, 'DELETE', '/api/admin/ai/tests')).toBe(1);
  });

  it('a finished run shows up without a reload', async () => {
    let list = [summary(1)];
    serve({ 'GET /api/admin/ai/tests': () => list });
    const bump = mount();
    await screen.findByText('model-1');
    list = [summary(2), summary(1)];
    bump(1);
    expect(await screen.findByText('model-2')).toBeTruthy();
  });
});
