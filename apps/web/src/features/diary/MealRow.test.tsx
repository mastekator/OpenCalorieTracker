import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Meal } from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { MealRow } from './MealRow';

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(cleanup);

const meal = (over: Partial<Meal> = {}) =>
  ({
    id: 1,
    eatenAt: '2026-11-13T10:24:00Z',
    tzOffsetMin: 180,
    localDate: '2026-11-13',
    mealType: 'lunch',
    photo: { id: 'p1', full: true },
    items: [{ name: 'Buckwheat' }, { name: 'Chicken' }],
    kcal: 716.6,
    ...over,
  }) as Meal;

const show = (m: Meal, onDelete?: () => void) =>
  render(
    <I18nProvider>
      <ul>
        <MealRow meal={m} onOpen={() => {}} onDelete={onDelete} />
      </ul>
    </I18nProvider>,
  );

describe('MealRow', () => {
  it('shows the preview photo, local time, dishes and rounded kcal', async () => {
    show(meal());
    const row = await screen.findByRole('button');
    expect(row.textContent).toBe('Lunch1:24 PMBuckwheat, Chicken717 kcal');
    expect(row.querySelector('img')?.getAttribute('src')).toBe(
      '/api/photos/p1?size=preview',
    );
    expect(screen.queryByText('late')).toBeNull();
    fireEvent.error(row.querySelector('img')!);
    expect(row.querySelector('img')).toBeNull();
  });

  it('shows an icon without a photo and the late badge after midnight', async () => {
    show(
      meal({
        photo: null,
        mealType: 'snack',
        eatenAt: '2026-11-12T21:35:00Z',
        localDate: '2026-11-12',
      }),
    );
    expect(await screen.findByText('late')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });

  it('has a labelled trash button only with onDelete', async () => {
    const onDelete = vi.fn();
    show(meal(), onDelete);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Delete Lunch' }),
    );
    expect(onDelete).toHaveBeenCalledOnce();
    cleanup();
    show(meal());
    expect(await screen.findAllByRole('button')).toHaveLength(1);
  });

  describe('swipe (phone)', () => {
    // jsdom has no layout: a 375 row and a 96 «Delete».
    beforeEach(() =>
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
        configurable: true,
        get(this: HTMLElement) {
          return this.tagName === 'LI' ? 375 : 96;
        },
      }),
    );
    afterEach(() => {
      delete (HTMLElement.prototype as { offsetWidth?: number }).offsetWidth;
    });

    const swipe = (row: Element, dx: number, dy = 0) => {
      const at = (x: number, y: number) => ({
        pointerType: 'touch',
        clientX: x,
        clientY: y,
      });
      fireEvent.pointerDown(row, at(300, 100));
      fireEvent.pointerMove(row, at(300 + dx / 2, 100 + dy / 2));
      fireEvent.pointerMove(row, at(300 + dx, 100 + dy));
      fireEvent.pointerUp(row, at(300 + dx, 100 + dy));
    };
    const offset = (row: HTMLElement) =>
      row.style.getPropertyValue('--swipe-offset');

    it('a full swipe deletes at once', async () => {
      const onDelete = vi.fn();
      show(meal(), onDelete);
      const row = (await screen.findByRole('listitem')) as HTMLElement;
      swipe(row, -250);
      expect(onDelete).toHaveBeenCalledOnce();
      expect(offset(row)).toBe('0px');
    });

    it('a short swipe reveals «Delete»; a tap on the row closes it without opening', async () => {
      const onDelete = vi.fn();
      const onOpen = vi.fn();
      render(
        <I18nProvider>
          <ul>
            <MealRow meal={meal()} onOpen={onOpen} onDelete={onDelete} />
          </ul>
        </I18nProvider>,
      );
      const row = (await screen.findByRole('listitem')) as HTMLElement;
      swipe(row, -70);
      expect(offset(row)).toBe('-96px');
      expect(onDelete).not.toHaveBeenCalled();
      fireEvent.click(screen.getByText('Lunch')); // the click ending the swipe
      fireEvent.click(screen.getByText('Lunch'));
      expect(onOpen).not.toHaveBeenCalled();
      expect(offset(row)).toBe('0px');
      fireEvent.click(screen.getByText('Lunch'));
      expect(onOpen).toHaveBeenCalledOnce();
    });

    it('a mostly vertical move is a scroll', async () => {
      const onDelete = vi.fn();
      show(meal(), onDelete);
      const row = (await screen.findByRole('listitem')) as HTMLElement;
      swipe(row, -250, 200);
      expect(onDelete).not.toHaveBeenCalled();
      expect(offset(row)).toBe('0px');
    });
  });
});
