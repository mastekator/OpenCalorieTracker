import {
  daysBetween,
  summarize,
  type DayTotals,
  type Macros,
} from '@oct/shared';
import type { ReactNode } from 'react';
import { Redirect, useLocation } from 'wouter';
import {
  useDrinkEntries,
  useNorm,
  usePeriod,
  useStreaks,
} from '../../data/DataContext';
import { useT } from '../../i18n';
import { Segment } from '../../ui/Segment/Segment';
import { Delayed, Skeleton } from '../../ui/Skeleton/Skeleton';
import { DayPager } from '../diary/DayPager';
import { STREAKS_PATH, StreakRow } from '../streaks/StreakRow';
import { NormInvite } from '../diary/NormInvite';
import { usePager } from '../diary/usePager';
import { useToday } from '../diary/useToday';
import { KcalChart } from './KcalChart';
import { MacroAveragesCard } from './MacroAveragesCard';
import { WeekBudgetCard } from './WeekBudgetCard';
import {
  periodDays,
  periodOf,
  periodOfId,
  periodPath,
  stepPeriod,
  type PeriodMode,
} from './period';
import './WeekCards.css';
import './WeekScreen.css';

type ViewProps = {
  mode: PeriodMode;
  /** Any day of the shown period. */
  date: string;
  today: string;
  /** Every day of the period (`periodDays`); undefined while loading (7.8). */
  days: DayTotals[] | undefined;
  /** Today's norm; null: none set (7.5); undefined: loading. */
  norm: Macros | null | undefined;
  /** The first day of another period. */
  onPeriod: (date: string) => void;
  onMode: (mode: PeriodMode) => void;
  onOpenDay: (date: string) => void;
  onSetNorm: () => void;
  /** The streak row above the head (OCT-184 1.1); absent while off. */
  streak?: ReactNode;
};

/** Bar heights of the 7.8 skeleton, repeated over the period. */
const SKELETON_BARS = ['55%', '80%', '65%', '90%', '45%', '70%', '60%'];

type HeadProps = Pick<
  ViewProps,
  'mode' | 'date' | 'today' | 'onPeriod' | 'onMode'
>;

/**
 * «Week | Month» segment and the period pager. Rendered twice: under the title on the phone
 * (in WeekView) and right of it from 1024px (NavBar `aside`, D.3); CSS shows one of them.
 */
export function WeekHead({ mode, date, today, onPeriod, onMode }: HeadProps) {
  const { t } = useT();
  return (
    <div className="week__head">
      <Segment
        label={t('week.mode.label')}
        options={[
          { value: 'week', label: t('week.mode.week') },
          { value: 'month', label: t('week.mode.month') },
        ]}
        value={mode}
        onChange={onMode}
      />
      <DayPager mode={mode} date={date} today={today} onChange={onPeriod} />
    </div>
  );
}

