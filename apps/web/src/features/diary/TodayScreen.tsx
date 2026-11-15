import { useEffect, useState } from 'react';
import { ImagePlus, Pencil, Utensils } from 'lucide-react';
import { useLocation } from 'wouter';
import {
  addDays,
  remainingOf,
  sumDay,
  summarize,
  weekOf,
  type Macros,
  type Meal,
} from '@oct/shared';
import { useNorm, usePeriod } from '../../data/DataContext';
import { useT } from '../../i18n';
import { Button } from '../../ui/Button/Button';
import { List } from '../../ui/List/List';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import { Delayed, Skeleton } from '../../ui/Skeleton/Skeleton';
import { useCapture } from '../meals/CaptureContext';
import { DropZone } from '../meals/DropZone';
import { MealRow } from './MealRow';
import { NormInvite } from './NormInvite';
import { RemainingCard } from './RemainingCard';
import { useToday } from './useToday';
import './TodayScreen.css';

/** Where a meal opens for editing (screen 4). */
export const mealPath = (clientId: string) =>
  `/meal/${encodeURIComponent(clientId)}`;

/** `history.state` after saving a meal: Today flashes that row (OCT-16 A.6). */
export type TodayState = { saved?: string };

type ViewProps = {
  /** `YYYY-MM-DD`, shown as «Saturday, November 14». */
  today: string;
  /** Today's meals in any order; undefined while the local copy loads. */
  meals: Meal[] | undefined;
  /** Null: no norm set; undefined: loading. */
  norm: Macros | null | undefined;
  /** kcal left for the week, negative is over; only with a norm. */
  weekRemainingKcal?: number;
  /** clientId of a meal just saved. */
  highlight?: string;
  onOpen: (meal: Meal) => void;
  onSetNorm: () => void;
};

const newestFirst = (a: Meal, b: Meal) => b.eatenAt.localeCompare(a.eatenAt);

/** Screen 2 «Today» (OCT-19 §2, D.1), states 2.1–2.7. */
export function TodayView({
  today,
  meals,
  norm,
  weekRemainingKcal,
  highlight,
  onOpen,
  onSetNorm,
}: ViewProps) {
  const { t, locale } = useT();
  const capture = useCapture();
  const date = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${today}T00:00:00Z`));
  const loading = meals === undefined || norm === undefined;

  // 2.6: the card above the capture buttons, rows below them, so the buttons don't move.
  let summary;
  if (loading)
    summary = (
      <Delayed>
        <Skeleton
          height="calc(var(--space-12) * 5)"
          radius="var(--radius-lg)"
        />
      </Delayed>
    );
  else {
    const eaten = sumDay(meals);
    summary = (
      <>
        {norm === null && <NormInvite onSet={onSetNorm} />}
        <RemainingCard
          eaten={eaten}
          norm={norm}
          remaining={norm && remainingOf(norm, eaten)}
          weekRemainingKcal={norm ? weekRemainingKcal : undefined}
        />
      </>
    );
  }

  let list;
  if (loading)
    list = (
      <Delayed>
        <div className="today__skeleton">
          <Skeleton height="calc(var(--space-12) + var(--space-4))" />
          <Skeleton height="calc(var(--space-12) + var(--space-4))" />
        </div>
      </Delayed>
    );
  else if (meals?.length)
    list = (
      <List title={t('today.meals')}>
        {[...meals].sort(newestFirst).map((meal) => (
          <MealRow
            key={meal.clientId}
            meal={meal}
            onOpen={() => onOpen(meal)}
            highlight={meal.clientId === highlight}
          />
        ))}
      </List>
    );
  else
    list = (
      <div className="today__empty">
        <ScreenState icon={<Utensils />} title={t('today.empty.title')}>
          {t('today.empty.body')}
        </ScreenState>
      </div>
    );

  return (
    <div className="today">
      <div className="today__main">
        <p className="today__date">{date}</p>
        {summary}
        <div className="today__capture">
          <Button variant="tonal" onClick={capture.pick}>
            <ImagePlus aria-hidden="true" />
            {t('capture.gallery')}
          </Button>
          <Button variant="tonal" onClick={capture.manual}>
            <Pencil aria-hidden="true" />
            {t('capture.manual')}
          </Button>
        </div>
        {list}
      </div>
      <div className="today__side">
        <DropZone />
      </div>
    </div>
  );
}

/** Today from the local copy (ADR-0011, ADR-0014 §5). */
export function TodayScreen() {
  const today = useToday();
  const week = weekOf(today);
  const weekMeals = usePeriod(week.from, week.to);
  // The week is counted against today's norm (summarize takes one).
  const norm = useNorm(today);
  const [, navigate] = useLocation();
  // Read once: a reload or coming back later doesn't flash again.
  const [highlight] = useState(
    () => (history.state as TodayState | null)?.saved,
  );
  useEffect(() => {
    if (highlight) history.replaceState(null, '');
  }, [highlight]);

  let weekRemainingKcal;
  if (weekMeals && norm) {
    const days = [];
    for (let d = week.from; d <= week.to; d = addDays(d, 1)) {
      const dayMeals = weekMeals.filter((m) => m.localDate === d);
      days.push({ date: d, ...sumDay(dayMeals), meals: dayMeals.length });
    }
    weekRemainingKcal = summarize(days, norm, today).remaining?.kcal;
  }

  return (
    <TodayView
      today={today}
      meals={weekMeals?.filter((m) => m.localDate === today)}
      norm={norm}
      weekRemainingKcal={weekRemainingKcal}
      highlight={highlight}
      onOpen={(meal) => navigate(mealPath(meal.clientId))}
      onSetNorm={() => navigate('/profile')}
    />
  );
}
