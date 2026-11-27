import { Award, Flame, Snowflake } from 'lucide-react';
import { useT } from '../../i18n';
import { Button } from '../../ui/Button/Button';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import { Sheet } from '../../ui/Sheet/Sheet';
import { Delayed, Skeleton } from '../../ui/Skeleton/Skeleton';
import type { Streaks } from '../../data/streaks';
import { StreakCard } from './StreakCard';
import '../week/WeekCards.css';
import './Streaks.css';

type Props = {
  /** Undefined while the local copy is read (3.5). */
  streaks: Streaks | undefined;
  today: string;
  rulesOpen: boolean;
  onCloseRules: () => void;
  onEnable: () => void;
};

/** `/week/streaks` (OCT-184 §2, §3, D.1): the streak card; from 1024px a second column is kept for awards and past months. */
export function StreaksScreen({
  streaks,
  today,
  rulesOpen,
  onCloseRules,
  onEnable,
}: Props) {
  const { t } = useT();
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

  return (
    <div className="streaks">
      <div className="streaks__main">
        {streaks ? (
          <StreakCard
            streak={streaks.streak}
            days={streaks.days}
            today={today}
          />
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
      <div className="streaks__side" />
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
