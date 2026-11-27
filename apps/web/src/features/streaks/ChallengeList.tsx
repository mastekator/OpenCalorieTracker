import {
  CalendarCheck,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  Pencil,
  Scale,
  User,
} from 'lucide-react';
import { Link } from 'wouter';
import type { ChallengeKey, ChallengeProgress } from '@oct/shared';
import { useT } from '../../i18n';
import { ProgressBar } from '../../ui/ProgressBar/ProgressBar';
import { periodLabel } from '../week/period';
import { useFormatDay } from './StreakCard';
import '../week/WeekCards.css';
import './Streaks.css';

const ICONS: Record<ChallengeKey, typeof Check> = {
  days_20: CalendarCheck,
  full_week: CalendarDays,
  photo_20: Camera,
  grams_10: Scale,
  manual_macros_5: Pencil,
  profile: User,
};

type Props = {
  challenges: ChallengeProgress[];
  /** 'YYYY-MM' */
  month: string;
  today: string;
  /** Stored days of this month's done challenges: `profile` has no `doneOn` of its own. */
  done?: Record<string, string>;
};

/** This month's challenges (OCT-184 2.1): icon, name, progress or «Done»; `profile` opens Profile. */
export function ChallengeList({ challenges, month, today, done = {} }: Props) {
  const { t, locale } = useT();
  const fmt = useFormatDay();
  const title = periodLabel('month', `${month}-01`, today, locale, t).label;
  const count = challenges.filter((c) => c.done).length;
  return (
    <section className="wcard" aria-label={t('streaks.challenges.title')}>
      <div className="challenges__head">
        <h2 className="challenges__title">{t('streaks.challenges.title')}</h2>
        <span className="challenges__count">
          {t('streaks.challenges.count', { month: title, done: count })}
        </span>
      </div>
      <ul className="challenges">
        {challenges.map((c) => {
          const name = t(`streaks.challenge.${c.key}`);
          const Icon = c.done ? Check : ICONS[c.key];
          const on = c.doneOn ?? done[c.key];
          const value = t('streaks.challenges.value', {
            value: c.value,
            target: c.target,
          });
          const body = (
            <>
              <span className="challenge__icon">
                <Icon aria-hidden="true" />
              </span>
              <span className="challenge__name">{name}</span>
              {c.done ? (
                <>
                  <span className="challenge__value challenge__value--done">
                    <Check aria-hidden="true" />
                    {t('streaks.challenges.done')}
                  </span>
                  {on && (
                    <span className="challenge__sub">
                      {t('streaks.challenges.done_on', { date: fmt(on) })}
                    </span>
                  )}
                </>
              ) : c.key === 'profile' ? (
                <>
                  <ChevronRight
                    className="challenge__value"
                    aria-hidden="true"
                  />
                  <span className="challenge__sub">
                    {t('streaks.challenges.profile_hint')}
                  </span>
                </>
              ) : (
                <>
                  <span className="challenge__value" aria-hidden="true">
                    {value}
                  </span>
                  <span className="challenge__bar">
                    <ProgressBar
                      value={c.value}
                      max={c.target}
                      label={name}
                      valueText={value}
                    />
                  </span>
                </>
              )}
            </>
          );
          const cls = `challenge${c.done ? ' challenge--done' : ''}`;
          return (
            <li key={c.key}>
              {!c.done && c.key === 'profile' ? (
                <Link
                  href="/profile"
                  className={`${cls} challenge--link`}
                  aria-label={t('streaks.challenges.open_profile', { name })}
                >
                  {body}
                </Link>
              ) : (
                <div className={cls}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
