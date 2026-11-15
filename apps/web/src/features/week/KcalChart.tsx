import { useEffect, useRef, useState } from 'react';
import type { DayTotals } from '@oct/shared';
import { ChartColumn } from 'lucide-react';
import { useT } from '../../i18n';
import { barOf, chartScale } from './chartScale';
import './KcalChart.css';

type Props = {
  /** Every day of the period in order, empty days as zeros (`/api/summary` shape). */
  days: readonly DayTotals[];
  /** Daily kcal norm; null hides the norm line, the overrun and the legend for it (7.5). */
  norm: number | null;
  /** Local date; later days are future: no bar, disabled label. */
  today: string;
  mode: 'week' | 'month';
  /** Opens the day in the diary (AC-3.5). */
  onOpenDay: (date: string) => void;
};

/** Month ticks; ticks within 2 days of today give way to today's own (OCT-19 §4). */
const TICKS = [1, 5, 10, 15, 20, 25, 30];
const dayOf = (date: string) => Number(date.slice(8));

/**
 * Kcal by day as HTML/CSS bars (ADR-0010): accent up to the norm, hatched overrun above it,
 * dashed norm line, clipped bars past `2 × norm`. Week: a tap opens the day. Month: the first
 * tap shows the value, the second opens the day. A mouse hover shows the value in both.
 */
export function KcalChart({ days, norm, today, mode, onOpenDay }: Props) {
  const { t, num, locale } = useT();
  const [tip, setTip] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  // A tapped tip closes on a tap outside the chart or on Esc (OCT-19 7.3).
  useEffect(() => {
    if (!tip) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setTip(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setTip(null);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [tip]);
  const past = days.filter((d) => d.date <= today);
  const top = chartScale(
    past.map((d) => d.kcal),
    norm,
  );
  const empty = past.every((d) => d.meals === 0);
  const format = (date: string, options: Intl.DateTimeFormatOptions) => {
    const s = new Intl.DateTimeFormat(locale, {
      ...options,
      timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00Z`));
    // «пн» → «Пн», as in the design.
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const dayName = (date: string) =>
    format(date, { weekday: 'short', day: 'numeric', month: 'short' });
  const todayN = days.some((d) => d.date === today) ? dayOf(today) : null;
  const tick = (date: string) =>
    date === today ||
    (TICKS.includes(dayOf(date)) &&
      (todayN === null || Math.abs(todayN - dayOf(date)) > 2));

  const tipIndex = days.findIndex((d) => d.date === tip);
  const tipDay = days[tipIndex];
  const n = { norm: norm === null ? '' : num(norm) };

  return (
    <div ref={root} className={`kchart kchart--${mode}`}>
      <div className="kchart__plot">
        {norm !== null && (
          <span
            className="kchart__norm"
            style={{ bottom: `${(norm / top) * 100}%` }}
          />
        )}
        <ol
          className="kchart__bars"
          role="list"
          aria-label={
            norm === null ? t('chart.a11y_no_norm') : t('chart.a11y', n)
          }
        >
          {days.map((d) => {
            const day = dayName(d.date);
            if (d.date > today)
              return (
                <li key={d.date} className="kchart__col">
                  <span role="img" aria-label={t('chart.future', { day })} />
                </li>
              );
            const bar = barOf(d.kcal, norm, top);
            const k = num(d.kcal);
            const label =
              norm === null
                ? t('chart.bar_no_norm', { day, k })
                : bar.over
                  ? t('chart.bar_over', { day, k, ...n, n: num(d.kcal - norm) })
                  : t('chart.bar', { day, k, ...n });
            return (
              <li key={d.date} className="kchart__col">
                <button
                  type="button"
                  className="kchart__hit"
                  aria-label={label}
                  aria-current={d.date === today ? 'date' : undefined}
                  data-tip={d.date === tip || undefined}
                  onClick={() => {
                    if (mode === 'week' || tip === d.date) onOpenDay(d.date);
                    else setTip(d.date);
                  }}
                  onPointerEnter={(e) => {
                    if (e.pointerType === 'mouse') setTip(d.date);
                  }}
                  onPointerLeave={(e) => {
                    if (e.pointerType === 'mouse') setTip(null);
                  }}
                >
                  <span
                    className={`kchart__bar${d.kcal > 0 ? '' : ' kchart__bar--zero'}`}
                    style={{ height: `${bar.height * 100}%` }}
                  >
                    {bar.over && (
                      <span
                        className="kchart__over"
                        style={{ height: `${(1 - bar.fill) * 100}%` }}
                      />
                    )}
                    {bar.clipped && <span className="kchart__clip" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        {empty && (
          <span className="kchart__empty">
            <ChartColumn aria-hidden="true" />
            {t(mode === 'week' ? 'chart.empty.week' : 'chart.empty.month')}
          </span>
        )}
        {tipDay && (
          <span
            className="kchart__tip"
            aria-hidden="true"
            style={{
              left: `${((tipIndex + 0.5) / days.length) * 100}%`,
              translate: `${-Math.round(((tipIndex + 0.5) / days.length) * 100)}% 0`,
            }}
          >
            {norm === null
              ? t('chart.tip_no_norm', {
                  day: dayName(tipDay.date),
                  k: num(tipDay.kcal),
                })
              : t('chart.tip', {
                  day: dayName(tipDay.date),
                  k: num(tipDay.kcal),
                  ...n,
                })}
          </span>
        )}
      </div>
      <ol className="kchart__axis" aria-hidden="true">
        {days.map((d) => {
          const state =
            d.date === today
              ? ' kchart__label--today'
              : d.date > today
                ? ' kchart__label--future'
                : '';
          if (mode === 'month')
            return (
              <li key={d.date} className={`kchart__label${state}`}>
                {tick(d.date) ? dayOf(d.date) : ''}
              </li>
            );
          const over = barOf(d.kcal, norm, top).over;
          return (
            <li key={d.date} className={`kchart__label${state}`}>
              {format(d.date, { weekday: 'short' })}
              <b>{dayOf(d.date)}</b>
              <em className={over ? 'kchart__over-value' : undefined}>
                {d.date > today ? '' : num(d.kcal)}
              </em>
            </li>
          );
        })}
      </ol>
      <div className="kchart__legend" aria-hidden="true">
        <span>
          <i className="kchart__key" />
          {t('chart.legend.eaten')}
        </span>
        {norm !== null && (
          <>
            <span>
              <i className="kchart__key kchart__key--norm" />
              {t('chart.legend.norm', n)}
            </span>
            <span>
              <i className="kchart__key kchart__key--over" />
              {t('chart.legend.over')}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
