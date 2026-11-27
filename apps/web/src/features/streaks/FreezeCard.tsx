import { Snowflake } from 'lucide-react';
import { MAX_FREEZES, type StreakState } from '@oct/shared';
import { useT } from '../../i18n';
import '../week/WeekCards.css';
import './Streaks.css';

type Props = { streak: StreakState };

/** Freezes card (OCT-184 2.1, 3.1): two snowflakes, «Freezes: 1 of 2» and the weeks to the next one. */
export function FreezeCard({ streak }: Props) {
  const { t } = useT();
  const { freezes, weeksToFreeze, best } = streak;
  const sub =
    weeksToFreeze === null
      ? t('streaks.freeze.cap')
      : best === 0
        ? t('streaks.freeze.gift')
        : t('streaks.freeze.next', { count: weeksToFreeze });
  const count = t('streaks.freeze.count', { n: freezes });
  return (
    <section className="wcard freeze" aria-label={count}>
      <span className="freeze__flakes" aria-hidden="true">
        {Array.from({ length: MAX_FREEZES }, (_, i) => (
          <i key={i} className={i < freezes ? undefined : 'freeze__empty'}>
            <Snowflake />
          </i>
        ))}
      </span>
      <span className="freeze__main">
        <span>{count}</span>
        <span className="streak__sub">{sub}</span>
      </span>
    </section>
  );
}
