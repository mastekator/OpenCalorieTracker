import {
  addDays,
  remainingOf,
  sumDay,
  type Macros,
  type Meal,
} from '@oct/shared';
import { BookOpen, CircleAlert } from 'lucide-react';
import { useEffect, useRef, type PointerEvent } from 'react';
import { useT } from '../../i18n';
import { Button } from '../../ui/Button/Button';
import { List } from '../../ui/List/List';
import { MacroStat } from '../../ui/MacroStat/MacroStat';
import { ProgressBar } from '../../ui/ProgressBar/ProgressBar';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import { Delayed, Skeleton } from '../../ui/Skeleton/Skeleton';
import { DayPager } from './DayPager';
import { MealRow } from './MealRow';
import './DiaryDay.css';

type Props = {
  date: string;
  today: string;
  /** The day's meals, early to late; undefined while loading (6.12). */
  meals: Meal[] | undefined;
  /** Null without a norm: kcal and grams only. */
  norm: Macros | null;
  onDate: (date: string) => void;
  onOpen: (meal: Meal) => void;
  onDelete: (meal: Meal) => void;
  /** «Add an entry for this day» (AC-2.11). */
  onAdd: () => void;
};

/** A horizontal swipe longer than this turns the day. */
const SWIPE_PX = 60;
/** tan 30°: a steeper move is a scroll. */
const MAX_SLOPE = 0.577;

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
  norm,
  onDate,
  onOpen,
  onDelete,
  onAdd,
}: Props) {
  const { t } = useT();
  const start = useRef<{ x: number; y: number } | null>(null);
  const turn = (days: number) => {
    const next = addDays(date, days);
    if (next <= today) onDate(next);
  };
  const turnRef = useRef(turn);
  turnRef.current = turn;

  // Desktop D.2: ← / → turn the day, unless typing or a dialog is open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
        return;
      const target = event.target;
      if (
        (target instanceof Element &&
          target.closest('input, textarea, select, [contenteditable]')) ||
        document.querySelector('dialog[open]')
      )
        return;
      if (event.key === 'ArrowLeft') turnRef.current(-1);
      if (event.key === 'ArrowRight') turnRef.current(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const swipe = {
    onPointerDown: (event: PointerEvent) => {
      // A swipe on a meal row deletes it, not turns the day.
      const onRow = (event.target as Element).closest('.meal-row');
      start.current =
        event.pointerType === 'mouse' || onRow
          ? null
          : { x: event.clientX, y: event.clientY };
    },
    onPointerUp: (event: PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dx = event.clientX - s.x;
      const dy = event.clientY - s.y;
      if (Math.abs(dx) > SWIPE_PX && Math.abs(dy) < Math.abs(dx) * MAX_SLOPE)
        turn(dx > 0 ? -1 : 1);
    },
    onPointerCancel: () => (start.current = null),
  };

  const isToday = date === today;
  const add = t(isToday ? 'diary.add' : 'diary.add_here');
  return (
    <div className="diary" {...swipe}>
      <div className="diary__bar">
        <DayPager date={date} today={today} onChange={onDate} />
        {!isToday && (
          <Button variant="plain" small onClick={() => onDate(today)}>
            {t('diary.today_btn')}
          </Button>
        )}
      </div>
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
            <DayTotal eaten={sumDay(meals)} norm={norm} />
          </div>
          <div className="diary__list">
            {meals.length ? (
              <List title={t('diary.count', { count: meals.length })}>
                {meals.map((meal) => (
                  <MealRow
                    key={meal.clientId}
                    meal={meal}
                    onOpen={() => onOpen(meal)}
                    onDelete={() => onDelete(meal)}
                  />
                ))}
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
          {meals.length > 0 && (
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

/** «1 960 of 2 100 kcal · 140 left», the bar and three macros; without a norm only what was eaten. */
function DayTotal({ eaten, norm }: { eaten: Macros; norm: Macros | null }) {
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
    </section>
  );
}
