import { CircleAlert } from 'lucide-react';
import { useT } from '../../i18n';
import { ProgressBar } from '../ProgressBar/ProgressBar';
import './MacroStat.css';

type Props = {
  macro: 'protein' | 'fat' | 'carbs';
  /** Grams eaten, unrounded. */
  value: number;
  /** Grams per day; null without a norm: grams only, no bar. */
  norm: number | null;
  /** `norm − value` from the caller; shown under the bar in the column variant. */
  remaining?: number | null;
  /** Column: Today / Diary card. Row: Week averages. */
  variant?: 'column' | 'row';
};

/** One macro: name, grams (of the norm), bar and what is left or over. */
export function MacroStat({
  macro,
  value,
  norm,
  remaining = null,
  variant = 'column',
}: Props) {
  const { t, num } = useT();
  const name = t(`macro.${macro}`);
  const left = remaining === null ? null : Math.round(remaining);
  return (
    <div className={`macro macro--${variant}`}>
      <span className="macro__name">
        <i className={`macro__dot macro__dot--${macro}`} aria-hidden="true" />
        {name}
      </span>
      {variant === 'row' ? (
        <span className="macro__value">
          {num(value)} {t('macro.g')}
          {norm !== null && (
            <small> {t('macro.row_of', { norm: num(norm) })}</small>
          )}
        </span>
      ) : (
        <span className="macro__value">
          {num(value)}
          <small>
            {' '}
            {norm === null ? t('macro.g') : t('macro.of', { norm: num(norm) })}
          </small>
        </span>
      )}
      {norm !== null && (
        <ProgressBar value={value} max={norm} tone={macro} label={name} />
      )}
      {variant === 'column' &&
        norm !== null &&
        left !== null &&
        (left < 0 ? (
          <span className="macro__rest macro__rest--over">
            <CircleAlert aria-hidden="true" />
            {t('today.macro.over', { n: num(-left) })}
          </span>
        ) : (
          <span className="macro__rest">
            {t('today.macro.left', { n: num(left) })}
          </span>
        ))}
    </div>
  );
}
