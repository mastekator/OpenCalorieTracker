import type { Meal } from '@oct/shared';
import { useState } from 'react';
import { Moon, Trash2, Utensils } from 'lucide-react';
import { useT } from '../../i18n';
import { Badge } from '../../ui/Badge/Badge';
import { isLate, localClock } from './mealTime';
import './MealRow.css';

type Props = {
  meal: Meal;
  /** Opens the meal for editing (screen 4). */
  onOpen: () => void;
  /** Desktop: a trash button instead of swipe (OCT-19 D.2). */
  onDelete?: () => void;
};

/** A meal in a `List` on Today / Diary: thumbnail, type, time, dishes, kcal. */
export function MealRow({ meal, onOpen, onDelete }: Props) {
  const { t, num, locale } = useT();
  // A preview that fails to load (offline, not cached) falls back to the icon.
  const [broken, setBroken] = useState(false);
  const type = t(`meal.type.${meal.mealType}`);
  const time = new Intl.DateTimeFormat(locale, {
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(localClock(meal));
  return (
    <li className="list__item meal-row">
      <button
        type="button"
        className="list-row list-row--interactive meal-row__open"
        onClick={onOpen}
      >
        {meal.photo && !broken ? (
          <img
            className="meal-row__thumb"
            src={`/api/photos/${encodeURIComponent(meal.photo.id)}?size=preview`}
            alt=""
            loading="lazy"
            onError={() => setBroken(true)}
          />
        ) : (
          <span className="meal-row__thumb meal-row__thumb--icon">
            <Utensils aria-hidden="true" />
          </span>
        )}
        <span className="meal-row__main">
          <span className="meal-row__title">
            {type}
            <span className="meal-row__time">{time}</span>
          </span>
          <span className="meal-row__dishes">
            {meal.items.map((item) => item.name).join(', ')}
          </span>
          {isLate(meal) && (
            <span className="meal-row__badges">
              <Badge>
                <Moon aria-hidden="true" />
                {t('meal.status.late')}
              </Badge>
            </span>
          )}
        </span>
        <span className="meal-row__kcal">
          {t('meal.kcal', { n: num(meal.kcal) })}
        </span>
      </button>
      {onDelete && (
        <button
          type="button"
          className="meal-row__trash"
          aria-label={t('meal.delete', { meal: type })}
          onClick={onDelete}
        >
          <Trash2 aria-hidden="true" />
        </button>
      )}
    </li>
  );
}
