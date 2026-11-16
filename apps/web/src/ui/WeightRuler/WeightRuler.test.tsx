import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { Units } from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { WeightRuler } from './WeightRuler';

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(cleanup);

async function setup(value: number, units: Units = 'metric') {
  const onChange = vi.fn();
  function Host() {
    const [v, setV] = useState(value);
    return (
      <WeightRuler
        value={v}
        units={units}
        label="Weight"
        onChange={(next) => {
          onChange(next);
          setV(next);
        }}
      />
    );
  }
  await renderLoaded(
    <I18nProvider>
      <Host />
    </I18nProvider>,
  );
  return { onChange, slider: screen.getByRole('slider', { name: 'Weight' }) };
}

describe('WeightRuler', () => {
  it('names the value with its unit', async () => {
    const { slider } = await setup(80.2);
    expect(slider.getAttribute('aria-valuetext')).toBe('80.2 kilograms');
    expect(slider.getAttribute('aria-valuenow')).toBe('80.2');
    expect(slider.getAttribute('aria-valuemin')).toBe('30');
    expect(slider.getAttribute('aria-valuemax')).toBe('300');
  });

  it('steps 0.1 with the arrow keys, without float drift', async () => {
    const { onChange, slider } = await setup(80.2);
    fireEvent.keyDown(slider, { key: 'ArrowUp' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith(80.4);
    fireEvent.keyDown(slider, { key: 'ArrowDown' });
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith(80.1);
    expect(slider.getAttribute('aria-valuetext')).toBe('80.1 kilograms');
  });

  it('steps 0.1 with the wheel and keeps the page still', async () => {
    const { onChange, slider } = await setup(80.2);
    const up = new WheelEvent('wheel', { deltaY: -40, cancelable: true });
    slider.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(80.3);
    fireEvent.wheel(slider, { deltaY: 40 });
    fireEvent.wheel(slider, { deltaY: 40 });
    expect(onChange).toHaveBeenLastCalledWith(80.1);
  });

  it('stops at the range ends', async () => {
    const { onChange, slider } = await setup(30);
    fireEvent.keyDown(slider, { key: 'ArrowDown' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('works in pounds', async () => {
    const { onChange, slider } = await setup(180, 'us');
    expect(slider.getAttribute('aria-valuetext')).toBe('180 pounds');
    expect(slider.getAttribute('aria-valuemin')).toBe('66.2');
    fireEvent.keyDown(slider, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith(180.1);
  });

  // jsdom has no layout: the ruler's centre is x = 0 and a tick is 10 px (the fallback).
  it('drags the scale and moves to a tapped tick', async () => {
    const { onChange, slider } = await setup(80.2);
    fireEvent.pointerDown(slider, { button: 0, clientX: 100 });
    fireEvent.pointerMove(slider, { clientX: 80 });
    fireEvent.pointerUp(slider, { clientX: 80 });
    expect(onChange).toHaveBeenLastCalledWith(80.4);
    fireEvent.pointerDown(slider, { button: 0, clientX: -30 });
    fireEvent.pointerUp(slider, { clientX: -30 });
    expect(onChange).toHaveBeenLastCalledWith(80.1);
  });

  it('labels every 0.5 around the value', async () => {
    await setup(80.2);
    for (const label of ['79', '79.5', '80', '80.5', '81'])
      screen.getByText(label);
    expect(screen.queryByText('80.2')).toBeNull();
  });
});
