import { Check } from 'lucide-react';
import type { PhotoRetentionDays } from '@oct/shared';
import { useT } from '../../i18n';
import '../List/List.css';
import { Sheet } from '../Sheet/Sheet';
import './RetentionSheet.css';

export const RETENTION_OPTIONS: PhotoRetentionDays[] = [0, 7, 30, 90, null];

/** «Don't keep», «30 days», «Forever». */
export function useRetentionLabel() {
  const { t } = useT();
  return (days: PhotoRetentionDays) =>
    days === null
      ? t('settings.photos.option.forever')
      : days === 0
        ? t('settings.photos.option.none')
        : t('settings.photos.option.days', { days });
}

type Props = {
  open: boolean;
  value: PhotoRetentionDays;
  /** The screen decides: a shorter period may need the confirm first (OCT-25 §4). */
  onSelect: (days: PhotoRetentionDays) => void;
  onClose: () => void;
};

/** «Keep meal photos»: five periods, 30 days by default (OCT-25 §4). */
export function RetentionSheet({ open, value, onSelect, onClose }: Props) {
  const { t } = useT();
  const label = useRetentionLabel();
  return (
    <Sheet open={open} onClose={onClose} title={t('settings.photos.keep')}>
      <p className="retention-sheet__hint">{t('settings.photos.sheet_hint')}</p>
      <ul
        className="list__rows"
        role="radiogroup"
        aria-label={t('settings.photos.keep')}
      >
        {RETENTION_OPTIONS.map((days) => (
          <li key={String(days)} className="list__item" role="none">
            <button
              type="button"
              role="radio"
              aria-checked={days === value}
              className="list-row list-row--interactive"
              onClick={() => onSelect(days)}
            >
              <span className="list-row__label">
                {label(days)}
                {days === 30 && (
                  <span className="retention-sheet__default">
                    {' · '}
                    {t('settings.photos.default')}
                  </span>
                )}
              </span>
              <span className="retention-sheet__check" aria-hidden="true">
                {days === value && <Check />}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
