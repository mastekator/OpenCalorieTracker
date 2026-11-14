import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Route, Router, Switch } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
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

/** Answers fetch calls in order; a missing answer hangs until the request is aborted. */
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
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const alertText = async () => (await screen.findByRole('alert')).textContent;

let visibility: DocumentVisibilityState = 'visible';
let online = true;

async function setup() {
  const location = memoryLocation({ path: '/meal/new?photo=p1', record: true });
  render(
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
  await screen.findByText('Recognizing…'); // the dictionary loads first
  return location;
}

beforeEach(() => {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
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
});
