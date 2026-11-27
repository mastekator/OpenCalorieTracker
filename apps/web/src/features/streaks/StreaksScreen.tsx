import { Award, Flame, Snowflake } from 'lucide-react';
import { useT } from '../../i18n';
import { addDays } from '@oct/shared';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import { Sheet } from '../../ui/Sheet/Sheet';
import { Delayed, Skeleton } from '../../ui/Skeleton/Skeleton';
import type { Streaks } from '../../data/streaks';
import { periodLabel } from '../week/period';
import { ChallengeList } from './ChallengeList';
import { FreezeCard } from './FreezeCard';
import { StreakCard, useFormatDay } from './StreakCard';
import '../week/WeekCards.css';
import './Streaks.css';

type Props = {
  /** Undefined while the local copy is read (3.5). */
  streaks: Streaks | undefined;
  today: string;
  rulesOpen: boolean;
  onCloseRules: () => void;
  onEnable: () => void;
  /** × on «Week frozen», with that week's Monday. */
  onCloseFreezeNotice: (from: string) => void;
};

/** `/week/streaks` (OCT-184 §2, §3, D.1): the streak card; from 1024px a second column is kept for awards and past months. */
export function StreaksScreen({
  streaks,
  today,
  rulesOpen,
  onCloseRules,
  onEnable,
  onCloseFreezeNotice,
}: Props) {
  const { t, locale } = useT();
  const fmt = useFormatDay();
  if (streaks && !streaks.on)
    return (
      <ScreenState
        icon={<Flame />}
        title={t('streaks.off.title')}
        action={
          <Button variant="tonal" small onClick={onEnable}>
            {t('streaks.off.enable')}
          </Button>
        }
      >
        {t('streaks.off.body')}
      </ScreenState>
    );

  // 3.3: the week before this one was frozen and its notice not yet closed here.
  const last = streaks?.streak.weeks.at(-2);
  const frozen =
    last?.status === 'frozen' && last.from !== streaks?.freezeNoticeSeen
      ? last
      : null;
  const loggedIn = (from: string) =>
    streaks?.days.filter(
      (d) => d.meals > 0 && d.date >= from && d.date <= addDays(from, 6),
    ).length ?? 0;
  const pulled =
    streaks && !streaks.fullSyncAt && streaks.pulledAt
      ? new Date(streaks.pulledAt).toLocaleDateString('sv')
      : null;

  return (
    <div className="streaks">
      <div className="streaks__main">
        {frozen && streaks && (
          <Banner
            tone="freeze"
            title={t('streaks.notice.title')}
            onClose={() => onCloseFreezeNotice(frozen.from)}
          >
            {t('streaks.notice.body', {
              range: periodLabel('week', frozen.from, today, locale, t).sub!,
              count: loggedIn(frozen.from),
              n: streaks.streak.freezes,
            })}
          </Banner>
        )}
        {streaks ? (
          <>
            <StreakCard
              streak={streaks.streak}
              days={streaks.days}
              today={today}
            />
            <FreezeCard streak={streaks.streak} />
            {streaks.challenges.length > 0 && (
              <ChallengeList
                challenges={streaks.challenges}
                month={streaks.month}
                today={today}
                done={
                  streaks.months.find((m) => m.month === streaks.month)?.done
                }
              />
            )}
          </>
        ) : (
          <Delayed>
            <p role="status" className="streaks__loading">
              {t('common.loading')}
            </p>
            <div className="wcard">
              <Skeleton width="60%" height="var(--space-6)" />
              <Skeleton height="var(--space-8)" />
              <Skeleton width="40%" height="var(--space-4)" />
            </div>
            <div className="wcard">
              <Skeleton height="var(--trail-week-height)" />
            </div>
          </Delayed>
        )}
      </div>
      {/* D.1: awards (OCT-520) and past months (OCT-502) go here. */}
      <div className="streaks__side">
        {/* 3.4: until OCT-502 puts it in the map card. */}
        {pulled && (
          <p className="streaks__map-note">
            {t('streaks.map_as_of', { date: fmt(pulled) })}
          </p>
        )}
      </div>
      <Sheet
        open={rulesOpen}
        onClose={onCloseRules}
        title={t('streaks.rules.title')}
        footer={
          <Button variant="tonal" onClick={onCloseRules}>
            {t('common.got_it')}
          </Button>
        }
      >
        <ul className="streak-rules">
          <li>
            <i className="streak-rules__streak">
              <Flame aria-hidden="true" />
            </i>
            {t('streaks.rules.week')}
          </li>
          <li>
            <i className="streak-rules__freeze">
              <Snowflake aria-hidden="true" />
            </i>
            {t('streaks.rules.freeze')}
          </li>
          <li>
            <i className="streak-rules__award">
              <Award aria-hidden="true" />
            </i>
            {t('streaks.rules.awards')}
          </li>
        </ul>
        <p className="streak-rules__foot">{t('streaks.rules.foot')}</p>
      </Sheet>
    </div>
  );
}
