import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react';
import { Route, Router, Switch } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { RecognitionScreen, SLOW_MS, TIMEOUT_MS } from './RecognitionScreen';

const URL = '/api/photos/p1/recognize';
const EDIT = '/meal/new/edit?photo=p1';

const json = (status: number, body: unknown) => () =>
  new Response(JSON.stringify(body), { status });
const dish = {
  name: 'Porridge',
  grams: 250,
  kcal: 300,
  proteinG: 8,
  fatG: 6,
  carbsG: 50,
  confidence: 0.9,
};
const ok = json(200, { dishes: [dish] });
const fail = (status: number, code: string) =>
  json(status, { error: { code } });
const dropped = () => {
  throw new TypeError('Failed to fetch');
};

const STATUS = '/api/ai/status';
let aiStatus: () => Response;
const BARCODES = '/api/photos/p1/barcodes';
let barcodes: () => Response;
const CODE = '4607012345678';
const product = {
  code: CODE,
  name: 'Greek yogurt 2%',
  brand: null,
  kcal100: 70,
  protein100: 9,
  fat100: 2,
  carbs100: 4,
  per: 'g',
  servingG: 140,
  servingText: null,
};
const codes = (...list: { code: string; result: unknown }[]) =>
  json(200, { codes: list });
const statusOf = (recognition: string) =>
  json(200, {
    recognition,
    interview: 'ready',
    providerName: null,
    baseUrlHost: null,
    refineLimit: null,
  });

/**
 * Answers fetch calls in order; a missing answer hangs until the request is aborted.
 * GET /api/ai/status and POST …/barcodes are answered by `aiStatus` and `barcodes`, not counted.
 */
function respond(...answers: (() => Response)[]) {
  const fetch = vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const answer = answers[fetch.mock.calls.length - 1];
        if (answer) {
          try {
            resolve(answer());
          } catch (err) {
            reject(err);
          }
          return;
        }
        init.signal?.addEventListener('abort', () =>
          reject(init.signal?.reason),
        );
      }),
  );
  vi.stubGlobal('fetch', (url: string, init: RequestInit) =>
    url === STATUS
      ? Promise.resolve(aiStatus())
      : url === BARCODES
        ? Promise.resolve(barcodes())
        : fetch(url, init),
  );
  return fetch;
}

const alertText = async () => (await screen.findByRole('alert')).textContent;

let visibility: DocumentVisibilityState = 'visible';
let online = true;

async function setup(path = '/meal/new?photo=p1') {
  const location = memoryLocation({ path, record: true });
  await renderLoaded(
    <I18nProvider>
      <Router hook={location.hook} searchHook={location.searchHook}>
        <Switch>
          <Route path="/meal/new">
            <RecognitionScreen photoId="p1" />
          </Route>
          <Route>
            <p>Elsewhere</p>
          </Route>
        </Switch>
      </Router>
    </I18nProvider>,
  );
  return location;
}

