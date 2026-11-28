import type { ReactNode } from 'react';
import {
  addDays,
  remainingOf,
  sumDay,
  type DrinkEntry,
  waterOfDay,
  type Macros,
  type Meal,
  type Units,
} from '@oct/shared';
import { BookOpen, ChevronRight, CircleAlert, Droplet } from 'lucide-react';
import { useT } from '../../i18n';
import { Button } from '../../ui/Button/Button';
import { List } from '../../ui/List/List';
import { MacroStat } from '../../ui/MacroStat/MacroStat';
import { ProgressBar } from '../../ui/ProgressBar/ProgressBar';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import { Delayed, Skeleton } from '../../ui/Skeleton/Skeleton';
import { DrinksMealRow, kcalDrinks } from '../water/DrinksMealRow';
import { useVolume } from '../water/format';
import { DayPager } from './DayPager';
import { MealRow } from './MealRow';
import { usePager } from './usePager';
import './DiaryDay.css';

type Props = {
  date: string;
  today: string;
  /** The day's meals, early to late; undefined while loading (6.12). */
  meals: Meal[] | undefined;
  /** The day's drink entries: their kcal are in the total even with the water module off. */
  drinks?: DrinkEntry[];
  /** Null without a norm: kcal and grams only. */
  norm: Macros | null;
  onDate: (date: string) => void;
  onOpen: (meal: Meal) => void;
  onDelete: (meal: Meal) => void;
  /** «Add an entry for this day» (AC-2.11). */
  onAdd: () => void;
  /** Water module on: «Water: X of Y» under the total and a «Drinks» row (OCT-147 4.3–4.4). */
  water?: { goalMl: number; onOpen: () => void };
  units?: Units;
};

const MACROS = [
  ['protein', 'proteinG'],
  ['fat', 'fatG'],
  ['carbs', 'carbsG'],
] as const;

/** Diary screen 6: day pager, the day's total, its meals and «Add an entry» (OCT-19 §3, D.2). */
export function DiaryDay({
  date,
  today,
  meals,
  drinks = [],
  norm,
  onDate,
  onOpen,
  onDelete,
  onAdd,
  water,
  units = 'metric',
}: Props) {
  const { t } = useT();
  // A swipe on a meal row deletes it, not turns the day.
  const swipe = usePager((step) => {
    const next = addDays(date, step);
    if (next <= today) onDate(next);
  }, '.meal-row');

  const add = t(date === today ? 'diary.add' : 'diary.add_here');
  const drinkRow = water ? kcalDrinks(drinks) : [];
  return (
    <div className="diary" {...swipe}>
      <DayPager date={date} today={today} onChange={onDate} />
      {meals === undefined ? (
        <Delayed>
          <div className="diary__body">
            <div className="diary__total">
              <Skeleton height="calc(var(--space-12) * 3)" />
            </div>
            <div className="diary__list">
              <Skeleton height="calc(var(--control-height) * 2)" />
            </div>
          </div>
        </Delayed>
      ) : (
        <div className="diary__body">
          <div className="diary__total">
            <DayTotal eaten={sumDay([...meals, ...drinks])} norm={norm}>
              {water && (
                <WaterLine
                  ml={waterOfDay(drinks)}
                  goalMl={water.goalMl}
                  units={units}
                  onOpen={water.onOpen}
                />
              )}
            </DayTotal>
          </div>
          <div className="diary__list">
            {meals.length || drinkRow.length ? (
              <List title={t('diary.count', { count: meals.length })}>
                {withDrinks(
                  meals.map((meal) => (
                    <MealRow
                      key={meal.clientId}
                      meal={meal}
                      onOpen={() => onOpen(meal)}
                      onDelete={() => onDelete(meal)}
                    />
                  )),
                  meals,
                  drinkRow,
                  units,
                )}
              </List>
            ) : (
              <ScreenState
                icon={<BookOpen />}
                title={t('diary.empty.title')}
                action={<Button onClick={onAdd}>{add}</Button>}
              >
                {t('diary.empty.body')}
              </ScreenState>
            )}
          </div>
          {(meals.length > 0 || drinkRow.length > 0) && (
            <div className="diary__add">
              <Button variant="tonal" onClick={onAdd}>
                {add}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The «Drinks» row among the meals (early to late) by the time of the last drink. */
function withDrinks(
  rows: ReactNode[],
  meals: Meal[],
  drinks: DrinkEntry[],
  units: Units,
) {
  if (!drinks.length) return rows;
  const last = Date.parse(drinks[0]!.takenAt);
  const at = meals.filter((m) => Date.parse(m.eatenAt) <= last).length;
  const out = [...rows];
  out.splice(
    at,
    0,
    <DrinksMealRow key="drinks" entries={drinks} units={units} />,
  );
  return out;
}

/** «Water: 1 500 of 2 000 ml» under the total; opens the day's entries (OCT-147 4.4). */
function WaterLine({
  ml,
  goalMl,
  units,
  onOpen,
}: {
  ml: number;
  goalMl: number;
  units: Units;
  onOpen: () => void;
}) {
  const { t } = useT();
  const volume = useVolume(units);
  return (
    <button type="button" className="day-total__water" onClick={onOpen}>
      <Droplet aria-hidden="true" />
      <span>
        {t('water.diary_line', { ml: volume(ml), goal: volume(goalMl) })}
      </span>
      <ChevronRight aria-hidden="true" />
    </button>
  );
}

/** «1 960 of 2 100 kcal · 140 left», the bar and three macros; without a norm only what was eaten. */
function DayTotal({
  eaten,
  norm,
  children,
}: {
  eaten: Macros;
  norm: Macros | null;
  children?: ReactNode;
}) {
  const { t, num } = useT();
  const remaining = norm && remainingOf(norm, eaten);
  // Decided on the shown (rounded) number, as on Today (E-1.1).
  const left = remaining && Math.round(remaining.kcal);
  const over = left !== null && left < 0;
  return (
    <section className="day-total" aria-label={t('today.summary')}>
      <div className="day-total__head">
        <span className="day-total__eaten">
          {norm
            ? t('today.eaten_of', {
                eaten: num(eaten.kcal),
                norm: num(norm.kcal),
              })
            : t('meal.kcal', { n: num(eaten.kcal) })}
        </span>
        {left !== null && (
          <span
            className={`day-total__rest${over ? ' day-total__rest--over' : ''}`}
          >
            {over && <CircleAlert aria-hidden="true" />}
            {t(over ? 'diary.over' : 'diary.left', { n: num(Math.abs(left)) })}
          </span>
        )}
      </div>
      {norm && (
        <ProgressBar
          value={eaten.kcal}
          max={norm.kcal}
          label={t('today.kcal')}
          valueText={t('today.eaten_of', {
            eaten: num(eaten.kcal),
            norm: num(norm.kcal),
          })}
        />
      )}
      <div className="day-total__macros">
        {MACROS.map(([macro, key]) => (
          <MacroStat
            key={macro}
            macro={macro}
            value={eaten[key]}
            norm={norm ? norm[key] : null}
            remaining={remaining ? remaining[key] : null}
          />
        ))}
      </div>
      {children}
    </section>
  );
}
