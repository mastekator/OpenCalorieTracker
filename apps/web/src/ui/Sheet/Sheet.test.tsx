import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { Sheet } from './Sheet';

afterEach(cleanup);

function Harness({ onClose = vi.fn() }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Sheet
        open={open}
        title="Forgot your password?"
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        footer={<button>Done</button>}
      >
        <input aria-label="Name" />
      </Sheet>
    </>
  );
}

const open = async () => {
  const opener = await screen.findByRole('button', { name: 'Open' });
  opener.focus();
  fireEvent.click(opener);
  return opener;
};

describe('Sheet', () => {
  it('focuses the title and traps Tab at both ends', async () => {
    render(<Harness />, { wrapper: I18nProvider });
    await open();
    const title = screen.getByRole('heading', {
      name: 'Forgot your password?',
    });
    const close = screen.getByRole('button', { name: 'Close' });
    const done = screen.getByRole('button', { name: 'Done' });
    expect(document.activeElement).toBe(title);

    fireEvent.keyDown(title, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(done);
    fireEvent.keyDown(done, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
  });

  it('is labelled by its title', async () => {
    render(<Harness />, { wrapper: I18nProvider });
    await open();
    expect(
      screen.getByRole('dialog', { name: 'Forgot your password?' }),
    ).toBeTruthy();
  });

  it.each([
    [
      'Esc',
      () => fireEvent.keyDown(document.activeElement!, { key: 'Escape' }),
    ],
    [
      'close button',
      () => fireEvent.click(screen.getByRole('button', { name: 'Close' })),
    ],
    ['scrim', () => fireEvent.click(screen.getByRole('dialog'))],
  ])('%s asks onClose and focus returns to the opener', async (_, act) => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />, { wrapper: I18nProvider });
    const opener = await open();
    act();
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('returns focus to a pressed opener that never got focus (Safari)', async () => {
    render(<Harness />, { wrapper: I18nProvider });
    const opener = await screen.findByRole('button', { name: 'Open' });
    (document.activeElement as HTMLElement).blur();
    fireEvent.pointerDown(opener);
    fireEvent.click(opener);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(document.activeElement).toBe(opener);
  });

  it('a click inside the content does not close', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />, { wrapper: I18nProvider });
    await open();
    fireEvent.click(screen.getByRole('textbox'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on a swipe down past the threshold only', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />, { wrapper: I18nProvider });
    await open();
    const grab = document.querySelector('.sheet__grab')!;
    // jsdom has no pointer capture
    Element.prototype.setPointerCapture ??= () => {};
    fireEvent.pointerDown(grab, { clientY: 100 });
    fireEvent.pointerUp(grab, { clientY: 160 });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(grab, { clientY: 100 });
    fireEvent.pointerUp(grab, { clientY: 200 });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
