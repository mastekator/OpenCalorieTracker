import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import type { MeResponse } from '@oct/shared';
import { SessionContext } from '../../app/SessionContext';
import { setDeviceAi } from '../../data/deviceAi';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { ToastProvider } from '../../ui/Toast/Toast';
import { renderLoaded } from '../../test-utils';
import { CaptureProvider, useCapture } from './CaptureContext';
import { ImageDecodeError, prepareImage } from './prepareImage';

vi.mock('./prepareImage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./prepareImage')>()),
  prepareImage: vi.fn(),
}));

const jpeg = new Blob(['jpeg'], { type: 'image/jpeg' });
const photo = new File(['raw'], 'food.heic', { type: 'image/heic' });

function Probe() {
  const capture = useCapture();
  return (
    <>
      <button onClick={() => capture.addTo('2026-11-10')}>Add to day</button>
      <button onClick={capture.manual}>Direct manual</button>
      <button onClick={capture.menu}>Open menu</button>
      <button onClick={capture.retry}>Retry upload</button>
      <output data-testid="pending">{capture.pending?.status ?? 'none'}</output>
    </>
  );
}

const user = { id: 7 } as MeResponse;
/** The `state` of every navigation, in order (memoryLocation keeps paths only). */
let states: unknown[] = [];

async function setup(path = '/') {
  const location = memoryLocation({ path, record: true });
  states = [];
  const hook = () => {
    const [at, navigate] = location.hook();
    return [
      at,
      (to: string, options?: { replace?: boolean; state?: unknown }) => {
        states.push(options?.state);
        navigate(to, options);
      },
    ] as [string, (to: string, options?: { state?: unknown }) => void];
  };
  await renderLoaded(
    <I18nProvider>
      <ToastProvider>
        <SessionContext.Provider
          value={{
            user,
            refresh: async () => {},
            signedIn: async () => {},
            logout: async () => {},
          }}
        >
          <Router hook={hook} searchHook={location.searchHook}>
            <CaptureProvider>
              <p>Today</p>
              <Probe />
            </CaptureProvider>
          </Router>
        </SessionContext.Provider>
      </ToastProvider>
    </I18nProvider>,
  );
  return location;
}

const choose = (files: File[]) =>
  fireEvent.change(screen.getByTestId('capture-pick'), { target: { files } });

