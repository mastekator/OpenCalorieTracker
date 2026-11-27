import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { DrinkEntry, Units } from '@oct/shared';
import { useT } from '../../i18n';
import { DishIllustration } from '../../ui/DishIllustration/DishIllustration';
import { useVolume } from './format';
import '../diary/MealRow.css';
import './DrinksMealRow.css';

/** Drinks with kcal go into the day list as one row; 0 kcal ones stay in the water entries (OCT-147 4.3). */
export const kcalDrinks = (entries: readonly DrinkEntry[]) =>
  entries
    .filter((e) => !e.deleted && e.kcal > 0)
    .sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt));

type Props = {
  /** `kcalDrinks` of the day, newest first; not empty. */
  entries: readonly DrinkEntry[];
  units: Units;
};

/** «Drinks · until HH:MM · N kcal» among the meals; opens in place (AC-3.5). */
export function DrinksMealRow({ entries, units }: Props) {
  const { t, num, locale } = useT();
  const volume = useVolume(units);
  const [open, setOpen] = useState(false);
  const time = (e: DrinkEntry) =>
    new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(
      new Date(e.takenAt),
    );
  const name = (e: DrinkEntry) =>
    e.name ?? t(`drinks.${e.drinkKey}` as 'drinks.water');
  const last = entries[0]!;
  const kcal = entries.reduce((s, e) => s + e.kcal, 0);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <li className="list__item">
      <button
        type="button"
        className="list-row list-row--interactive meal-row__open drinks-row"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <DishIllustration
          id={last.illustration}
          size="var(--meal-thumb-size)"
        />
        <span className="meal-row__main">
          <span className="meal-row__title">
            {t('water.drinks')}
            <span className="meal-row__time">
              {t('water.until', { time: time(last) })}
            </span>
          </span>
          <span className="meal-row__dishes">
            {[...new Set(entries.map(name))].join(', ')}
          </span>
        </span>
        <span className="meal-row__kcal drinks-row__kcal">
          {t('meal.kcal', { n: num(kcal) })}
          <Chevron aria-hidden="true" />
        </span>
      </button>
      {open && (
        <ul className="drinks-row__entries">
          {entries.map((e) => (
            <li key={e.clientId} className="drinks-row__entry">
              <span className="drinks-row__time">{time(e)}</span>
              {/* A long name shortens, the amount stays whole. */}
              <span className="drinks-row__what">
                <span className="drinks-row__name">{name(e)}</span>
                <span className="drinks-row__amount">
                  {'·\u00a0'}
                  {volume(e.ml)}
                </span>
              </span>
              <span>{t('meal.kcal', { n: num(e.kcal) })}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
