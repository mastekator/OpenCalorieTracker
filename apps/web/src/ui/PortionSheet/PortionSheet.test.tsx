import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { en } from '../../i18n/locales/en';
import ru from '../../i18n/locales/ru';
import { translate } from '../../i18n/translate';
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
const total = () => document.querySelector('.portion__total p')!.textContent;
const macros = () => document.querySelector('.portion__macros')!.textContent;

describe('portion.count', () => {
  it.each([
    ['en', 0.5, '½', '½ servings'],
    ['en', 1, '1', '1 serving'],
    ['en', 1.5, '1½', '1½ servings'],
    ['en', 2, '2', '2 servings'],
    ['en', 5, '5', '5 servings'],
    ['ru', 0.5, '½', '½ порции'],
    ['ru', 1, '1', '1 порция'],
    ['ru', 1.5, '1½', '1½ порции'],
    ['ru', 2, '2', '2 порции'],
    ['ru', 5, '5', '5 порций'],
  ] as const)('%s %d: «%s»', (locale, count, n, label) => {
    const dict = locale === 'en' ? en : ru;
    expect(translate(locale, dict, 'portion.count', { n, count })).toBe(label);
  });
});

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
    expect(total()).toMatch(/^581.kcal · 350.g$/);
    expect(macros()).toMatch(/^P 18.gF 28.gC 62.g$/);
    expect(
      document.querySelectorAll('.portion__macros .macro__dot'),
    ).toHaveLength(3);
    // The recipe photo in the sheet.
    expect(document.querySelector('.portion__total img')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '1½ servings' }));
    expect(total()).toMatch(/^872.kcal · 525.g$/);
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Half a serving more' }),
    );
    fireEvent.pointerUp(
      screen.getByRole('button', { name: 'Half a serving more' }),
    );
    expect(screen.getByText('2 servings')).toBeTruthy();
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
    expect(screen.getByText('0.6 servings')).toBeTruthy();
  });

  it('in ounces: shows and takes ounces, adds grams (AC-2.6)', async () => {
    const { onAdd, result } = open({ units: 'us' });
    await result;
    expect(total()).toMatch(/ 12\.3.oz$/);
    fireEvent.click(screen.getByRole('radio', { name: 'Ounces' }));
    const input = screen.getByRole('textbox', {
      name: 'Weight of Homemade pilaf',
    }) as HTMLInputElement;
    expect(input.value).toBe('12.3');
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onAdd.mock.calls[0]![0].grams).toBeCloseTo(283.5, 0);
  });

  it('a recipe without servings: grams only, 100 g', async () => {
    const { onAdd, result } = open({ recipe: SALAD });
    await result;
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByRole('button', { name: '½ servings' })).toBeNull();
    // No photo: the illustration instead.
    expect(document.querySelector('.portion__total img')).toBeNull();
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
