import { useState } from 'react';
import type { ChallengeMonth } from '@oct/shared';
import { useT } from '../../i18n';
import { Button } from '../../ui/Button/Button';
import { periodLabel } from '../week/period';
import '../week/WeekCards.css';
import './Streaks.css';

type Props = {
  months: readonly ChallengeMonth[];
  /** 'YYYY-MM' of this month. */
  month: string;
  today: string;
};

const SHOWN = 3;

/** Closed months, newest first; an open row is still being counted, even if it lists done challenges. */
export const pastMonths = (months: readonly ChallengeMonth[], month: string) =>
  months
    .filter((m) => m.closed && m.month < month)
    .sort((a, b) => b.month.localeCompare(a.month));

/** «Past months» (OCT-184 2.1, D.1): «Done N of 3» per closed month and which ones. */
export function PastMonths({ months, month, today }: Props) {
  const { t, locale } = useT();
  const [all, setAll] = useState(false);
  const rows = pastMonths(months, month);
  if (!rows.length) return null;
  const name = (key: string) =>
    t(`streaks.challenge.${key}` as 'streaks.challenge.profile');
  return (
    <section className="wcard" aria-label={t('streaks.past.title')}>
      <h2 className="challenges__title">{t('streaks.past.title')}</h2>
      <ul className="past">
        {(all ? rows : rows.slice(0, SHOWN)).map((m) => {
          const done = m.keys.filter((k) => m.done[k]);
          const n = done.length;
          const { label, sub } = periodLabel(
            'month',
            `${m.month}-01`,
            today,
            locale,
            t,
          );
          return (
            <li key={m.month} className="past__row">
              <span>{`${label} ${sub}`}</span>
              <span className="past__count">
                {t('streaks.past.count', { done: n })}
                <span className="past__dots" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <i key={i} className={i < n ? 'past__dot--on' : ''} />
                  ))}
                </span>
              </span>
              {n > 0 && (
                <span className="past__sub">
                  {n === 3 ? t('streaks.past.all') : done.map(name).join(', ')}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {!all && rows.length > SHOWN && (
        <Button variant="plain" small onClick={() => setAll(true)}>
          {t('streaks.past.more')}
        </Button>
      )}
    </section>
  );
}