beforeEach(() => {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  aiStatus = statusOf('ready');
  barcodes = codes();
  visibility = 'visible';
  online = true;
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
    () => visibility,
  );
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('RecognitionScreen', () => {
  it('opens the edit screen with the dishes at once (AC-0.1)', async () => {
    const fetch = respond(ok);
    const location = await setup();
    await waitFor(() => expect(location.history.at(-1)).toBe(EDIT));
    expect(fetch).toHaveBeenCalledWith(
      URL,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it.each([
    ['ai_unavailable', 503, 'AI is unavailable right now', 'Try again'],
    ['internal', 500, 'AI is unavailable right now', 'Try again'],
    ['too_many_attempts', 429, 'AI is unavailable right now', 'Try again'],
    ['ai_quota_exceeded', 429, 'AI request limit reached', 'Close'],
    ['ai_invalid_response', 502, 'Couldn’t recognize the photo', 'Try again'],
  ])(
    '%s → its own state and text (AC-6.1)',
    async (code, status, title, cta) => {
      respond(fail(status, code));
      await setup();
      const alert = await screen.findByRole('alert');
      expect(alert?.textContent).toContain(title);
      expect(screen.getByRole('button', { name: cta })).toBeTruthy();
      expect(document.activeElement?.textContent).toContain(title);
    },
  );

  it('an expired photo offers retake, not retry', async () => {
    respond(fail(410, 'photo_expired'));
    await setup();
    expect(await alertText()).toContain('The full photo is no longer stored');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Retake' })).toBeTruthy();
  });

  it('an empty list → no food found (E-7.1)', async () => {
    respond(json(200, { dishes: [] }));
    await setup();
    expect(await alertText()).toContain('No food found in the photo');
  });

  it('AI not configured → the edit screen with manual entry', async () => {
    respond(fail(409, 'ai_not_configured'));
    const location = await setup();
    await waitFor(() => expect(location.history.at(-1)).toBe(EDIT));
  });

  it.each(['not_configured', 'no_vision'])(
    'AI %s → the edit screen without a recognize request (AC-5.6, AC-6.6)',
    async (recognition) => {
      aiStatus = statusOf(recognition);
      const fetch = respond(ok);
      const location = await setup();
      await waitFor(() => expect(location.history.at(-1)).toBe(EDIT));
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('recognizes anyway when the AI status is unknown', async () => {
    aiStatus = fail(500, 'internal');
    const fetch = respond(ok);
    const location = await setup();
    await waitFor(() => expect(location.history.at(-1)).toBe(EDIT));
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('passes the day of «Add an entry for this day» on to the edit screen (AC-2.11)', async () => {
    respond(ok);
    const location = await setup('/meal/new?photo=p1&date=2026-11-10');
    await waitFor(() =>
      expect(location.history.at(-1)).toBe(`${EDIT}&date=2026-11-10`),
    );
  });

  it('after 10 s shows «taking longer» and manual entry (E-7.5)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    respond();
    await setup();
    expect(screen.queryByText(/Taking longer than usual/)).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(SLOW_MS));
    expect(screen.getByText(/Taking longer than usual/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enter manually' })).toBeTruthy();
  });

  it('gives up after 65 s with «unavailable»', async () => {
    const timeout = new AbortController();
    const spy = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(timeout.signal);
    respond();
    await setup();
    expect(spy).toHaveBeenCalledWith(TIMEOUT_MS);
    act(() => timeout.abort(new DOMException('timed out', 'TimeoutError')));
    expect(await alertText()).toContain('AI is unavailable right now');
  });

  it('cancel aborts the request and ignores a late answer (AC-2.5)', async () => {
    let answer!: (res: Response) => void;
    const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      () => new Promise((resolve) => (answer = resolve)),
    );
    vi.stubGlobal('fetch', fetch);
    const location = await setup();
    fireEvent.click(screen.getByRole('link', { name: 'Cancel' }));
    await screen.findByText('Elsewhere');
    expect(fetch.mock.calls[0]![1].signal!.aborted).toBe(true);
    answer(ok());
    await new Promise((r) => setTimeout(r, 0));
    expect(location.history.at(-1)).toBe('/');
  });

  it('retries once on the same photo when back from the background (E-7.8)', async () => {
    visibility = 'hidden';
    const fetch = respond(dropped, ok);
    const location = await setup();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(fetch).toHaveBeenCalledTimes(1); // waits while hidden
    visibility = 'visible';
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(location.history.at(-1)).toBe(EDIT));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]![0]).toBe(URL);
  });

  it('a second drop ends in «unavailable», not an endless spinner', async () => {
    const fetch = respond(dropped, dropped);
    await setup();
    expect(await alertText()).toContain('AI is unavailable right now');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('offline → «no connection», then recognizes once online', async () => {
    online = false;
    const fetch = respond(dropped, ok);
    const location = await setup();
    expect(await alertText()).toContain('No connection');
    online = true;
    act(() => void window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(location.history.at(-1)).toBe(EDIT));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('«Try again» sends the same photo again (AC-6.4)', async () => {
    const fetch = respond(fail(503, 'ai_unavailable'), ok);
    const location = await setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(location.history.at(-1)).toBe(EDIT));
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([URL, URL]);
  });

  describe('barcodes (OCT-313 §1)', () => {
    it('glues the AI dishes with the product found by its barcode (ADR-0034 §2)', async () => {
      barcodes = codes({
        code: CODE,
        result: { product, from: 'off', off: 'found' },
      });
      respond(
        json(200, {
          dishes: [
            { ...dish, barcode: CODE },
            { ...dish, name: 'Bread' },
          ],
        }),
      );
      const location = await setup();
      await waitFor(() => expect(location.history.at(-1)).toBe(EDIT));
      expect(location.state).toEqual({
        dishes: [
          expect.objectContaining({
            name: 'Greek yogurt 2%',
            grams: 140,
            source: 'barcode',
            barcode: CODE,
          }),
          expect.objectContaining({ name: 'Bread', source: 'ai' }),
        ],
        codes: [expect.objectContaining({ code: CODE })],
      });
    });

    it('shows the steps while the AI reads the photo', async () => {
      barcodes = codes({
        code: CODE,
        result: { product: null, from: null, off: 'down' },
      });
      respond();
      await setup();
      const steps = await screen.findByRole('list', {
        name: 'Recognition steps',
      });
      await waitFor(() =>
        expect(steps.textContent).toContain(
          'Not responding — reading the label',
        ),
      );
      expect(steps.textContent).toContain(CODE);
      expect(steps.textContent).toContain(
        'Nutrition table on the package and the rest of the food',
      );
    });

    it('with Open Food Facts off the AI reads the label (1.5)', async () => {
      barcodes = codes({
        code: CODE,
        result: { product: null, from: null, off: 'disabled' },
      });
      respond();
      await setup();
      const steps = await screen.findByRole('list', {
        name: 'Recognition steps',
      });
      await waitFor(() =>
        expect(steps.textContent).toContain(
          'Nutrition table on the package and the rest of the food',
        ),
      );
    });

    it('a failed barcode read says steps 1–2 are skipped, states are spoken', async () => {
      barcodes = fail(500, 'internal');
      respond();
      await setup();
      const steps = await screen.findByRole('list', {
        name: 'Recognition steps',
      });
      await waitFor(() =>
        expect(steps.textContent).toBe(
          'BarcodeSkippedOpen Food FactsSkippedAI reads the photoin progress',
        ),
      );
    });

    it('a failed barcode read skips steps 1–2, the AI dishes go on (OCT-16)', async () => {
      barcodes = fail(500, 'internal');
      respond(ok);
      const location = await setup();
      await waitFor(() => expect(location.history.at(-1)).toBe(EDIT));
      expect(location.state).toEqual({
        dishes: [expect.objectContaining({ name: 'Porridge', source: 'ai' })],
        codes: [],
      });
    });

    it('without AI a found product opens the edit screen, no recognize (AC-4.7)', async () => {
      aiStatus = statusOf('not_configured');
      barcodes = codes({
        code: CODE,
        result: { product, from: 'mine', off: 'skipped' },
      });
      const fetch = respond(ok);
      const location = await setup();
      await waitFor(() => expect(location.history.at(-1)).toBe(EDIT));
      expect(location.state).toEqual({
        dishes: [expect.objectContaining({ source: 'barcode', from: 'mine' })],
        codes: [expect.objectContaining({ code: CODE })],
      });
      expect(fetch).not.toHaveBeenCalled();
    });

    it('without AI a code not found → manual entry with it (3.4)', async () => {
      aiStatus = statusOf('no_vision');
      barcodes = codes({
        code: CODE,
        result: { product: null, from: null, off: 'missing' },
      });
      respond();
      const location = await setup();
      await waitFor(() => expect(location.history.at(-1)).toBe(EDIT));
      expect(location.state).toEqual({ manual: 'no_vision', barcode: CODE });
    });

    it('a 409 from recognize goes the same way without AI', async () => {
      aiStatus = fail(500, 'internal');
      barcodes = codes({
        code: CODE,
        result: { product: null, from: null, off: 'disabled' },
      });
      respond(fail(409, 'ai_not_configured'));
      const location = await setup();
      await waitFor(() => expect(location.history.at(-1)).toBe(EDIT));
      expect(location.state).toEqual({
        manual: 'not_configured',
        barcode: CODE,
      });
    });
  });
});
