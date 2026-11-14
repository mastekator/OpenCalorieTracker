import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import {
  ANNOUNCE_DELAY_MS,
  TOAST_MS,
  ToastProvider,
  useToast,
  type ToastOptions,
} from './Toast';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

let show: (t: ToastOptions) => void;
function Grab() {
  show = useToast();
  return null;
}

const toast = (options: ToastOptions) =>
  act(() => {
    show(options);
    vi.advanceTimersByTime(0);
  });

describe('Toast', () => {
  it('keeps an empty live region mounted and hides itself after 3 s', () => {
    render(
      <ToastProvider>
        <Grab />
      </ToastProvider>,
    );
    const region = screen.getByRole('status');
    expect(region.textContent).toBe('');
    toast({ text: 'Unblocked' });
    expect(screen.getByRole('status').textContent).toBe('Unblocked');
    act(() => vi.advanceTimersByTime(TOAST_MS - 1));
    expect(screen.getByRole('status').textContent).toBe('Unblocked');
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('stays for `ms` when given', () => {
    render(
      <ToastProvider>
        <Grab />
      </ToastProvider>,
    );
    toast({ text: 'Undo me', ms: 5000 });
    act(() => vi.advanceTimersByTime(4999));
    expect(screen.getByRole('status').textContent).toBe('Undo me');
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('a new toast replaces the old one and restarts the timer', () => {
    render(
      <ToastProvider>
        <Grab />
      </ToastProvider>,
    );
    toast({ text: 'First' });
    act(() => vi.advanceTimersByTime(2000));
    toast({ text: 'Second' });
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole('status').textContent).toBe('Second');
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('runs the action and hides', () => {
    const undo = vi.fn();
    render(
      <ToastProvider>
        <Grab />
      </ToastProvider>,
    );
    toast({ text: 'Deleted', action: { label: 'Undo', onClick: undo } });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(undo).toHaveBeenCalledOnce();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('moves an empty live region into the open dialog before filling it', () => {
    render(
      <ToastProvider>
        <Grab />
        <dialog open data-testid="sheet" />
      </ToastProvider>,
    );
    const sheet = screen.getByTestId('sheet');
    toast({ text: 'Copied' });
    // The region is already in the dialog, still empty, when the text arrives.
    const region = sheet.querySelector('[role="status"]');
    expect(region).not.toBeNull();
    expect(region!.textContent).toBe('');
    act(() => vi.advanceTimersByTime(ANNOUNCE_DELAY_MS));
    expect(sheet.querySelector('[role="status"]')).toBe(region);
    expect(region!.textContent).toBe('Copied');
    // A second toast in the same dialog reuses the region right away.
    toast({ text: 'Again' });
    expect(region!.textContent).toBe('Again');
  });

  it('a newer toast cancels the pending text of the previous one', () => {
    render(
      <ToastProvider>
        <Grab />
        <dialog open data-testid="sheet" />
      </ToastProvider>,
    );
    toast({ text: 'First' });
    toast({ text: 'Second' });
    act(() => vi.advanceTimersByTime(ANNOUNCE_DELAY_MS));
    expect(screen.getByTestId('sheet').textContent).toBe('Second');
  });

  it('returns the region to <body> after hiding', () => {
    render(
      <ToastProvider>
        <Grab />
        <dialog open data-testid="sheet" />
      </ToastProvider>,
    );
    toast({ text: 'Copied' });
    act(() => vi.advanceTimersByTime(ANNOUNCE_DELAY_MS));
    act(() => vi.advanceTimersByTime(TOAST_MS));
    const sheet = screen.getByTestId('sheet');
    expect(sheet.querySelector('[role="status"]')).toBeNull();
    expect(screen.getByRole('status').parentElement).toBe(document.body);
  });

  it('clears pending timers on unmount', () => {
    const { unmount } = render(
      <ToastProvider>
        <Grab />
        <dialog open />
      </ToastProvider>,
    );
    toast({ text: 'Copied' });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
