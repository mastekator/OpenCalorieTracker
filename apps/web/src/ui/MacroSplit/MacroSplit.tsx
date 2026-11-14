import { useT } from '../../i18n';
import './MacroSplit.css';

type Props = { protein: number; fat: number; carbs: number };

/** Percent of kcal per macro (4/9/4 kcal per gram); carbs take the rounding rest so they sum to 100. */
export function macroShares({ protein, fat, carbs }: Props) {
  const total = protein * 4 + fat * 9 + carbs * 4;
  if (total <= 0) return { protein: 0, fat: 0, carbs: 0 };
  const p = Math.round((protein * 400) / total);
  // Capped so two .5 round-ups (carbs 0) can't push carbs to -1.
  const f = Math.min(Math.round((fat * 900) / total), 100 - p);
  return { protein: p, fat: f, carbs: 100 - p - f };
}

const MACROS = ['protein', 'fat', 'carbs'] as const;

/** Composition of the goal (OCT-22 §1): one bar split by share of kcal, grams and % under it. Not progress. */
export function MacroSplit(grams: Props) {
  const { t, locale } = useT();
  const shares = macroShares(grams);
  const g = new Intl.NumberFormat(locale, { style: 'unit', unit: 'gram' });
  const pct = new Intl.NumberFormat(locale, { style: 'percent' });
  return (
    <div className="macro-split">
      <div className="macro-split__bar" aria-hidden="true">
        {MACROS.map((m) => (
          <i
            key={m}
            className={`macro-split__seg macro-split__seg--${m}`}
            style={{ flexGrow: shares[m] }}
          />
        ))}
      </div>
      <dl className="macro-split__legend">
        {MACROS.map((m) => (
          <div key={m}>
            <dt className={`macro-split__name macro-split__name--${m}`}>
              {t(`macro.${m}`)}
            </dt>
            <dd className="macro-split__value">
              {g.format(Math.round(grams[m]))}{' '}
              <small>{pct.format(shares[m] / 100)}</small>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
