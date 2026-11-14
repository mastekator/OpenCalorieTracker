import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Delayed } from './Skeleton';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Delayed', () => {
  it('shows nothing before 300 ms, then the children', () => {
    vi.useFakeTimers();
    render(<Delayed>loading</Delayed>);
    act(() => vi.advanceTimersByTime(299));
    expect(screen.queryByText('loading')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText('loading')).toBeTruthy();
  });
});
