import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { mlToFlOz, WATER_GOAL_ML, type Units } from '@oct/shared';
import { useT } from '../../i18n';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import { Field } from '../../ui/Field/Field';
import { Sheet } from '../../ui/Sheet/Sheet';
import { amountMl } from './AmountSheet';
import { useVolume } from './format';
import './WaterGoalSheet.css';

type Props = {
  /** The goal of today. */
  goalMl: number;
  /** Set by the user, not the reference: the field starts with it and «Reset» shows. */
  manual: boolean;
  referenceMl: number;
  units: Units;
  /** ml, or null to reset; resolves when saved, a rejection keeps the sheet open with an error. */
  onSave: (goalMl: number | null) => Promise<unknown>;
  onClose: () => void;
};

/** OCT-147 4.2: the daily water goal, from today on (AC-4.3, 4.5). The screen mounts it while open. */
export function WaterGoalSheet({
  goalMl,
  manual,
  referenceMl,
  units,
  onSave,
  onClose,
}: Props) {
  const { t, locale } = useT();
  const volume = useVolume(units);
  const shown = (ml: number) => {
    const v = String(units === 'us' ? mlToFlOz(ml) : ml);
    return locale === 'ru' ? v.replace('.', ',') : v;
  };
  const [text, setText] = useState(manual ? shown(goalMl) : '');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const ml = amountMl(text, units, WATER_GOAL_ML);
  const range = t('water.range', {
    min: volume(WATER_GOAL_ML.min),
    max: volume(WATER_GOAL_ML.max),
  });

  const save = async (value: number | null) => {
    setSaving(true);
    setFailed(false);
    try {
      await onSave(value);
    } catch {
      setFailed(true);
      setSaving(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('water.goal.title')}
      footer={
        <Button
          disabled={!ml}
          loading={saving}
          onClick={() => ml && void save(ml)}
        >
          {t('water.goal.save')}
        </Button>
      }
    >
      <form
        className="water-goal"
        onSubmit={(event) => {
          event.preventDefault();
          if (ml && !saving) void save(ml);
        }}
      >
        <Field
          label={t('water.goal.label')}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          data-autofocus
          placeholder={shown(referenceMl)}
          suffix={t(units === 'us' ? 'unit.fl_oz' : 'unit.ml')}
          value={text}
          onChange={(event) => setText(event.target.value)}
          hint={ml === null ? undefined : range}
          error={ml === null ? range : undefined}
        />
        {manual ? (
          <Button
            variant="plain"
            small
            disabled={saving}
            onClick={() => void save(null)}
          >
            <RotateCcw aria-hidden="true" />
            {t('water.goal.reset', { amount: volume(referenceMl) })}
          </Button>
        ) : (
          <p className="water-goal__note">{t('water.goal.disclaimer')}</p>
        )}
        {failed && <Banner tone="danger">{t('water.goal.error')}</Banner>}
      </form>
    </Sheet>
  );
}
