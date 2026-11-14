import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { ConfirmDialog } from './ConfirmDialog';

afterEach(cleanup);

function Harness({ onConfirm = vi.fn() }: { onConfirm?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Delete</button>
      <ConfirmDialog
        open={open}
        title="Delete passkey?"
        body="You won't be able to sign in with it anymore."
        confirmLabel="Delete"
        onConfirm={() => {
          onConfirm();
          setOpen(false);
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

const open = async () => {
  const opener = await screen.findByRole('button', { name: 'Delete' });
  opener.focus();
  fireEvent.click(opener);
  return opener;
};

describe('ConfirmDialog', () => {
  it('is an alertdialog with focus on Cancel and Tab trapped', async () => {
    render(<Harness />, { wrapper: I18nProvider });
    await open();
    const dialog = screen.getByRole('alertdialog', { name: 'Delete passkey?' });
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(document.activeElement).toBe(cancel);
    const confirm = within(dialog).getByRole('button', { name: 'Delete' });
    confirm.focus();
    fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);
  });

  it('Esc cancels and focus returns to the opener', async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />, { wrapper: I18nProvider });
    const opener = await open();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(opener);
  });

  it('confirm calls onConfirm; the scrim does nothing', async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />, { wrapper: I18nProvider });
    await open();
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(dialog);
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('Esc in a dialog nested in another closes only the inner one', async () => {
    const outer = vi.fn();
    render(
      <dialog open onKeyDown={outer}>
        <Harness />
      </dialog>,
      { wrapper: I18nProvider },
    );
    await open();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(outer).not.toHaveBeenCalled();
  });
});
