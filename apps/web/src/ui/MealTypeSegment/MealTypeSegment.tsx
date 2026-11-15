import { mealTypeSchema, type MealType } from '@oct/shared';
import { useT } from '../../i18n';
import { Segment } from '../Segment/Segment';

type Props = { value: MealType; onChange: (value: MealType) => void };

/** Breakfast · Lunch · Dinner · Snack, one tap to switch (AC-3.10). */
export function MealTypeSegment({ value, onChange }: Props) {
  const { t } = useT();
  const options = mealTypeSchema.options.map((type) => ({
    value: type,
    label: t(`meal.type.${type}`),
  }));
  return (
    <Segment
      label={t('edit.meal_label')}
      options={options}
      value={value}
      onChange={onChange}
    />
  );
}