const respond = (...responses: (() => Response)[]) => {
  const fetch = vi.fn();
  for (const r of responses) fetch.mockImplementationOnce(async () => r());
  vi.stubGlobal('fetch', fetch);
  return fetch;
};
const failed = (status: number, code: string) => () =>
  new Response(JSON.stringify({ error: { code } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const held = () => {
  let finish!: (r: Response) => void;
  const fetch = vi.fn(
    () => new Promise<Response>((resolve) => (finish = resolve)),
  );
  vi.stubGlobal('fetch', fetch);
  return {
    fetch,
    finish: async (r: Response) => {
      await waitFor(() => expect(fetch).toHaveBeenCalled());
      await act(async () => finish(r));
    },
  };
};
const pending = () => screen.getByTestId('pending').textContent;

const created = () =>
  new Response('{"photoId":"abc"}', {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  vi.mocked(prepareImage).mockReset().mockResolvedValue(jpeg);
  let n = 0;
  URL.createObjectURL = () => `blob:photo-${++n}`;
  URL.revokeObjectURL = () => {};
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CaptureProvider', () => {
  it('does nothing when the picker is closed without a file (AC-1.6)', async () => {
    const fetch = respond();
    await setup();
    choose([]);
    expect(prepareImage).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uploads the prepared JPEG and opens the meal flow with its photoId', async () => {
    const fetch = respond(created);
    const location = await setup();
    choose([photo]);
    await waitFor(() =>
      expect(location.history.at(-1)).toBe('/meal/new?photo=abc'),
    );
    expect(prepareImage).toHaveBeenCalledWith(photo);
    const [path, init] = fetch.mock.calls[0]!;
    expect(path).toBe('/api/photos');
    expect(init).toMatchObject({ method: 'POST', body: jpeg });
  });

  describe('without AI (ADR-0031 §6)', () => {
    const consents = (granted: string[]) =>
      localStorage.setItem(
        `oct.aiConsents.${user.id}`,
        JSON.stringify({
          consents: granted.map((providerKey) => ({
            providerKey,
            grantedAt: 1,
          })),
          server: {
            providerKey: 'google',
            provider: 'google',
            host: null,
            local: false,
          },
        }),
      );
    const offline = () =>
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    afterEach(() => vi.restoreAllMocks());

    it('AI off: the photo opens manual entry with it, nothing is uploaded or recognized', async () => {
      setDeviceAi(user.id, false);
      const fetch = respond();
      const location = await setup();
      choose([photo]);
      await waitFor(() =>
        expect(location.history.at(-1)).toBe('/meal/new/edit'),
      );
      expect(states.at(-1)).toEqual({ manual: 'user', photo: jpeg });
      expect(pending()).toBe('none');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('AI off: menu 5.5 says so above «Take photo», «Settings» opens Settings → AI (OCT-178 4.4)', async () => {
      setDeviceAi(user.id, false);
      const location = await setup();
      fireEvent.click(screen.getByText('Open menu'));
      expect(
        await screen.findByText('AI is off on this device', { exact: false }),
      ).toBeTruthy();
      fireEvent.click(screen.getByRole('link', { name: 'Settings' }));
      expect(location.history.at(-1)).toBe('/settings/ai');
      await waitFor(() => expect(screen.queryByText('Take photo')).toBeNull());
    });

    it('AI on: menu 5.5 has no note', async () => {
      await setup();
      fireEvent.click(screen.getByText('Open menu'));
      expect(await screen.findByText('Take photo')).toBeTruthy();
      expect(
        screen.queryByText('AI is off on this device', { exact: false }),
      ).toBeNull();
    });

    it('offline without consent in the copy: manual entry, no recognition request', async () => {
      consents([]);
      offline();
      const fetch = respond();
      const location = await setup();
      choose([photo]);
      await waitFor(() =>
        expect(location.history.at(-1)).toBe('/meal/new/edit'),
      );
      expect(states.at(-1)).toEqual({ manual: 'offline', photo: jpeg });
      expect(fetch).not.toHaveBeenCalled();
    });

    it('offline with no copy at all counts as no consent', async () => {
      offline();
      const fetch = respond();
      const location = await setup();
      choose([photo]);
      await waitFor(() =>
        expect(location.history.at(-1)).toBe('/meal/new/edit'),
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it('offline with consent: uploads as before, the screen waits for the network', async () => {
      consents(['google']);
      offline();
      const fetch = vi.fn().mockRejectedValue(new TypeError('offline'));
      vi.stubGlobal('fetch', fetch);
      await setup();
      choose([photo]);
      await waitFor(() => expect(pending()).toBe('offline'));
      expect(fetch.mock.calls[0]![0]).toBe('/api/photos');
    });
  });

  it('«Add an entry for this day» carries the date; other ways in do not (AC-2.11)', async () => {
    respond();
    const location = await setup();
    fireEvent.click(screen.getByText('Add to day'));
    fireEvent.click(await screen.findByText('Enter manually'));
    expect(location.history.at(-1)).toBe('/meal/new?date=2026-11-10');
    act(() => location.navigate('/'));
    fireEvent.click(screen.getByText('Direct manual'));
    expect(location.history.at(-1)).toBe('/meal/new');
  });

  it('a paste after «Add an entry for this day» was closed goes to today', async () => {
    respond(created);
    const location = await setup();
    fireEvent.click(screen.getByText('Add to day'));
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
    fireEvent(
      window,
      createEvent.paste(window, { clipboardData: { files: [photo] } }),
    );
    await waitFor(() =>
      expect(location.history.at(-1)).toBe('/meal/new?photo=abc'),
    );
  });

  it("a retake by paste inside a past day's flow keeps the day", async () => {
    respond(created);
    const location = await setup('/meal/new?photo=old&date=2026-11-10');
    fireEvent(
      window,
      createEvent.paste(window, { clipboardData: { files: [photo] } }),
    );
    await waitFor(() =>
      expect(location.history.at(-1)).toBe(
        '/meal/new?photo=abc&date=2026-11-10',
      ),
    );
  });

  it('shows dialog 3.8 and uploads nothing when the photo cannot be decoded (E-1.1)', async () => {
    const fetch = respond();
    vi.mocked(prepareImage).mockRejectedValue(new ImageDecodeError());
    await setup();
    choose([photo]);
    expect(
      await screen.findByRole('heading', { name: 'Couldn’t open the photo' }),
    ).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('opens the flow before the upload answers, then replaces it with the photoId (OCT-370)', async () => {
    const { finish } = held();
    const location = await setup();
    choose([photo]);
    expect(location.history.at(-1)).toBe('/meal/new');
    expect(pending()).toBe('uploading');
    await finish(created());
    expect(location.history).toEqual(['/', '/meal/new?photo=abc']);
    expect(pending()).toBe('none');
  });

  it('a late photoId after «Cancel» leads nowhere', async () => {
    const { fetch, finish } = held();
    const location = await setup();
    choose([photo]);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    act(() => location.navigate('/'));
    expect(pending()).toBe('none');
    await finish(created());
    expect(location.history.at(-1)).toBe('/');
  });

  it('a rejected photo goes back from the flow and shows dialog 3.8', async () => {
    respond(failed(400, 'photo_invalid'));
    const back = vi.spyOn(history, 'back').mockImplementation(() => {});
    const location = await setup();
    choose([photo]);
    expect(
      await screen.findByRole('heading', { name: 'Couldn’t open the photo' }),
    ).toBeTruthy();
    expect(back).toHaveBeenCalledOnce();
    // Kept until back lands, so the flow doesn't redirect to manual entry first.
    expect(pending()).toBe('uploading');
    act(() => location.navigate('/'));
    expect(pending()).toBe('none');
    back.mockRestore();
  });

  it('a rejected retake puts the old photo back instead of leaving the flow', async () => {
    respond(failed(413, 'photo_too_large'));
    const back = vi.spyOn(history, 'back');
    const location = await setup('/meal/new?photo=old&date=2026-11-10');
    choose([photo]);
    expect(
      await screen.findByRole('heading', { name: 'Couldn’t open the photo' }),
    ).toBeTruthy();
    expect(location.history.at(-1)).toBe('/meal/new?photo=old&date=2026-11-10');
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it('any other upload error is shown on the screen, not left uploading', async () => {
    respond(failed(429, 'rate_limited'));
    const location = await setup();
    choose([photo]);
    await waitFor(() => expect(pending()).toBe('upload_failed'));
    expect(location.history.at(-1)).toBe('/meal/new');
  });

  it('ignores another photo while one is being uploaded', async () => {
    const { fetch, finish } = held();
    const location = await setup();
    choose([photo]);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    choose([photo]);
    fireEvent.drop(window, {
      dataTransfer: { types: ['Files'], files: [photo] },
    });
    await finish(created());
    await waitFor(() =>
      expect(location.history.at(-1)).toBe('/meal/new?photo=abc'),
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(prepareImage).toHaveBeenCalledOnce();
  });

  it('a network error is shown on the screen; «Try again» resends the same blob', async () => {
    const fetch = respond(() => {
      throw new TypeError('offline');
    }, created);
    const location = await setup();
    choose([photo]);
    await waitFor(() => expect(pending()).toBe('upload_failed'));
    fireEvent.click(screen.getByText('Retry upload'));
    await waitFor(() =>
      expect(location.history.at(-1)).toBe('/meal/new?photo=abc'),
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]![1]).toMatchObject({ body: jpeg });
    expect(prepareImage).toHaveBeenCalledOnce();
  });

  it('shows the drop overlay while files are dragged over nested elements', async () => {
    await setup();
    const files = { dataTransfer: { types: ['Files'], files: [] } };
    fireEvent.dragEnter(window, files);
    fireEvent.dragEnter(window, files); // entering a child
    fireEvent.dragLeave(window, files); // leaving the parent
    expect(screen.getByText('Drop to recognize')).toBeTruthy();
    fireEvent.dragLeave(window, files);
    expect(screen.queryByText('Drop to recognize')).toBeNull();
  });

  it('a dropped non-image opens dialog 3.8', async () => {
    vi.mocked(prepareImage).mockRejectedValue(new ImageDecodeError());
    respond();
    await setup();
    const pdf = new File(['%PDF'], 'menu.pdf', { type: 'application/pdf' });
    fireEvent.dragEnter(window, { dataTransfer: { types: ['Files'] } });
    fireEvent.drop(window, {
      dataTransfer: { types: ['Files'], files: [pdf] },
    });
    expect(screen.queryByText('Drop to recognize')).toBeNull();
    expect(
      await screen.findByRole('heading', { name: 'Couldn’t open the photo' }),
    ).toBeTruthy();
    expect(prepareImage).toHaveBeenCalledWith(pdf);
  });

  it('takes a pasted image but leaves a text paste alone', async () => {
    respond(created);
    const location = await setup();
    const text = createEvent.paste(window, { clipboardData: { files: [] } });
    fireEvent(window, text);
    expect(text.defaultPrevented).toBe(false);

    const image = createEvent.paste(window, {
      clipboardData: { files: [photo] },
    });
    fireEvent(window, image);
    expect(image.defaultPrevented).toBe(true);
    await waitFor(() =>
      expect(location.history.at(-1)).toBe('/meal/new?photo=abc'),
    );
  });
});
