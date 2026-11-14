import { addDays } from '@oct/shared';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useT } from '../../i18n';
import { dayLabel } from './day';
import './DayPager.css';

type Props = {
  /** The shown day, `YYYY-MM-DD`. */
  date: string;
  /** Local today: «›» stops here (AC-2.3). */
  today: string;
  onChange: (date: string) => void;
};

/** ‹ day › with the system date picker on the label (OCT-19 §3). Week / month: OCT-71. */
export function DayPager({ date, today, onChange }: Props) {
  const { t, locale } = useT();
  const { label, year } = dayLabel(date, today, locale, t);
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
        {year && (
          <span className="day-pager__year" aria-hidden="true">
            {year}
          </span>
        )}
        <input
          type="date"
          className="day-pager__input"
          aria-label={t('diary.pick')}
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
