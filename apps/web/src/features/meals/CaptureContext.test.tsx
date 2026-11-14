import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { ToastProvider } from '../../ui/Toast/Toast';
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
    </>
  );
}

async function setup() {
  const location = memoryLocation({ path: '/', record: true });
  render(
    <I18nProvider>
      <ToastProvider>
        <Router hook={location.hook}>
          <CaptureProvider>
            <p>Today</p>
            <Probe />
          </CaptureProvider>
        </Router>
      </ToastProvider>
    </I18nProvider>,
  );
  await screen.findByText('Today'); // the dictionary loads first
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
const created = () =>
  new Response('{"photoId":"abc"}', {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  vi.mocked(prepareImage).mockReset().mockResolvedValue(jpeg);
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

  it('«Add an entry for this day» carries the date; other ways in do not (AC-2.11)', async () => {
    respond();
    const location = await setup();
    fireEvent.click(screen.getByText('Add to day'));
    fireEvent.click(await screen.findByText('Enter manually'));
    expect(location.history.at(-1)).toBe('/meal/new?date=2026-11-10');
    fireEvent.click(screen.getByText('Direct manual'));
    expect(location.history.at(-1)).toBe('/meal/new');
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

  it('ignores another photo while one is being uploaded', async () => {
    let finish!: (r: Response) => void;
    const fetch = vi.fn(
      () => new Promise<Response>((resolve) => (finish = resolve)),
    );
    vi.stubGlobal('fetch', fetch);
    const location = await setup();
    choose([photo]);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    choose([photo]);
    fireEvent.drop(window, {
      dataTransfer: { types: ['Files'], files: [photo] },
    });
    await act(async () => finish(created()));
    await waitFor(() =>
      expect(location.history.at(-1)).toBe('/meal/new?photo=abc'),
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(prepareImage).toHaveBeenCalledOnce();
  });

  it('on a network error offers «Try again», which resends the same blob', async () => {
    const fetch = respond(() => {
      throw new TypeError('offline');
    }, created);
    const location = await setup();
    choose([photo]);
    expect(await screen.findByText('Couldn’t upload the photo')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
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
