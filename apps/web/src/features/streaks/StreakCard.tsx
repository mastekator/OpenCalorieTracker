import { Check, Flame, Snowflake } from 'lucide-react';
import {
  addDays,
  weekOf,
  type DayFact,
  type StreakState,
  type WeekStatus,
} from '@oct/shared';
import { useT } from '../../i18n';
import { ProgressBar } from '../../ui/ProgressBar/ProgressBar';
import '../week/WeekCards.css';
import './Streaks.css';

type Props = {
  streak: StreakState;
  /** Per-day facts (`Streaks.days`): which days of this week have entries. */
  days: Pick<DayFact, 'date' | 'meals'>[];
  today: string;
};

/** Head of the card and of the Week row: «6 weeks in a row», a new streak or none yet (OCT-184 §2, §3). */
export function useStreakTitle(streak: StreakState) {
  const { t } = useT();
  if (streak.current > 0) return t('streaks.weeks', { count: streak.current });
  return t(streak.best > 0 ? 'streaks.restart' : 'streaks.start');
}

/** «3 of 5 days this week» or «Week counted». */
export function useWeekLine(streak: StreakState) {
  const { t } = useT();
  const { days, target, counted } = streak.week;
  return counted
    ? t('streaks.week_done')
    : t('streaks.week_days', { days, target });
}

/** Streak card (OCT-184 §2.1): flame, current and best streak, this week's days, the 10-week trail. */
export function StreakCard({ streak, days, today }: Props) {
  const { t, locale } = useT();
  const fmt = (date: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(
      new Date(`${date}T00:00:00Z`),
    );
  const title = useStreakTitle(streak);
  const weekLine = useWeekLine(streak);
  const logged = new Set(days.filter((d) => d.meals > 0).map((d) => d.date));
  const monday = weekOf(today).from;
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const { week: w } = streak;
  const status = (s: WeekStatus) =>
    s === 'current'
      ? t('streaks.trail.current', { days: w.days, target: w.target })
      : t(`streaks.trail.${s}`);

  return (
    <section className="wcard streak" aria-label={t('streaks.title')}>
      <div className="streak__head">
        <span
          className={`streak__flame${streak.best > 0 ? '' : ' streak__flame--off'}`}
        >
          <Flame aria-hidden="true" />
        </span>
        <div className="streak__titles">
          <h2
            className={`streak__title${streak.current > 0 ? '' : ' streak__title--long'}`}
          >
            {title}
          </h2>
          {streak.best > 0 && (
            <span className="streak__sub">
              {t('streaks.best', { count: streak.best })}
            </span>
          )}
        </div>
      </div>

      <ol className="streak__days" aria-label={t('streaks.days_label')}>
        {week.map((date) => {
          const day = fmt(date, { weekday: 'long' });
          const on = logged.has(date);
          const label =
            date === today
              ? t('streaks.day.today', {
                  day,
                  state: t(
                    on ? 'streaks.day.state_logged' : 'streaks.day.state_empty',
                  ),
                })
              : t(
                  on
                    ? 'streaks.day.logged'
                    : date > today
                      ? 'streaks.day.ahead'
                      : 'streaks.day.empty',
                  { day },
                );
          const short = fmt(date, { weekday: 'short' });
          return (
            <li
              key={date}
              aria-label={label}
              className={`streak__day${on ? ' streak__day--on' : ''}${date > today ? ' streak__day--ahead' : ''}${date === today ? ' streak__day--today' : ''}`}
            >
              <i>{on && <Check aria-hidden="true" />}</i>
              <span aria-hidden="true">
                {short.charAt(0).toUpperCase() + short.slice(1)}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="streak__week">
        <span className={w.counted ? 'streak__done' : undefined}>
          {w.counted && <Check aria-hidden="true" />}
          {weekLine}
        </span>
        {w.counted && (
          <span className="streak__sub">
            {t('streaks.week_logged', { days: w.days })}
          </span>
        )}
      </div>
      <ProgressBar
        value={Math.min(w.days, w.target)}
        max={w.target}
        label={t('streaks.week_progress')}
        valueText={weekLine}
      />

      {streak.best > 0 && (
        <>
          <hr className="streak__hr" />
          <ol className="streak__trail" aria-label={t('streaks.trail.label')}>
            {streak.trail.map(({ from, status: s }) => (
              <li
                key={from}
                className={`streak__w streak__w--${s}`}
                aria-label={t('streaks.trail.week', {
                  date: fmt(from, { day: 'numeric', month: 'long' }),
                  status: status(s),
                })}
              >
                {s === 'counted' && <Check aria-hidden="true" />}
                {s === 'frozen' && <Snowflake aria-hidden="true" />}
                {s === 'current' && (
                  <>
                    <u
                      style={{
                        height: `${(Math.min(w.days, w.target) / w.target) * 100}%`,
                      }}
                    />
                    <b aria-hidden="true">{w.days}</b>
                  </>
                )}
              </li>
            ))}
          </ol>
          <div className="streak__trail streak__trail-x" aria-hidden="true">
            {streak.trail.map(({ from, status: s }, i) => {
              const prev = streak.trail[i - 1];
              const label =
                s === 'current'
                  ? t('streaks.trail.this')
                  : !prev || prev.from.slice(0, 7) !== from.slice(0, 7)
                    ? fmt(from, { month: 'short' })
                    : '';
              return <span key={from}>{label}</span>;
            })}
          </div>
          <div className="streak__legend" aria-hidden="true">
            <span>
              <i className="streak__w--counted" />
              {t('streaks.trail.counted')}
            </span>
            <span>
              <i className="streak__w--frozen" />
              {t('streaks.trail.frozen')}
            </span>
            <span>
              <i className="streak__w--short" />
              {t('streaks.trail.short')}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
