import type { Meal } from '@oct/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { ConflictSheet } from './ConflictSheet';

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(cleanup);

const meal = (over: Partial<Meal>): Meal => ({
  id: 5,
  clientId: '00000000-0000-4000-8000-000000000005',
  eatenAt: '2026-11-12T19:30:00Z',
  tzOffsetMin: 0,
  localDate: '2026-11-12',
  mealType: 'dinner',
  photo: null,
  recalcOffer: false,
  items: [],
  kcal: 0,
  proteinG: 0,
  fatG: 0,
  carbsG: 0,
  editRev: 4,
  editedAt: 0,
  ...over,
});

describe('ConflictSheet', () => {
  it('names the photo row and falls back to the illustration when the preview fails', async () => {
    render(
      <I18nProvider>
        <ConflictSheet
          mine={meal({})}
          theirs={meal({ photo: { id: 'p1', full: true } })}
          units="metric"
          onKeep={() => {}}
          onClose={() => {}}
        />
      </I18nProvider>,
    );
    const img = await screen.findByAltText('yes');
    expect(img.tagName).toBe('IMG');
    expect(screen.getByText('none')).toBeTruthy();
    fireEvent.error(img);
    expect(screen.getByLabelText('yes').tagName).toBe('SPAN');
  });

  it('deleted there: mine whole, restore keeps this side, delete the other', async () => {
    const onKeep = vi.fn();
    render(
      <I18nProvider>
        <ConflictSheet
          mine={meal({
            kcal: 320,
            items: [
              {
                name: 'Buckwheat',
                grams: 250,
                unit: 'g',
                kcal: 320,
              } as Meal['items'][number],
            ],
          })}
          deletedAt={0}
          units="metric"
          onKeep={onKeep}
          onClose={() => {}}
        />
      </I18nProvider>,
    );
    await screen.findByText(/deleted on another device/);
    screen.getByText('Buckwheat');
    screen.getByText('Entry deleted');
    fireEvent.click(screen.getByRole('button', { name: 'Restore my version' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete entry' }));
    expect(onKeep.mock.calls).toEqual([['this'], ['other']]);
  });
});
