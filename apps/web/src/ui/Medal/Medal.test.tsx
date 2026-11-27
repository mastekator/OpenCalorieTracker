import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AWARDS } from '@oct/shared';
import { en } from '../../i18n/locales/en';
import ru from '../../i18n/locales/ru';
import { ART } from './art';
import { Medal } from './Medal';

describe('Medal', () => {
  it('gives every medal on a screen its own gradient', () => {
    const { container } = render(
      <>
        <Medal awardKey="weeks_1" state="got" />
        <Medal awardKey="streak_2" state="got" />
      </>,
    );
    const ids = [...container.querySelectorAll('linearGradient')].map(
      (g) => g.id,
    );
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    container.querySelectorAll('svg').forEach((svg, i) => {
      expect(svg.querySelector('path')?.getAttribute('style')).toContain(
        `#${ids[i]}`,
      );
    });
  });

  it('hides a secret award’s glyph and number until it is earned', () => {
    const { container } = render(
      <Medal awardKey="secret_days_100_row" state="secret" />,
    );
    expect(container.querySelector('[data-glyph="secret"]')).not.toBeNull();
    expect(
      container.querySelector('[data-glyph="secret_days_100_row"]'),
    ).toBeNull();
    expect(container.querySelector('text')).toBeNull();
    expect(container.querySelector('linearGradient')).toBeNull();
  });

  it('draws a locked medal without metal, and names it when labelled', () => {
    const { container, getByRole } = render(
      <Medal awardKey="days_100" state="locked" label="100 days" />,
    );
    expect(container.querySelector('linearGradient')).toBeNull();
    expect(container.querySelector('[data-glyph="days_100"]')).not.toBeNull();
    expect(getByRole('img', { name: '100 days' })).toBeTruthy();
  });

  it('is decorative without a label', () => {
    const { container } = render(<Medal awardKey="photo_1" state="got" />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });

  it('has art and texts for every award in both complete languages', () => {
    for (const { key, category } of AWARDS) {
      expect(ART[key]).toBeDefined();
      for (const dict of [en, ru]) {
        const text = (dict.award as Record<string, Record<string, string>>)[
          key
        ];
        expect(text?.name, key).toBeTruthy();
        expect(text?.rule, key).toBeTruthy();
        if (category === 'secret') expect(text?.hint, key).toBeTruthy();
      }
    }
  });
});
