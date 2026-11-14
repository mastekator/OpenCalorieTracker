import { Check } from 'lucide-react';
import { ACTIVITY_FACTORS, activitySchema, type Activity } from '@oct/shared';
import { useT } from '../../i18n';
import '../List/List.css';
import { Sheet } from '../Sheet/Sheet';
import './ActivitySheet.css';

type Props = {
  open: boolean;
  value: Activity | null;
  /** A choice is final: the screen sets it and closes the sheet (8.7). */
  onSelect: (value: Activity) => void;
  onClose: () => void;
};

/** Five activity levels with name, description and the factor (OCT-22 8.7). */
export function ActivitySheet({ open, value, onSelect, onClose }: Props) {
  const { t, locale } = useT();
  const factor = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });
  return (
    <Sheet open={open} onClose={onClose} title={t('activity.title')}>
      <p className="activity-sheet__hint">{t('activity.hint')}</p>
      <ul
        className="list__rows"
        role="radiogroup"
        aria-label={t('activity.title')}
      >
        {activitySchema.options.map((level) => (
          <li key={level} className="list__item" role="none">
            <button
              type="button"
              role="radio"
              aria-checked={level === value}
              className="list-row list-row--interactive"
              onClick={() => onSelect(level)}
            >
              <span className="list-row__label">
                <b>{t(`activity.${level}.name`)}</b>
                <span className="list-row__description">
                  {t(`activity.${level}.desc`)}{' '}
                  <span className="activity-sheet__factor">
                    · ×{factor.format(ACTIVITY_FACTORS[level])}
                  </span>
                </span>
              </span>
              <span className="activity-sheet__check" aria-hidden="true">
                {level === value && <Check />}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
