import type { Meal } from '@oct/shared';
import { useT } from '../../i18n';
import { List, ListRow } from '../List/List';
import { Sheet } from '../Sheet/Sheet';
import './MealPickerSheet.css';

type Props = {
  open: boolean;
  /** Meals to offer, newest first; empty ones are left out by the caller. */
  meals: Meal[];
  onPick: (meal: Meal) => void;
  onClose: () => void;
};

/** «From a meal» (OCT-160 1.5): recent meals, a tap opens the recipe editor with them. */
export function MealPickerSheet({ open, meals, onPick, onClose }: Props) {
  const { t, num, locale } = useT();
  const date = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  return (
    <Sheet open={open} title={t('recipes.pick_meal.title')} onClose={onClose}>
      {meals.length ? (
        <List>
          {meals.map((m) => (
            <ListRow
              key={m.clientId}
              description={m.items.map((i) => i.name).join(', ')}
              descriptionNowrap
              value={t('meal.kcal', { n: num(Math.round(m.kcal)) })}
              onClick={() => onPick(m)}
            >
              {`${t(`meal.type.${m.mealType}`)}, ${date.format(new Date(`${m.localDate}T00:00:00Z`))}`}
            </ListRow>
          ))}
        </List>
      ) : (
        <p className="meal-picker__empty">{t('recipes.pick_meal.empty')}</p>
      )}
    </Sheet>
  );
}
