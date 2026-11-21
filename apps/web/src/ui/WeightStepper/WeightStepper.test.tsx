import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import type { DishUnit, Units } from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { WeightStepper } from './WeightStepper';

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function setup(
  grams: number | null,
  units: Units = 'metric',
  unit?: DishUnit,
) {
  const onChange = vi.fn();
  function Host() {
    const [g, setG] = useState(grams);
    return (
      <WeightStepper
        grams={g}
        units={units}
        unit={unit}
        label="Weight of Rice"
        onChange={(next) => {
          onChange(next);
          setG(next);
        }}
      />
    );
  }
  await renderLoaded(
    <I18nProvider>
      <Host />
    </I18nProvider>,
  );
  const input = screen.getByRole('textbox', { name: 'Weight of Rice' });
  return { onChange, input: input as HTMLInputElement };
}

describe('WeightStepper', () => {
  it('rejects empty, 0 and 5001 g but keeps the text (AC-3.4)', async () => {
    const { onChange, input } = await setup(150);
    for (const text of ['', '0', '5001', 'abc']) {
      fireEvent.change(input, { target: { value: text } });
      expect(onChange).toHaveBeenLastCalledWith(null);
      expect(input.value).toBe(text);
      expect(input.getAttribute('aria-invalid')).toBe('true');
      screen.getByText('Weight from 1 to 5000 g');
    }
    fireEvent.change(input, { target: { value: '5000' } });
    expect(onChange).toHaveBeenLastCalledWith(5000);
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(screen.queryByText(/Weight from/)).toBeNull();
  });

  it('names only the current unit in the error', async () => {
    const { input } = await setup(150, 'us');
    fireEvent.change(input, { target: { value: '0' } });
    screen.getByText('Weight from 0.1 to 176.4 oz');
    expect(screen.queryByText(/ g/)).toBeNull();
  });

  it('steps by 10 g and disables − at 1 g', async () => {
    const { onChange, input } = await setup(15);
    const less = screen.getByRole('button', { name: '10 g less' });
    fireEvent.click(less, { detail: 0 });
    expect(onChange).toHaveBeenLastCalledWith(5);
    fireEvent.click(less, { detail: 0 });
    expect(onChange).toHaveBeenLastCalledWith(1);
    expect(input.value).toBe('1');
    expect((less as HTMLButtonElement).disabled).toBe(true);
  });

  it('repeats on long press: 400 ms, then every 100 ms', async () => {
    const { onChange, input } = await setup(100);
    vi.useFakeTimers();
    const more = screen.getByRole('button', { name: '10 g more' });
    fireEvent.pointerDown(more, { button: 0 });
    expect(input.value).toBe('110');
    act(() => vi.advanceTimersByTime(399));
    expect(input.value).toBe('110');
    act(() => vi.advanceTimersByTime(1 + 200));
    expect(input.value).toBe('140');
    fireEvent.pointerUp(more);
    act(() => vi.advanceTimersByTime(1000));
    expect(input.value).toBe('140');
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it('works in ounces: 0.5 oz step, 10 oz = 283.5 g (AC-3.15)', async () => {
    const { onChange, input } = await setup(100, 'us');
    expect(input.value).toBe('3.5');
    screen.getByText('oz');
    fireEvent.click(screen.getByRole('button', { name: '0.5 oz more' }), {
      detail: 0,
    });
    expect(input.value).toBe('4');
    expect(onChange).toHaveBeenLastCalledWith(113.4);
    fireEvent.change(input, { target: { value: '10' } });
    expect(onChange).toHaveBeenLastCalledWith(283.5);
    fireEvent.change(input, { target: { value: '176.4' } });
    expect(onChange).toHaveBeenLastCalledWith(5000);
    fireEvent.change(input, { target: { value: '176.5' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
    fireEvent.change(input, { target: { value: '0,1' } });
    expect(onChange).toHaveBeenLastCalledWith(2.8);
  });

  it('works in ml: 10 ml step, the volume error (ADR-0038 §4)', async () => {
    const { onChange, input } = await setup(500, 'metric', 'ml');
    expect(input.value).toBe('500');
    screen.getByText('ml');
    fireEvent.click(screen.getByRole('button', { name: '10 ml more' }), {
      detail: 0,
    });
    expect(onChange).toHaveBeenLastCalledWith(510);
    fireEvent.change(input, { target: { value: '5001' } });
    screen.getByText('Volume 1–5,000 ml');
  });

  it('works in fl oz: 500 ml = 16.9 fl oz, typed fl oz go to ml without drift', async () => {
    const { onChange, input } = await setup(500, 'us', 'ml');
    expect(input.value).toBe('16.9');
    screen.getByText('fl oz');
    screen.getByRole('button', { name: '0.5 fl oz more' });
    fireEvent.change(input, { target: { value: '10' } });
    expect(onChange).toHaveBeenLastCalledWith(295.7);
    expect(input.value).toBe('10');
    fireEvent.change(input, { target: { value: '16.9' } });
    expect(onChange).toHaveBeenLastCalledWith(499.8);
    expect(input.value).toBe('16.9');
    fireEvent.change(input, { target: { value: '169.1' } });
    expect(onChange).toHaveBeenLastCalledWith(5000);
    fireEvent.change(input, { target: { value: '169.2' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
    screen.getByText('Volume 0.1–169 fl oz');
  });

  it('changes by a step with ↑/↓ in the field', async () => {
    const { onChange, input } = await setup(200);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith(210);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith(190);
  });
});
