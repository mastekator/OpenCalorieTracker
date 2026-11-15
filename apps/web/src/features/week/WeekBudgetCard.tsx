import type { Summary } from '@oct/shared';
import { CircleAlert } from 'lucide-react';
import { useT } from '../../i18n';
import { ProgressBar } from '../../ui/ProgressBar/ProgressBar';
import type { PeriodMode } from './period';
import './WeekCards.css';

type Props = {
  mode: PeriodMode;
  /** `summarize()` of the period against today's norm. */
  summary: Summary;
  /** Daily kcal norm; null: only what was eaten (7.5). */
  norm: number | null;
  /** Days in the period. */
  days: number;
  /** Days from today to the period's end inclusive; 0 for a past period (AC-3.10). */
  daysLeft: number;
};

/** Budget of the week or month (AC-3.8, OCT-19 §4): left or over, the bar, «per remaining day». */
export function WeekBudgetCard({ mode, summary, norm, days, daysLeft }: Props) {
  const { t, num } = useT();
  const { eaten, budget, remaining, perRemainingDay } = summary;
  if (norm === null || !budget || !remaining)
    return (
      <section className="wcard" aria-label={t(`week.eaten_no_norm.${mode}`)}>
        <span className="wcard__label">{t(`week.eaten_no_norm.${mode}`)}</span>
        <Big n={num(eaten.kcal)} />
      </section>
    );
  // Decided on the shown (rounded) numbers (E-1.1, E-3.6).
  const left = Math.round(remaining.kcal);
  const perDay = perRemainingDay === null ? 0 : Math.round(perRemainingDay);
  const over = left < 0;
  const label = over
    ? t(`week.over.${mode}`)
    : t(daysLeft ? `week.left.${mode}` : `week.total.${mode}`);
  const of = t('week.eaten_of', {
    x: num(eaten.kcal),
    y: num(budget.kcal),
    norm: num(norm),
    days,
  });
  return (
    <section className="wcard" aria-label={label}>
      <span className={`wcard__label${over ? ' wcard__label--over' : ''}`}>
        {over && <CircleAlert aria-hidden="true" />}
        {label}
      </span>
      <Big n={num(over ? -left : daysLeft ? left : eaten.kcal)} />
      <ProgressBar
        value={eaten.kcal}
        max={budget.kcal}
        label={t('today.kcal')}
        valueText={of}
      />
      <span className="wcard__note" aria-hidden="true">
        {of}
      </span>
      {!over && daysLeft > 0 && perDay > 0 && (
        <p className="wcard__per-day">
          <span>{t('week.per_day', { count: daysLeft })}</span>
          <b>{t('week.per_day_kcal', { k: num(perDay) })}</b>
        </p>
      )}
    </section>
  );
}

function Big({ n }: { n: string }) {
  const { t } = useT();
  return (
    <span className="wcard__big">
      <span className="wcard__number">{n}</span>
      <span className="wcard__unit">{t('today.kcal')}</span>
    </span>
  );
}
