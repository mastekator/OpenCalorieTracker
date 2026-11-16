import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, monthOf } from '@oct/shared';
import { useT } from '../../i18n';
import './DayCalendar.css';

type Props = {
  /** Selected day, `YYYY-MM-DD`. */
  value: string;
  /** Local today: later days are disabled. */
  today: string;
  /** Birth date: earlier days are disabled (AC-9.3). */
  min?: string;
  /** Days that already have a weighing: a dot under the number. */
  marked: ReadonlySet<string>;
  onChange: (date: string) => void;
};

const utc = (date: string) => new Date(`${date}T00:00:00Z`);

/** Month grid, Monday first, with ‹ › paging (OCT-189 2.4). */
export function DayCalendar({ value, today, min, marked, onChange }: Props) {
  const { t, locale } = useT();
  const [month, setMonth] = useState(() => monthOf(value));
  const prev = monthOf(addDays(month.from, -1));
  const next = monthOf(addDays(month.to, 1));

  const fmt = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options });
  const name = fmt({ month: 'long' }).format(utc(month.from));
  const title = `${name.charAt(0).toLocaleUpperCase(locale)}${name.slice(1)} ${month.from.slice(0, 4)}`;
  const weekday = fmt({ weekday: 'short' });
  const longDate = fmt({ day: 'numeric', month: 'long', year: 'numeric' });
  // 2026-11-16 is a Monday.
  const heads = [0, 1, 2, 3, 4, 5, 6].map((i) =>
    weekday.format(utc(addDays('2026-11-16', i))),
  );
  const lead = (utc(month.from).getUTCDay() + 6) % 7;
  const days: string[] = [];
  for (let d = month.from; d <= month.to; d = addDays(d, 1)) days.push(d);

  return (
    <div className="day-cal">
      <div className="day-cal__head">
        <button
          type="button"
          className="day-cal__arrow"
          aria-label={t('week.prev.month')}
          disabled={min !== undefined && prev.to < min}
          onClick={() => setMonth(prev)}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <span className="day-cal__title" aria-live="polite">
          {title}
        </span>
        <button
          type="button"
          className="day-cal__arrow"
          aria-label={t('week.next.month')}
          disabled={next.from > today}
          onClick={() => setMonth(next)}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <div className="day-cal__grid">
        {heads.map((h) => (
          <span key={h} className="day-cal__weekday" aria-hidden="true">
            {h}
          </span>
        ))}
        {lead > 0 && <span style={{ gridColumn: `span ${lead}` }} />}
        {days.map((d) => {
          const has = marked.has(d);
          const label = longDate.format(utc(d));
          return (
            <button
              key={d}
              type="button"
              className={`day-cal__day${has ? ' day-cal__day--has' : ''}`}
              aria-label={has ? `${label}, ${t('weighing.has')}` : label}
              aria-pressed={d === value}
              aria-current={d === today ? 'date' : undefined}
              disabled={d > today || (min !== undefined && d < min)}
              onClick={() => onChange(d)}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
