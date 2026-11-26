import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { readDeviceAi, useDeviceAi } from './deviceAi';

function Probe({ userId }: { userId?: number }) {
  const [on, set] = useDeviceAi(userId);
  return (
    <button type="button" onClick={() => set(!on)}>
      {on ? 'on' : 'off'}
    </button>
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('useDeviceAi (ADR-0031 §6)', () => {
  it('stores the switch in localStorage per user and every reader sees it', () => {
    render(
      <>
        <Probe userId={7} />
        <Probe userId={7} />
      </>,
    );
    expect(screen.getAllByText('on')).toHaveLength(2);
    act(() => screen.getAllByRole('button')[0]!.click());
    expect(screen.getAllByText('off')).toHaveLength(2);
    expect(localStorage.getItem('oct.deviceAi.7')).toBe('0');
    expect(readDeviceAi(8)).toBe(true);

    cleanup();
    render(<Probe userId={7} />);
    expect(screen.getByText('off')).toBeTruthy();
    act(() => screen.getByRole('button').click());
    expect(localStorage.getItem('oct.deviceAi.7')).toBeNull();
  });

  it('another tab: the storage event updates the value', () => {
    render(<Probe userId={7} />);
    localStorage.setItem('oct.deviceAi.7', '0');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage'));
    });
    expect(screen.getByText('off')).toBeTruthy();
  });

  it('no user: on', () => {
    render(<Probe />);
    expect(screen.getByText('on')).toBeTruthy();
  });
});
