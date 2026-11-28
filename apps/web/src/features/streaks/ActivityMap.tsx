import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { activityMap, addDays } from '@oct/shared';
import type { DayFact } from '@oct/shared';
import { useT } from '../../i18n';
import { useFormatDay } from './StreakCard';
import '../week/WeekCards.css';
import './Streaks.css';

type Props = {
  days: readonly Pick<DayFact, 'date' | 'meals'>[];
  today: string;
  /** 3.4: the local copy is shorter than a year; the day of the last pull. */
  asOf?: string | null;
};

const STEP: Record<string, number> = {
  ArrowLeft: -7,
  ArrowRight: 7,
  ArrowUp: -1,
  ArrowDown: 1,
};

/** «Entries this year» (OCT-184 2.1, 3.1, 3.4, D.1): a cell per day, shade by meals, the picked day below. */
export function ActivityMap({ days, today, asOf }: Props) {
  const { t } = useT();
  const fmt = useFormatDay();
  const [, navigate] = useLocation();
  const map = useMemo(() => activityMap(days, today), [days, today]);
  const cells = map.weeks.flatMap((w) => w.days.filter((d) => d !== null));
  const byDate = new Map(cells.map((c) => [c.date, c]));
  const logged = cells.filter((c) => c.meals > 0).length;
  const [picked, setPicked] = useState(today);
  const sel = byDate.get(picked) ?? byDate.get(today);
  const wrap = useRef<HTMLDivElement>(null);

  // Opens scrolled to today (2.1).
  useLayoutEffect(() => {
    if (wrap.current) wrap.current.scrollLeft = wrap.current.scrollWidth;
  }, [logged]);

  const month = (date: string) => fmt(date, { month: 'short' });
  const weekday = (i: number) =>
    fmt(addDays('2024-01-01', i), { weekday: 'short' });
  const note = asOf && (
    <p className="amap__note">{t('streaks.map_as_of', { date: fmt(asOf) })}</p>
  );
  const head = (
    <div className="challenges__head">
      <h2 className="challenges__title">{t('streaks.map.title')}</h2>
      {sel && (
        <span className="challenges__count">
          {t('streaks.map.days', { count: logged })}
        </span>
      )}
    </div>
  );

  if (!sel)
    return (
      <section className="wcard amap" aria-label={t('streaks.map.title')}>
        {head}
        <p className="amap__empty">{t('streaks.map.empty')}</p>
        {note}
      </section>
    );

  const pick = (date: string | undefined) => {
    if (date && byDate.has(date)) setPicked(date);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') return navigate(`/diary/${sel.date}`);
    const step = STEP[e.key];
    if (!step) return;
    e.preventDefault();
    const date = addDays(sel.date, step);
    pick(date);
    wrap.current
      ?.querySelector(`[data-date="${date}"]`)
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  };
  const dateOf = (e: { target: EventTarget }) =>
    (e.target as HTMLElement).dataset.date;
  const day = fmt(sel.date, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <section className="wcard amap" aria-label={t('streaks.map.title')}>
      {head}
      <div className="amap__row">
        <div className="amap__weekdays" aria-hidden="true">
          <span />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <span key={i}>{i < 6 && i % 2 === 0 ? weekday(i) : ''}</span>
          ))}
        </div>
        <div className="amap__wrap" ref={wrap}>
          <div
            className="amap__grid"
            role="group"
            tabIndex={0}
            aria-label={t('streaks.map.label', { count: logged })}
            onKeyDown={onKey}
            onClick={(e) => pick(dateOf(e))}
            onMouseOver={(e) => pick(dateOf(e))}
          >
            {map.weeks.map((w, i) => {
              const first = w.days.find((d) => d?.date.endsWith('-01'));
              return [
                <span key={w.from} className="amap__month" aria-hidden="true">
                  {first || i === 0
                    ? month(first?.date ?? w.days.find(Boolean)?.date ?? w.from)
                    : ''}
                </span>,
                ...w.days.map((d, j) => (
                  <i
                    key={`${w.from}-${j}`}
                    aria-hidden="true"
                    data-date={d?.date}
                    data-level={d ? d.level : undefined}
                    className={`amap__cell${d?.date === sel.date ? ' amap__cell--sel' : ''}`}
                  />
                )),
              ];
            })}
          </div>
        </div>
      </div>
      <div className="amap__legend" aria-hidden="true">
        <span>{t('streaks.map.legend')}</span>
        {(['0', '1', '2', '3+'] as const).map((l, i) => (
          <span key={l} className="amap__legend-item">
            <i className="amap__cell" data-level={i} />
            {l}
          </span>
        ))}
      </div>
      {note}
      <div className="amap__day">
        <span role="status">
          {t('streaks.map.day', {
            day: day.charAt(0).toUpperCase() + day.slice(1),
            count: sel.meals,
          })}
        </span>
        <Link href={`/diary/${sel.date}`} className="amap__open">
          {t('streaks.map.open')}
          <ChevronRight aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
