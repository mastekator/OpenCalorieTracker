import type { DishUnit, IllustrationId, Units } from '@oct/shared';
import { useT } from '../../i18n';
import { Button } from '../Button/Button';
import { DishIllustration } from '../DishIllustration/DishIllustration';
import { useWeight } from '../weightUnits';
import './HistoryHint.css';

type Props = {
  /** When the previous dish was eaten, ISO. */
  eatenAt: string;
  /** In `unit`: millilitres for a drink (ADR-0038). */
  grams: number;
  unit?: DishUnit;
  kcal: number;
  /** Of the previous entry (OCT-33). */
  illustration: IllustrationId;
  units: Units;
  /** «Same as last time»: take the previous weight, kcal and macros. */
  onApply: () => void;
  /** «Keep estimate»: hide the hint. */
  onKeep: () => void;
};

/** «Looks like your entry from 12 Nov: 250 g · 420 kcal» under a dish row (OCT-16 4.3). Needs no answer. */
export function HistoryHint({
  eatenAt,
  grams,
  unit,
  kcal,
  illustration,
  units,
  onApply,
  onKeep,
}: Props) {
  const { t, num, locale } = useT();
  const weight = useWeight(units, unit).text(grams);
  const date = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
  }).format(new Date(eatenAt));
  return (
    <div className="history-hint">
      <p className="history-hint__text tabular-nums">
        <DishIllustration id={illustration} size="var(--hint-illo-size)" />
        {t('edit.history.hint', { date, weight, kcal: num(kcal) })}
      </p>
      <div className="history-hint__actions">
        <Button variant="plain" small onClick={onApply}>
          {t('edit.history.apply')}
        </Button>
        <span className="history-hint__keep">
          <Button variant="plain" small onClick={onKeep}>
            {t('edit.history.keep')}
          </Button>
        </span>
      </div>
    </div>
  );
}
