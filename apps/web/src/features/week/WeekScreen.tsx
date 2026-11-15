import {
  daysBetween,
  summarize,
  type DayTotals,
  type Macros,
} from '@oct/shared';
import { Redirect, useLocation } from 'wouter';
import { useNorm, usePeriod } from '../../data/DataContext';
import { useT } from '../../i18n';
import { Segment } from '../../ui/Segment/Segment';
import { Delayed, Skeleton } from '../../ui/Skeleton/Skeleton';
import { DayPager } from '../diary/DayPager';
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
};

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
          <Skeleton
            height="calc(var(--chart-height) + var(--space-12))"
            radius="var(--radius-lg)"
          />
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
  const norm = useNorm(today);
  return (
    <WeekView
      mode={mode}
      date={from}
      today={today}
      days={meals && periodDays(meals, from, to)}
      norm={norm}
      onPeriod={(date) => navigate(periodPath(mode, date), { replace: true })}
      // The other view of the shown time: its last day, or today in the current period.
      onMode={(next) =>
        navigate(periodPath(next, to < today ? to : today), { replace: true })
      }
      onOpenDay={(date) => navigate(`/diary/${date}`)}
      onSetNorm={() => navigate('/profile')}
    />
  );
}
