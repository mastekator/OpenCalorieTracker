import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { remainingOf, type Macros } from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { RemainingCard } from './RemainingCard';

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(cleanup);

const NORM: Macros = { kcal: 2100, proteinG: 120, fatG: 70, carbsG: 240 };
const eaten = (kcal: number): Macros => ({
  kcal,
  proteinG: 68,
  fatG: 82,
  carbsG: 141,
});

const show = (e: Macros, norm: Macros | null = NORM) =>
  render(
    <I18nProvider>
      <RemainingCard
        eaten={e}
        norm={norm}
        remaining={norm && remainingOf(norm, e)}
        weekRemainingKcal={norm ? 7270 : undefined}
      />
    </I18nProvider>,
  );

const card = () => screen.findByRole('region');

describe('RemainingCard', () => {
  it('shows an overrun as text and an icon, not only colour (AC-1.4)', async () => {
    show(eaten(2240));
    const text = (await card()).textContent;
    expect(text).toContain('Over140kcal');
    expect(document.querySelector('.remaining__label svg')).not.toBeNull();
    // Each macro on its own: fat over, protein left (AC-1.5).
    expect(text).toContain('12\u00a0g over');
    expect(text).toContain('52\u00a0g left');
  });

  it('shows «0 kcal left» at exactly the norm (E-1.1)', async () => {
    show(eaten(2100));
    expect((await card()).textContent).toContain('Left0kcal');
    expect(screen.queryByText('Over')).toBeNull();
  });

  it('rounds only when showing (AC-0.3)', async () => {
    show(eaten(1239.6));
    const text = (await card()).textContent;
    expect(text).toContain('Left860kcal');
    expect(text).toContain('1,240 of 2,100 kcal');
  });

  it('a 0.4 kcal overrun rounds to «0 kcal left», not «Over 0»', async () => {
    show(eaten(2100.4));
    expect((await card()).textContent).toContain('Left0kcal');
  });

  it('without a norm: eaten today, grams only, no bars, no week line', async () => {
    show(eaten(1239.6), null);
    const text = (await card()).textContent;
    expect(text).toContain('Eaten today1,240kcal');
    expect(screen.queryAllByRole('meter')).toHaveLength(0);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('links the week line to /week', async () => {
    show(eaten(1240));
    const link = await screen.findByRole('link');
    expect(link.getAttribute('href')).toBe('/week');
    expect(link.textContent).toBe('7,270 kcal left this week');
  });
});
