import { afterEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { PhotoViewer } from './PhotoViewer';

afterEach(cleanup);

const PREVIEW = '/api/photos/p1?size=preview';
const FULL = '/api/photos/p1?size=full';

function Harness({ full = FULL }: { full?: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <PhotoViewer
        open={open}
        onClose={() => setOpen(false)}
        preview={PREVIEW}
        full={full}
        title="Lunch, today 13:10"
        alt="Meal photo: Lunch, today 13:10"
      />
    </>
  );
}

async function open(full?: string | null) {
  render(
    <I18nProvider>
      <Harness full={full} />
    </I18nProvider>,
  );
  const opener = await screen.findByRole('button', { name: 'Open' });
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

const srcs = () =>
  [...document.querySelectorAll('.viewer img')].map((i) =>
    i.getAttribute('src'),
  );

describe('PhotoViewer', () => {
  it('shows the preview, then the full photo once it loads', async () => {
    await open();
    expect(srcs()).toEqual([PREVIEW, FULL]);
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe(
      'Loading the full photo',
    );
    fireEvent.load(document.querySelector('.viewer__full')!);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('img').getAttribute('src')).toBe(FULL);
  });

  it('keeps the preview with a note and «Try again» when the full photo fails', async () => {
    await open();
    fireEvent.error(document.querySelector('.viewer__full')!);
    expect(srcs()).toEqual([PREVIEW]);
    expect(screen.getByRole('alert').textContent).toContain(
      'The full photo didn’t load',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(srcs()).toEqual([PREVIEW, FULL]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('retries once by itself when back online', async () => {
    await open();
    fireEvent.error(document.querySelector('.viewer__full')!);
    fireEvent(window, new Event('online'));
    expect(srcs()).toEqual([PREVIEW, FULL]);
    fireEvent.error(document.querySelector('.viewer__full')!);
    fireEvent(window, new Event('online'));
    expect(srcs()).toEqual([PREVIEW]);
  });

  it('does not ask for a full photo the storage setting deleted', async () => {
    await open(null);
    expect(srcs()).toEqual([PREVIEW]);
    expect(screen.getByRole('note').textContent).toContain(
      'The full photo was deleted',
    );
  });

  it('focuses «×», closes on Esc and returns focus to the opener', async () => {
    const opener = await open();
    const close = screen.getByRole('button', { name: 'Close photo' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(document.querySelector('.viewer img')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('closes on a tap beside the photo, not on the photo', async () => {
    await open();
    fireEvent.click(document.querySelector('.viewer__full')!);
    expect(document.querySelector('.viewer img')).not.toBeNull();
    fireEvent.click(document.querySelector('.viewer__stage')!);
    expect(document.querySelector('.viewer img')).toBeNull();
  });
});