/** Screen 7 «Week | Month» (OCT-19 §4, D.3): pager, kcal chart, budget, macro averages. */
export function WeekView({
  mode,
  date,
  today,
  days,
  norm,
  onPeriod,
  onMode,
  onOpenDay,
  onSetNorm,
  streak,
}: ViewProps) {
  const { t } = useT();
  const period = periodOf(mode, date);
  const swipe = usePager((step) => {
    const next = stepPeriod(mode, date, step);
    if (next <= today) onPeriod(next);
  });

  let body;
  if (days === undefined || norm === undefined)
    body = (
      <Delayed>
        <div className="week__body">
          <p role="status" className="week__loading">
            {t('common.loading')}
          </p>
          <div className="wcard">
            {/* 7.8: bar silhouettes on the chart's own grid. */}
            <div className={`kchart kchart--${mode}`}>
              <div className="kchart__plot">
                <div className="kchart__bars week__skeleton-bars">
                  {Array.from(
                    { length: daysBetween(period.from, period.to) + 1 },
                    (_, i) => (
                      <Skeleton
                        key={i}
                        height={SKELETON_BARS[i % SKELETON_BARS.length]}
                        radius={
                          mode === 'week'
                            ? 'var(--radius-sm) var(--radius-sm) 0 0'
                            : '2px 2px 0 0'
                        }
                      />
                    ),
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="week__cards">
            <Skeleton
              height="calc(var(--space-12) * 3)"
              radius="var(--radius-lg)"
            />
            <Skeleton
              height="calc(var(--space-12) * 3)"
              radius="var(--radius-lg)"
            />
          </div>
        </div>
      </Delayed>
    );
  else {
    // The whole period against today's norm, as on Today (ADR-0010, ADR-0011).
    const summary = summarize(days, norm, today);
    body = (
      <div className="week__body">
        {norm === null && <NormInvite onSet={onSetNorm} />}
        <div className="wcard">
          <KcalChart
            // A new period drops the month tip.
            key={period.from}
            days={days}
            norm={norm && norm.kcal}
            today={today}
            mode={mode}
            onOpenDay={onOpenDay}
          />
        </div>
        <div className="week__cards">
          <WeekBudgetCard
            mode={mode}
            summary={summary}
            norm={norm && norm.kcal}
            days={days.length}
            daysLeft={
              today >= period.from && today <= period.to
                ? daysBetween(today, period.to) + 1
                : 0
            }
          />
          {summary.average && (
            <MacroAveragesCard
              average={summary.average}
              daysWithMeals={summary.daysWithMeals}
              norm={norm}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="week" {...swipe}>
      {streak}
      <WeekHead
        mode={mode}
        date={date}
        today={today}
        onPeriod={onPeriod}
        onMode={onMode}
      />
      {body}
    </div>
  );
}

/** `/week/2026-W46`, `/month/2026-11`; a malformed or future period opens the current one. */
export function WeekScreen({ mode, id }: { mode: PeriodMode; id: string }) {
  const today = useToday();
  const period = periodOfId(mode, id, today);
  if (!period) return <Redirect to={periodPath(mode, today)} replace />;
  return <Week mode={mode} from={period.from} to={period.to} today={today} />;
}

/** Moves between periods by address, so the screen and its navbar head stay in step. */
function usePeriodNav(mode: PeriodMode, to: string, today: string) {
  const [, navigate] = useLocation();
  return {
    onPeriod: (date: string) =>
      navigate(periodPath(mode, date), { replace: true }),
    // The other view of the shown time: its last day, or today in the current period.
    onMode: (next: PeriodMode) =>
      navigate(periodPath(next, to < today ? to : today), { replace: true }),
  };
}

/** The navbar `aside` of `/week/:id` and `/month/:id` (desktop, D.3). */
export function WeekNavHead({ mode, id }: { mode: PeriodMode; id: string }) {
  const today = useToday();
  const period = periodOfId(mode, id, today);
  const nav = usePeriodNav(mode, period ? period.to : today, today);
  if (!period) return null;
  return <WeekHead mode={mode} date={period.from} today={today} {...nav} />;
}

function Week({
  mode,
  from,
  to,
  today,
}: {
  mode: PeriodMode;
  from: string;
  to: string;
  today: string;
}) {
  const [, navigate] = useLocation();
  const meals = usePeriod(from, to);
  const drinks = useDrinkEntries(from, to);
  const norm = useNorm(today);
  const nav = usePeriodNav(mode, to, today);
  const streaks = useStreaks(today);
  return (
    <WeekView
      mode={mode}
      date={from}
      today={today}
      days={meals && drinks && periodDays(meals, from, to, drinks)}
      norm={norm}
      {...nav}
      onOpenDay={(date) => navigate(`/diary/${date}`)}
      onSetNorm={() => navigate('/profile')}
      streak={
        streaks?.on && (
          <StreakRow
            streak={streaks.streak}
            onOpen={() => navigate(STREAKS_PATH)}
          />
        )
      }
    />
  );
}
