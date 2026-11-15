import type { Macros } from '@oct/shared';
import { useT } from '../../i18n';
import { MacroStat } from '../../ui/MacroStat/MacroStat';
import './WeekCards.css';

type Props = {
  /** `summarize().average`: over the days with meals only (AC-3.4). */
  average: Macros;
  daysWithMeals: number;
  /** Null without a norm: grams only (7.5). */
  norm: Macros | null;
};

const MACROS = [
  ['protein', 'proteinG'],
  ['fat', 'fatG'],
  ['carbs', 'carbsG'],
] as const;

/** «Daily average · over 4 days with entries»: three macro rows (AC-3.3, OCT-19 §4). */
export function MacroAveragesCard({ average, daysWithMeals, norm }: Props) {
  const { t } = useT();
  return (
    <section className="wcard" aria-label={t('week.avg.title')}>
      <div className="wcard__head">
        <h2 className="wcard__title">{t('week.avg.title')}</h2>
        <span className="wcard__note">
          {t('week.avg.note', { count: daysWithMeals })}
        </span>
      </div>
      {MACROS.map(([macro, key]) => (
        <MacroStat
          key={macro}
          macro={macro}
          value={average[key]}
          norm={norm ? norm[key] : null}
          variant="row"
        />
      ))}
    </section>
  );
}
