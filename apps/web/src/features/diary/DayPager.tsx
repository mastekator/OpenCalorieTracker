import { addDays } from '@oct/shared';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useT } from '../../i18n';
import { periodLabel, stepPeriod, type PeriodMode } from '../week/period';
import { dayLabel } from './day';
import './DayPager.css';

type Props = {
  /** Day (default) or a period; a period has no date picker. */
  mode?: 'day' | PeriodMode;
  /** The shown day, `YYYY-MM-DD`; for a period, any day in it. */
  date: string;
  /** Local today: «›» stops here (AC-2.3). */
  today: string;
  /** The new day; for a period, its first day. */
  onChange: (date: string) => void;
};

/** ‹ day › with the system date picker on the label (OCT-19 §3); ‹ week › / ‹ month › (§4). */
export function DayPager({ mode = 'day', ...props }: Props) {
  return mode === 'day' ? (
    <DayMode {...props} />
  ) : (
    <PeriodPager mode={mode} {...props} />
  );
}

function PeriodPager({
  mode,
  date,
  today,
  onChange,
}: Omit<Props, 'mode'> & { mode: PeriodMode }) {
  const { t, locale } = useT();
  const { label, sub } = periodLabel(mode, date, today, locale, t);
  const next = stepPeriod(mode, date, 1);
  return (
    <div className="day-pager">
      <button
        type="button"
        className="day-pager__arrow"
        aria-label={t(`week.prev.${mode}`)}
        onClick={() => onChange(stepPeriod(mode, date, -1))}
      >
        <ChevronLeft aria-hidden="true" />
      </button>
      <span className="day-pager__date">
        <span className="day-pager__label">{label}</span>
        {sub && <span className="day-pager__sub">{sub}</span>}
      </span>
      <button
        type="button"
        className="day-pager__arrow"
        aria-label={t(`week.next.${mode}`)}
        disabled={next > today}
        onClick={() => onChange(next)}
      >
        <ChevronRight aria-hidden="true" />
      </button>
    </div>
  );
}

function DayMode({ date, today, onChange }: Omit<Props, 'mode'>) {
  const { t, locale } = useT();
  const { label, sub } = dayLabel(date, today, locale, t);
  return (
    <div className="day-pager">
      <button
        type="button"
        className="day-pager__arrow"
        aria-label={t('diary.prev')}
        onClick={() => onChange(addDays(date, -1))}
      >
        <ChevronLeft aria-hidden="true" />
      </button>
      <span className="day-pager__date">
        <span className="day-pager__label" aria-hidden="true">
          {label}
          <ChevronDown />
        </span>
        {sub && (
          <span className="day-pager__sub" aria-hidden="true">
            {sub}
          </span>
        )}
        <input
          type="date"
          className="day-pager__input"
          aria-label={t('diary.pick', {
            day: sub ? `${label}, ${sub}` : label,
          })}
          value={date}
          max={today}
          onClick={(event) => {
            // Desktop browsers open the picker only from its icon.
            try {
              event.currentTarget.showPicker();
            } catch {
              // Not supported or not allowed: the field still takes typing.
            }
          }}
          onChange={(event) => {
            const value = event.target.value;
            if (value) onChange(value > today ? today : value);
          }}
        />
      </span>
      <button
        type="button"
        className="day-pager__arrow"
        aria-label={t('diary.next')}
        disabled={date >= today}
        onClick={() => onChange(addDays(date, 1))}
      >
        <ChevronRight aria-hidden="true" />
      </button>
    </div>
  );
}
