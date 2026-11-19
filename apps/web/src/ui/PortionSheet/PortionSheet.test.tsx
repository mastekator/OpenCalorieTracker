import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { PILAF, SALAD } from '../../features/kitchen/fixtures';
import { PortionSheet, stepServings, todayAt } from './PortionSheet';

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const open = (props: Partial<Parameters<typeof PortionSheet>[0]> = {}) => {
  const onAdd = vi.fn();
  const result = renderLoaded(
    <I18nProvider>
      <PortionSheet
        open
        recipe={PILAF}
        onClose={() => {}}
        onAdd={onAdd}
        {...props}
      />
    </I18nProvider>,
  );
  return { onAdd, result };
};
const total = () => document.querySelector('.portion__total')!.textContent;

describe('stepServings', () => {
  it('steps by half a serving, to the next half from a typed weight', () => {
    expect(stepServings(350, 350, 1)).toBe(525);
    expect(stepServings(350, 350, -1)).toBe(175);
    expect(stepServings(200, 350, 1)).toBe(350);
    expect(stepServings(200, 350, -1)).toBe(175);
    // Rounded grams of an exact half are still that half.
    expect(stepServings(Math.round(1.5 * 333.33), 333.33, 1)).toBe(667);
  });

  it('stays within ½ serving and 5000 g', () => {
    expect(stepServings(175, 350, -1)).toBe(175);
    expect(stepServings(4900, 350, 1)).toBe(4900);
  });
});

describe('todayAt', () => {
  it('pulls a future time back to now', () => {
    const now = new Date(2026, 10, 19, 19, 40);
    expect(todayAt('12:05', now)).toEqual(new Date(2026, 10, 19, 12, 5));
    expect(todayAt('21:00', now)).toBe(now);
  });
});

describe('PortionSheet', () => {
  it('starts at one serving and scales kcal with the chips and the stepper', async () => {
    const { onAdd, result } = open();
    await result;
    expect(total()).toMatch(/^581.kcal · P 18 · F 28 · C 62 · 350.g$/);
    fireEvent.click(screen.getByRole('button', { name: '1½ serv.' }));
    expect(total()).toMatch(/^872.kcal .* 525.g$/);
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Half a serving more' }),
    );
    fireEvent.pointerUp(
      screen.getByRole('button', { name: 'Half a serving more' }),
    );
    expect(screen.getByText('2 serv.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Homemade pilaf',
        grams: 700,
        source: 'recipe',
        recipeId: 1,
      }),
      undefined,
    );
  });

  it('switches servings ↔ grams on the same weight', async () => {
    await open().result;
    fireEvent.click(screen.getByRole('radio', { name: 'Grams' }));
    const input = screen.getByRole('textbox', {
      name: 'Weight of Homemade pilaf',
    }) as HTMLInputElement;
    expect(input.value).toBe('350');
    fireEvent.change(input, { target: { value: '200' } });
    expect(total()).toMatch(/^332.kcal/);
    fireEvent.click(screen.getByRole('radio', { name: 'Servings' }));
    expect(screen.getByText('0.6 serv.')).toBeTruthy();
  });

  it('a recipe without servings: grams only, 100 g', async () => {
    const { onAdd, result } = open({ recipe: SALAD });
    await result;
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByRole('button', { name: '½ serv.' })).toBeNull();
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('100');
    expect(total()).toMatch(/^86.kcal/);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onAdd.mock.calls[0]![0]).toMatchObject({ grams: 100, recipeId: 2 });
  });

  it('from the card: meal by the hour and time, «Log to dinner»', async () => {
    const now = new Date(2026, 10, 19, 19, 40);
    const { onAdd, result } = open({ log: true, now });
    await result;
    // The tap clamps to the real clock: pin it to the sheet's evening.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 19, 19, 45));
    expect(screen.getByText(/^Today, 7:40.PM$/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Time'), {
      target: { value: '18:15' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Log to dinner' }));
    const when = onAdd.mock.calls[0]![1];
    expect(when.mealType).toBe('dinner');
    expect([when.at.getHours(), when.at.getMinutes()]).toEqual([18, 15]);
  });
});
