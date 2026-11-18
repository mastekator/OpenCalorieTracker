import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { AdminAiStatus, AiTestPhoto, AiTestRun } from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { ToastProvider } from '../../ui/Toast/Toast';
import { ModelTest, POLL_MS } from './ModelTest';

const status: AdminAiStatus = {
  provider: 'google',
  providerName: 'Google Gemini',
  model: 'gemini-x',
  keySet: true,
  baseUrlHost: null,
  source: 'admin',
  keyLast4: 'a3F9',
  keyUnreadable: false,
  savedInactive: false,
  rev: 1,
  state: 'ok',
  checkedAt: 0,
  refineLimit: null,
};
const draft = {
  provider: 'google' as const,
  baseUrl: '',
  apiKey: '',
  model: 'gemini-x',
};
const photo = (result: string): AiTestPhoto => ({
  file: 'banana.jpg',
  expected: 'banana; 70-160 kcal; exact',
  ...(result !== 'pending' &&
    result !== 'not_run' && {
      got: 'banana',
      kcal: 105,
      levels: 'exact',
      ms: 2800,
    }),
  result,
});
const ROW =
  '| google | gemini-x | 9/9 | 2026-11-18 | 2.8 s/photo; OCT v0.2.0, prompt 3 |';
const runOf = (patch: Partial<AiTestRun>): AiTestRun => ({
  id: 7,
  provider: 'google',
  model: 'gemini-x',
  status: 'done',
  stopReason: null,
  appVersion: '0.2.0',
  promptVersion: 3,
  startedAt: 0,
  finishedAt: 1,
  inputTokens: 100,
  outputTokens: 20,
  costUsd: null,
  passed: 1,
  total: 1,
  msPerPhoto: 2800,
  photos: [photo('ok')],
  modelsMdRow: ROW,
  report: `## Model test\n\n${ROW}`,
  ...patch,
});

/** Answers by path; a function answers each call anew. */
function serve(
  routes: Record<string, unknown | (() => Response | Promise<Response>)>,
) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    const route = routes[key];
    if (route === undefined)
      return Response.json({ error: { code: 'not_found' } }, { status: 404 });
    return typeof route === 'function'
      ? (route as () => Response | Promise<Response>)()
      : Response.json(route);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

async function mount(onFinished?: () => void) {
  render(
    <I18nProvider>
      <ToastProvider>
        <div data-testid="ready">
          <ModelTest
            status={status}
            draft={draft}
            dirty={false}
            onFinished={onFinished}
          />
        </div>
      </ToastProvider>
    </I18nProvider>,
  );
  await screen.findByTestId('ready');
}

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Model test', () => {
  it('a complete run offers both copy buttons', async () => {
    serve({
      'GET /api/admin/ai/tests': [runOf({})],
      'GET /api/admin/ai/tests/7': runOf({}),
    });
    await mount();
    expect(await screen.findByText('Copy row for MODELS.md')).toBeTruthy();
    expect(screen.getByText('Copy full report')).toBeTruthy();
    expect(screen.getByText('1 of 1')).toBeTruthy();
  });

  it.each([
    [
      'stopped',
      { status: 'stopped', stopReason: 'auth_error' },
      'Test stopped: key or access error',
    ],
    ['interrupted', { status: 'interrupted' }, 'Interrupted by a restart'],
  ] as const)('a %s run has no copy buttons', async (_, patch, banner) => {
    const run = runOf({ ...patch, modelsMdRow: undefined, report: undefined });
    serve({
      'GET /api/admin/ai/tests': [run],
      'GET /api/admin/ai/tests/7': run,
    });
    await mount();
    expect(await screen.findByText(banner)).toBeTruthy();
    expect(screen.queryByText('Copy row for MODELS.md')).toBeNull();
    expect(screen.queryByText('Copy full report')).toBeNull();
  });

  it('without the clipboard the row opens in a sheet, selected', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    serve({
      'GET /api/admin/ai/tests': [runOf({})],
      'GET /api/admin/ai/tests/7': runOf({}),
    });
    await mount();
    fireEvent.click(await screen.findByText('Copy row for MODELS.md'));
    const sheet = await screen.findByRole('dialog', {
      name: 'Row for MODELS.md',
    });
    expect(sheet.querySelector('pre')?.textContent).toBe(ROW);
    expect(getSelection()?.toString()).toBe(ROW);
  });

  it('409 ai_test_running shows the run already going on', async () => {
    const running = runOf({
      id: 9,
      status: 'running',
      model: 'other-model',
      photos: [photo('ok'), photo('pending'), photo('pending')],
    });
    const fetch = serve({
      'GET /api/admin/ai/tests': [],
      'POST /api/admin/ai/tests': () =>
        Response.json(
          { error: { code: 'ai_test_running', details: { id: 9 } } },
          { status: 409 },
        ),
      'GET /api/admin/ai/tests/9': running,
    });
    await mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Test model' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Run test' }));
    expect(await screen.findByText('Photo 2 of 3')).toBeTruthy();
    expect(screen.getByText('A model test is already running')).toBeTruthy();
    const post = fetch.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(post![1]!.body as string)).toEqual({
      provider: 'google',
      model: 'gemini-x',
    });
  });

  it('back on the screen a running test shows its progress and polls until it ends', async () => {
    const running = runOf({ status: 'running', photos: [photo('pending')] });
    // The first read waits until fake timers are on, so the poll timer is a fake one.
    let release = () => {};
    const first = new Promise<Response>((resolve) => {
      release = () => resolve(Response.json(running));
    });
    let n = 0;
    const fetch = serve({
      'GET /api/admin/ai/tests': [running, runOf({ id: 3 })],
      'GET /api/admin/ai/tests/7': () =>
        n++ === 0 ? first : Response.json(runOf({})),
    });
    const onFinished = vi.fn();
    await mount(onFinished);
    await waitFor(() => expect(n).toBe(1));
    vi.useFakeTimers();
    await act(async () => {
      release();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('Photo 1 of 1')).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(screen.getByText('Copy row for MODELS.md')).toBeTruthy();
    const polls = () =>
      fetch.mock.calls.filter(([url]) => url === '/api/admin/ai/tests/7')
        .length;
    expect(polls()).toBe(2);
    expect(onFinished).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 3));
    expect(polls()).toBe(2);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });
});
