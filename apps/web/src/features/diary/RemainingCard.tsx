import type { Macros } from '@oct/shared';
import { ChevronRight, CircleAlert } from 'lucide-react';
import { Link } from 'wouter';
import { useT } from '../../i18n';
import { MacroStat } from '../../ui/MacroStat/MacroStat';
import { ProgressBar } from '../../ui/ProgressBar/ProgressBar';
import './RemainingCard.css';

type Props = {
  /** The day's totals, unrounded. */
  eaten: Macros;
  /** Null without a norm: «Eaten today», grams only, no week line (AC-1.10). */
  norm: Macros | null;
  /** `remainingOf(norm, eaten)` from the caller; negative is over. */
  remaining: Macros | null;
  /** kcal left for the week (negative is over), links to /week (AC-3.9). */
  weekRemainingKcal?: number;
};

const MACROS = [
  ['protein', 'proteinG'],
  ['fat', 'fatG'],
  ['carbs', 'carbsG'],
] as const;

/** Today's total: kcal left or over, the bar, three macros and the week line (OCT-19 §2). */
export function RemainingCard({
  eaten,
  norm,
  remaining,
  weekRemainingKcal,
}: Props) {
  const { t, num } = useT();
  const goal = norm && remaining ? { norm, remaining } : null;
  // Decided on the shown (rounded) number, so exactly the norm reads «0 kcal left» (E-1.1).
  const left = goal && Math.round(goal.remaining.kcal);
  const over = left !== null && left < 0;
  const week =
    weekRemainingKcal === undefined ? null : Math.round(weekRemainingKcal);
  return (
    <section className="remaining" aria-label={t('today.summary')}>
      {goal ? (
        <span
          className={`remaining__label${over ? ' remaining__label--over' : ''}`}
        >
          {over && <CircleAlert aria-hidden="true" />}
          {t(over ? 'today.over' : 'today.left')}
        </span>
      ) : (
        <span className="remaining__label">{t('today.eaten_today')}</span>
      )}
      <span className="remaining__big">
        <span className="remaining__number">
          {num(left === null ? eaten.kcal : Math.abs(left))}
        </span>
        <span className="remaining__unit">{t('today.kcal')}</span>
      </span>
      {goal && (
        <>
          <ProgressBar
            value={eaten.kcal}
            max={goal.norm.kcal}
            label={t('today.kcal')}
            valueText={t('today.eaten_of', {
              eaten: num(eaten.kcal),
              norm: num(goal.norm.kcal),
            })}
          />
          <span className="remaining__of" aria-hidden="true">
            {t('today.eaten_of', {
              eaten: num(eaten.kcal),
              norm: num(goal.norm.kcal),
            })}
          </span>
        </>
      )}
      <div className="remaining__macros">
        {MACROS.map(([macro, key]) => (
          <MacroStat
            key={macro}
            macro={macro}
            value={eaten[key]}
            norm={goal ? goal.norm[key] : null}
            remaining={goal ? goal.remaining[key] : null}
          />
        ))}
      </div>
      {goal && week !== null && (
        <Link
          href="/week"
          className={`remaining__week${week < 0 ? ' remaining__week--over' : ''}`}
        >
          <span>
            {week < 0
              ? t('today.week_over', { n: num(-week) })
              : t('today.week_left', { n: num(week) })}
          </span>
          <ChevronRight aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}
