import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { TOAST_MS, ToastProvider, useToast, type ToastOptions } from './Toast';

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

  it('shows inside the open modal dialog, which keeps the rest inert', () => {
    render(
      <ToastProvider>
        <Grab />
        <dialog open data-testid="sheet" />
      </ToastProvider>,
    );
    toast({ text: 'Copied' });
    expect(screen.getByTestId('sheet').textContent).toBe('Copied');
  });
});
